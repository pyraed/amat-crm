// ─────────────────────────────────────────────────────────────────────────────
//  HOOKS · USE REALTIME
//  Suscripciones Supabase Realtime a los 3 canales del sistema:
//  amat_messages, amat_loan_leads, amat_consultas.
//
//  Por qué existe: los 3 canales realtime con toda su lógica de reactivación
//  y sincronización de estado vivían en useEffects dentro de BandejaClient.
//  Este hook los encapsula y expone solo los setters que necesita.
//
//  Qué ocurriría si desaparece: el CRM dejaría de recibir actualizaciones
//  en tiempo real — los operadores no verían mensajes nuevos ni cambios
//  de estado de otros operadores sin recargar la página.
//
//  NOTA: Este hook contiene la lógica de reactivación de leads (la más
//  sensible del sistema). No modificar sin prueba exhaustiva.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { LoanLead, Message } from '@/lib/types'
import { SysUser } from '@/domain/entities/users'
import { ESTADOS_FINALES } from '@/domain/entities/leadStatus'
import { reactivarLead, fetchCerradosMes, fetchInboundMes } from '@/services/lead.service'
import { syncConsultaEstado, fetchFlujoMap } from '@/services/consulta.service'

type Setters = {
  setMessages:        React.Dispatch<React.SetStateAction<Message[]>>
  setCurrentChatMsgs: React.Dispatch<React.SetStateAction<Message[]>>
  setBotLeads:        React.Dispatch<React.SetStateAction<LoanLead[]>>
  setColaLeadsState:  React.Dispatch<React.SetStateAction<LoanLead[]>>
  setColaTotal:       React.Dispatch<React.SetStateAction<number>>
  setFlujoMap:        React.Dispatch<React.SetStateAction<Record<string,string>>>
  setConsultas:       React.Dispatch<React.SetStateAction<any[]>>
  setBaseLeads:       React.Dispatch<React.SetStateAction<LoanLead[]>>
}

