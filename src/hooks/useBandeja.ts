// ─────────────────────────────────────────────────────────────────────────────
//  HOOKS · USE BANDEJA
//  Maneja el estado de la bandeja: leads activos, cola, flujoMap,
//  y las acciones de tomar conversación y cambiar estado.
//
//  Por qué existe: botLeads, colaLeadsState, flujoMap, cambiarEstado y
//  tomarConversacion vivían todos en BandejaClient sin separación clara.
//
//  Qué ocurriría si desaparece: la bandeja dejaría de mostrar leads
//  y el operador no podría tomar ni cerrar conversaciones.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { LoanLead, Message } from '@/lib/types'
import { SysUser } from '@/domain/entities/users'
import { ESTADOS_FINALES } from '@/domain/entities/leadStatus'
import {
  fetchBandejaLeads, fetchCerradosMes, fetchInboundMes,
  cambiarEstadoLead, tomarLead,
} from '@/services/lead.service'
import { fetchFlujoMap } from '@/services/consulta.service'

const LIMITE_BANDEJA = 50
const ESTADOS_FINALES_BANDEJA = ['finalizado','closed','rejected','not_interested','resolved','unresolved','sin_respuesta']

export function useBandeja(
  me: SysUser | null,
  tab: string,
  messages: Message[],
  initialMessages: Message[],
  setSelectedPhone: (p: string | null) => void,
  setVistaMode: (m: 'cola' | 'mis_chats') => void,
  cargarMensajes: (phone: string) => void,
) {
  const [botLeads, setBotLeads]             = useState<LoanLead[]>([])
  const [colaLeadsState, setColaLeadsState] = useState<LoanLead[]>([])
  const [colaTotal, setColaTotal]           = useState(0)
  const [colaPage, setColaPage]             = useState(50)
  const [colaMenu, setColaMenu]             = useState<LoanLead|null>(null)
  const [colaMenuRef, setColaMenuRef]       = useState<{x:number,y:number}|null>(null)
  const [flujoMap, setFlujoMap]             = useState<Record<string,string>>({})
  const [cerradosMesCount, setCerradosMesCount] = useState(0)
  const [inboundMesCount, setInboundMesCount]   = useState(0)
  const [bandejaSearch, setBandejaSearch]   = useState('')
  const [soloNoLeidos, setSoloNoLeidos]     = useState(false)
  const [editandoFlujo, setEditandoFlujo]   = useState(false)

  // Carga inicial desde los initialMessages del SSR
  useEffect(()=>{
    fetchCerradosMes().then(n => setCerradosMesCount(n))
    fetchInboundMes().then(n => setInboundMesCount(n))

    const phones = [...new Set(initialMessages.map(m=>m.phone_number))].filter(Boolean)
    if(phones.length === 0) return

    const BATCH = 200
    const chunks = (arr: string[]) =>
      Array.from({length: Math.ceil(arr.length/BATCH)}, (_,i) => arr.slice(i*BATCH,(i+1)*BATCH))

    // Cargar leads activos de los phones con mensajes — solo los del operador actual
    // Los leads de otros operadores no deben entrar en botLeads
    Promise.all(chunks(phones).map(chunk =>
      import('@/lib/supabase').then(({supabase}) =>
        supabase.from('amat_loan_leads')
          .select('*')
          .in('phone_number', chunk)
          .not('status', 'in', '("finalizado","rejected","not_interested","resolved","unresolved","sin_respuesta","closed")')
          .eq('archived', false)
          .is('assigned_to', null)  // solo sin asignar en carga inicial
          .then(({data}) => data || [])
      )
    )).then(results => {
      const all = results.flat() as LoanLead[]
      const seen = new Set<string>()
      const unique = all.filter(l => {
        const key = l.phone_number || String(l.id)
        if(seen.has(key)) return false
        seen.add(key)
        return true
      })
      setBotLeads(prev => {
        const merged = [...unique]
        prev.forEach(l => { if(!merged.find(x=>x.id===l.id)) merged.push(l) })
        return merged
      })
    })

    // Cargar flujoMap inicial
    fetchFlujoMap(phones).then(map => setFlujoMap(map))
  },[initialMessages]) // eslint-disable-line

  // Cargar leads asignados + cola al entrar al tab de bandeja
  useEffect(()=>{
    if(tab !== 'bandeja' || !me) return
    let cancelado = false

    ;(async () => {
      const { asignados, cola, colaTotal: total } = await fetchBandejaLeads(me.username)
      if(cancelado) return

      setColaTotal(total)
      if(asignados.length) {
        setBotLeads(prev => {
          const merged = [...prev]
          asignados.forEach(lead => {
            if(!merged.find(l=>l.id===lead.id)) merged.push(lead)
          })
          return merged
        })
      }
      if(cola.length) {
        const phonesCol = cola.map(l=>l.phone_number).filter(Boolean) as string[]
        if(phonesCol.length) {
          fetchFlujoMap(phonesCol).then(map => {
            if(cancelado) return
            setFlujoMap(prev=>({...prev,...map}))
          })
        }
        setColaLeadsState(cola)
      }
    })()

    return () => { cancelado = true }
  },[tab, me]) // eslint-disable-line

  // ── Datos derivados ───────────────────────────────────────────────────────

  // Deduplicar allLeads como red de seguridad final
  const seenLeads = new Set<string>()
  const allLeads = botLeads.filter(l => {
    const key = l.phone_number || String(l.id)
    if(seenLeads.has(key)) return false
    seenLeads.add(key)
    return true
  })

  const phonesConMensajes = [...new Set(messages.map(m=>m.phone_number))]

  const bandejaLeads = allLeads.filter(l => {
    if(!l.phone_number) return false
    // Mostrar si: tiene mensajes en memoria, está asignado al operador actual,
    // o acaba de ser tomado (status contacted con assigned_to recién seteado)
    const tieneMsg    = phonesConMensajes.includes(l.phone_number)
    const esDelOp     = l.assigned_to === me?.username
    const recienTomado = ['contacted','contactado'].includes(l.status||'') && l.assigned_to === me?.username
    // Si está asignado a OTRO operador, nunca mostrar en esta bandeja
    if(l.assigned_to && l.assigned_to !== me?.username) return false
    if(!tieneMsg && !esDelOp && !recienTomado) return false
    if(ESTADOS_FINALES_BANDEJA.includes(l.status||'')) return false
    const q = bandejaSearch.toLowerCase()
    const m = !q || (l.full_name||'').toLowerCase().includes(q) || (l.phone_number||'').includes(q) || (l.dni||'').includes(q)
    if(soloNoLeidos) {
      const hasUnread = messages.some(msg =>
        msg.phone_number === l.phone_number &&
        msg.direction === 'in' &&
        new Date(msg.created_at) > new Date(l.updated_at)
      )
      if(!hasUnread) return false
    }
    return m
  }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  // ── Acciones ──────────────────────────────────────────────────────────────

  const cambiarEstado = async (
    lead: LoanLead,
    nuevoStatus: string,
    opts?: { notes?: string; situacion?: string; extraFields?: Record<string,any> }
  ) => {
    const { ok, esFinal } = await cambiarEstadoLead(lead, nuevoStatus, opts)
    if(!ok) { alert('❌ No se pudo cambiar el estado. Intentá de nuevo.'); return }

    const upd: any = {
      status:     nuevoStatus,
      updated_at: new Date().toISOString(),
      ...(esFinal && { archived: true }),
      ...(opts?.notes !== undefined && { notes: opts.notes }),
      ...(opts?.extraFields || {}),
    }

    if(esFinal) {
      setBotLeads(prev => prev.filter(l => l.id !== lead.id))
      if(nuevoStatus === 'closed' || nuevoStatus === 'resolved') {
        fetchCerradosMes().then(n => setCerradosMesCount(n))
      }
      // No limpiamos selectedPhone acá — el componente que llama lo hace
      // después de terminar su flujo (ej: guardarVenta cierra el modal primero)
    } else {
      setBotLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...upd } : l))
      setColaLeadsState(prev => prev.map(l => l.id === lead.id ? { ...l, ...upd } : l))
    }
  }

  const updateStatus = async (id: number, status: string, notes?: string) => {
    const lead = bandejaLeads.find(l=>l.id===id) || colaLeadsState.find(l=>l.id===id)
    if(!lead) {
      const { ok } = await cambiarEstadoLead({ id } as LoanLead, status, { notes })
      if(!ok) alert('❌ No se pudo actualizar el estado. Intentá de nuevo.')
      return
    }
    await cambiarEstado(lead, status, { notes })
  }

  const tomarConversacion = async (lead: LoanLead) => {
    if(!me) return
    const misActivas = bandejaLeads.filter(l =>
      l.assigned_to === me.username &&
      !ESTADOS_FINALES_BANDEJA.includes(l.status||'')
    ).length
    if(misActivas >= LIMITE_BANDEJA) {
      alert(`Tenés ${misActivas} conversaciones activas. El límite es ${LIMITE_BANDEJA}. Cerrá alguna antes de tomar una nueva.`)
      return
    }

    const res = await tomarLead(lead, me.username)
    if(!res.ok) {
      if(res.tomadoPor) {
        alert(`Este lead ya fue tomado por ${res.tomadoPor}.`)
      } else {
        alert('❌ No se pudo tomar la conversación. Intentá de nuevo.')
      }
      return
    }

    setColaTotal(t => Math.max(0, t - 1))
    setColaLeadsState(prev => prev.filter(l => l.id !== lead.id))
    setBotLeads(prev => {
      const existe = prev.find(l => l.id === lead.id)
      if(existe) return prev.map(l => l.id === lead.id ? { ...l, assigned_to: me.username, status: 'contacted' } : l)
      return [...prev, { ...lead, assigned_to: me.username, status: 'contacted' }]
    })
    setSelectedPhone(lead.phone_number)
    setVistaMode('mis_chats')
    if(lead.phone_number) cargarMensajes(lead.phone_number)
  }

  return {
    botLeads, setBotLeads,
    allLeads, bandejaLeads,
    colaLeadsState, setColaLeadsState,
    colaTotal, setColaTotal,
    colaPage, setColaPage,
    colaMenu, setColaMenu,
    colaMenuRef, setColaMenuRef,
    flujoMap, setFlujoMap,
    cerradosMesCount, setCerradosMesCount,
    inboundMesCount, setInboundMesCount,
    bandejaSearch, setBandejaSearch,
    soloNoLeidos, setSoloNoLeidos,
    editandoFlujo, setEditandoFlujo,
    cambiarEstado,
    updateStatus,
    tomarConversacion,
  }
}