export function useRealtime(
  me: SysUser | null,
  setters: Setters,
  callbacks: {
    onCerradosMesChange: (n: number) => void
    onInboundMesChange:  (n: number) => void
  }
) {
  const {
    setMessages, setCurrentChatMsgs, setBotLeads,
    setColaLeadsState, setColaTotal, setFlujoMap,
    setConsultas, setBaseLeads,
  } = setters
  const { onCerradosMesChange, onInboundMesChange } = callbacks

  // meRef permite que los closures del realtime accedan al usuario actual
  // sin capturar el valor stale del estado React
  const meRef = useRef<SysUser|null>(null)
  useEffect(()=>{ meRef.current = me },[me])

  // ── Canal: mensajes nuevos ────────────────────────────────────────────────
  useEffect(()=>{
    const ch = supabase.channel('rt-msgs')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'amat_messages' }, p=>{
        const msg = p.new as Message

        // Actualizar lista global de mensajes
        setMessages(prev=>{
          if(prev.find(m=>m.id===msg.id)) return prev
          if(msg.direction==='out') {
            const sinTemp = prev.filter(m=>!(String(m.id).startsWith('temp_')&&m.phone_number===msg.phone_number&&m.body===msg.body))
            return [...sinTemp, msg]
          }
          return [...prev, msg]
        })

        // Actualizar chat activo si el mensaje es de esa conversación
        setCurrentChatMsgs(prev=>{
          if(prev.length===0||prev[0]?.phone_number!==msg.phone_number) return prev
          if(prev.find(m=>m.id===msg.id)) return prev
          if(msg.direction==='out') {
            const sinTemp = prev.filter(m=>!(String(m.id).startsWith('temp_')&&m.body===msg.body))
            return [...sinTemp, msg]
          }
          return [...prev, msg]
        })

        // Solo procesar lógica de leads para mensajes ENTRANTES.
        // Los mensajes salientes (campañas, respuestas del operador) no deben mover leads a la cola.
        if(msg.direction !== 'in') return

        // Manejar el lead asociado al mensaje entrante
        setBotLeads(prev=>{
          if(!prev.find(l=>l.phone_number===msg.phone_number)){
            supabase.from('amat_loan_leads')
              .select('*').eq('phone_number', msg.phone_number).single()
              .then(({data})=>{
                if(!data) return
                const lead   = data as LoanLead
                const status = (lead.status || '') as string

                // Reactivación caso 1: lead en estado final (not_interested, sin_respuesta, unresolved)
                // closed/rejected → NUNCA se reactivan
                if(ESTADOS_FINALES.includes(status)) {
                  if(status === 'closed' || status === 'rejected') return
                  reactivarLead(lead.id, lead.phone_number).then(res => {
                    if(!res.ok) return
                    const r = {...lead, status:'new' as any, archived:false, assigned_to:null}
                    setColaLeadsState(p2=>p2.find(l=>l.id===lead.id)?p2:[r as LoanLead,...p2])
                    setColaTotal(t=>t+1)
                  })
                  fetchFlujoMap([msg.phone_number]).then(map => setFlujoMap(prev=>({...prev,...map})))
                  return
                }

                // Reactivación caso 2: lead archivado por campaña (status: new, archived: true)
                // La persona respondió la campaña → desarchivar y poner en cola
                if((lead as any).archived && status === 'new') {
                  reactivarLead(lead.id, lead.phone_number).then(res => {
                    if(!res.ok) return
                    const r = {...lead, status:'new' as any, archived:false, assigned_to:null}
                    setColaLeadsState(p2=>p2.find(l=>l.id===lead.id)?p2:[r as LoanLead,...p2])
                    setColaTotal(t=>t+1)
                  })
                  fetchFlujoMap([msg.phone_number]).then(map => setFlujoMap(prev=>({...prev,...map})))
                  return
                }

                // Lead activo normal — gestionar según si tiene asignado o no
                if((lead as any).archived) return
                if(lead.assigned_to) {
                  setBotLeads(prev => {
                    const existe = prev.find(l => l.phone_number === lead.phone_number)
                    if(existe) return prev.map(l => l.phone_number === lead.phone_number ? lead : l)
                    if(lead.assigned_to === meRef.current?.username) return [...prev, lead]
                    return prev
                  })
                  return
                }
                // Sin dueño y no archivado → va a cola
                setColaLeadsState(p2=>p2.find(l=>l.phone_number===lead.phone_number)?p2:[lead,...p2])
                setColaTotal(t=>t+1)
                fetchFlujoMap([msg.phone_number]).then(map => setFlujoMap(prev=>({...prev,...map})))
              })
          }
          return prev
        })
      }).subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[]) // eslint-disable-line

  // ── Canal: cambios en leads ───────────────────────────────────────────────
  useEffect(()=>{
    const EXCLUIDOS = ['finalizado','rejected','not_interested','resolved','unresolved','sin_respuesta','closed']
    const ch = supabase.channel('rt-leads')
      .on('postgres_changes', { event:'*', schema:'public', table:'amat_loan_leads' }, p=>{
        const updated = p.new as LoanLead
        if(p.eventType==='UPDATE'){
          if(EXCLUIDOS.includes(updated.status||'') || (updated as any).archived){
            // Lead finalizado → sacar de bandeja
            setBotLeads(prev=>{
              if(!prev.find(l=>l.id===updated.id)) return prev
              return prev.filter(l=>l.id!==updated.id)
            })
            // Lead finalizado → sacar de cola si estaba ahí
            let estabaEnColaFinalizado = false
            setColaLeadsState(prev=>{
              estabaEnColaFinalizado = !!prev.find(l=>l.id===updated.id)
              return prev.filter(l=>l.id!==updated.id)
            })
            if(estabaEnColaFinalizado) setColaTotal(t=>Math.max(0,t-1))
            // Re-fetch cerrados del mes si el lead pasó a closed o resolved
            if(updated.status === 'closed' || updated.status === 'resolved') {
              fetchCerradosMes().then(onCerradosMesChange)
            }
          } else {
            // Lead activo → actualizar en bandeja, agregar si es del usuario actual
            setBotLeads(prev=>{
              const existe = prev.find(l=>l.id===updated.id)
              if(existe) return prev.map(l=>l.id===updated.id?updated:l)
              if(updated.assigned_to && updated.assigned_to === meRef.current?.username) {
                return [...prev, updated]
              }
              return prev
            })
            // Si el lead fue asignado → sacarlo de la cola de todos los operadores
            if(updated.assigned_to) {
              let estabaEnCola = false
              setColaLeadsState(prev=>{
                estabaEnCola = !!prev.find(l=>l.id===updated.id)
                return prev.filter(l=>l.id!==updated.id)
              })
              if(estabaEnCola) setColaTotal(t=>Math.max(0,t-1))
            }
          }
          // Siempre actualizar en la base
          setBaseLeads(prev=>prev.map(l=>l.id===updated.id?updated:l))
        } else if(p.eventType==='INSERT'){
          // Re-fetch inbound del mes ante cualquier lead nuevo
          fetchInboundMes().then(onInboundMesChange)
          // Lead nuevo sin asignar → a la cola SOLO si el cliente ya nos escribió
          // Esto evita que leads de campaña (solo mensajes salientes) aparezcan en cola
          if(['new','contacted'].includes(updated.status||'') && !(updated as any).archived && !updated.assigned_to && updated.phone_number) {
            supabase.from('amat_messages')
              .select('id', { count: 'exact', head: true })
              .eq('phone_number', updated.phone_number)
              .eq('direction', 'in')
              .limit(1)
              .then(({ count }) => {
                if((count || 0) > 0) {
                  setColaLeadsState(prev => prev.find(l=>l.id===updated.id) ? prev : [updated as LoanLead, ...prev])
                  setColaTotal(t => t + 1)
                }
              })
          }
        }
      }).subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[]) // eslint-disable-line

  // ── Canal: cambios en consultas ───────────────────────────────────────────
  useEffect(()=>{
    const ch = supabase.channel('rt-consultas')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'amat_consultas' }, p=>{
        setConsultas(prev=>[p.new as any,...prev])
        const c = p.new as any
        if(c.phone) setFlujoMap(prev=>({...prev,[c.phone]:c.flujo||'solicitud'}))
      })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'amat_consultas' }, p=>{
        setConsultas(prev=>prev.map(c=>c.id===(p.new as any).id?p.new as any:c))
        const c = p.new as any
        if(c.phone) setFlujoMap(prev=>({...prev,[c.phone]:c.flujo||'solicitud'}))
      })
      .subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[]) // eslint-disable-line

  return { meRef }
}
