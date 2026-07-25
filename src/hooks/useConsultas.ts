// ─────────────────────────────────────────────────────────────────────────────
//  HOOKS · USE CONSULTAS
//  Maneja el tab de consultas: estado, filtros, carga y acciones del modal.
//
//  Optimización: los datos se cachean en memoria — cambiar de tab y volver
//  no relanza la query si los filtros no cambiaron. Solo relanza cuando:
//    - Los filtros cambian (search, flujo, estado, rep, orden)
//    - Se llama loadConsultas() explícitamente (ej: después de guardar)
//    - Es la primera vez que se entra al tab en la sesión
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { fetchConsultas, fetchCampanasRecientes } from '@/services/consulta.service'

export function useConsultas(tab: string, flujoMap: Record<string,string>) {
  const [consultas, setConsultas]               = useState<any[]>([])
  const [consultasLoading, setConsultasLoading] = useState(false)
  const [consultasTotal, setConsultasTotal]     = useState(0)
  const [consultaSelected, setConsultaSelected] = useState<any|null>(null)
  const [showConsultaModal, setShowConsultaModal] = useState(false)
  const [consultaEdit, setConsultaEdit]         = useState({vendedor:'',situacion:'',estado:'pendiente'})
  const [campanas, setCampanas]                 = useState<Record<string,string>>({})

  // Filtros
  const [cFlujo, setCFlujo]   = useState('all')
  const [cEstado, setCEstado] = useState('all')
  const [cOrden, setCOrden]   = useState<'desc'|'asc'>('desc')
  const [cRep, setCRep]       = useState('all')
  const [cSearch, setCSearch] = useState('')
  const [cSearchInput, setCSearchInput] = useState('')

  // Refs para evitar stale closures en la función async
  const cSearchRef = useRef(cSearch)
  const cFlujoRef  = useRef(cFlujo)
  const cEstadoRef = useRef(cEstado)
  const cRepRef    = useRef(cRep)
  const cOrdenRef  = useRef(cOrden)
  const loadConsultasSeq = useRef(0)
  const consultasTimer   = useRef<ReturnType<typeof setTimeout>|null>(null)

  // Cache: si ya cargamos al menos una vez, no volver a cargar al cambiar de tab
  const cargadoRef = useRef(false)

  useEffect(()=>{ cSearchRef.current = cSearch },[cSearch])
  useEffect(()=>{ cFlujoRef.current  = cFlujo  },[cFlujo])
  useEffect(()=>{ cEstadoRef.current = cEstado },[cEstado])
  useEffect(()=>{ cRepRef.current    = cRep    },[cRep])
  useEffect(()=>{ cOrdenRef.current  = cOrden  },[cOrden])

  const loadConsultas = async (
    repOverride?: string,
    flujoOverride?: string,
    estadoOverride?: string,
    searchOverride?: string,
  ) => {
    setConsultasLoading(true)
    const seq    = ++loadConsultasSeq.current
    const search = searchOverride ?? cSearchRef.current
    const flujo  = flujoOverride  ?? cFlujoRef.current
    const estado = estadoOverride ?? cEstadoRef.current
    const rep    = repOverride    ?? cRepRef.current

    let data: any[] = []
    let leadsData: any[] = []
    let count = 0

    try {
      const result = await fetchConsultas({ search, flujo, estado, rep, orden: cOrdenRef.current })
      if(seq !== loadConsultasSeq.current) return
      data      = result.consultas
      leadsData = result.leadsData
      count     = result.count
    } catch(e: any) {
      if(seq !== loadConsultasSeq.current) return
      console.error('[useConsultas] Error:', e)
      alert('❌ Error al cargar las consultas. Intentá de nuevo.')
      setConsultasLoading(false)
      return
    }

    setConsultasTotal(count)

    const phonesConConsulta = new Set(data.map((c:any) => c.phone).filter(Boolean))
    const statusMap: Record<string,string> = {
      new:'cola', contacted:'pendiente', contactado:'contactado',
      closed:'resuelto', resolved:'resuelto', rejected:'cerrado_rechazado',
      not_interested:'cerrado_no_interesado', sin_respuesta:'cerrado',
      unresolved:'cerrado', finalizado:'cerrado'
    }

    const sinConsulta = leadsData
      .filter((l:any) => l.phone_number && !phonesConConsulta.has(l.phone_number))
      .map((l:any) => ({
        id: `lead_${l.id}`,
        phone: l.phone_number,
        nombre_apellido: l.full_name,
        dni: l.dni,
        reparticion_label: l.reparticion,
        flujo: flujoMap[l.phone_number||'']||'solicitud',
        prestacion: null, afiliado: null,
        vendedor: l.assigned_to, situacion: null,
        estado: statusMap[l.status||''] || l.status,
        created_at: l.created_at,
        _esLeadSinConsulta: true,
      }))
      .filter((c:any) => flujo === 'all' || c.flujo === flujo)
      .filter((c:any) => estado === 'all' || c.estado === estado)

    const todasConsultas = [...sinConsulta, ...data]
    const seenPhones = new Map<string, any>()
    for(const c of todasConsultas) {
      const phone = c.phone || ''
      if(!phone) continue
      const existing = seenPhones.get(phone)
      if(!existing || new Date(c.created_at||0) > new Date(existing.created_at||0)) {
        seenPhones.set(phone, c)
      }
    }
    const ordenadas = [...seenPhones.values()].sort((a:any,b:any)=>{
      const ta = new Date(a.created_at||0).getTime()
      const tb = new Date(b.created_at||0).getTime()
      return cOrdenRef.current === 'asc' ? ta - tb : tb - ta
    })
    setConsultas(ordenadas)
    cargadoRef.current = true
    setConsultasLoading(false)
  }

  // Efecto 1: cambio de tab — solo carga si es la primera vez en la sesión
  useEffect(()=>{
    if(tab !== 'consultas') return
    if(cargadoRef.current) return  // ya hay datos en memoria, no recargar
    if(consultasTimer.current) clearTimeout(consultasTimer.current)
    consultasTimer.current = setTimeout(()=>{
      loadConsultas()
      fetchCampanasRecientes(60).then(map => setCampanas(map))
    }, 50)
    return ()=>{ if(consultasTimer.current) clearTimeout(consultasTimer.current) }
  },[tab]) // eslint-disable-line

  // Efecto 2: cambio de filtros — siempre recarga porque los datos cambiarían
  useEffect(()=>{
    if(tab !== 'consultas') return
    if(!cargadoRef.current) return  // la primera carga la maneja el efecto 1
    setCSearchInput(cSearch)
    if(consultasTimer.current) clearTimeout(consultasTimer.current)
    consultasTimer.current = setTimeout(()=>{
      loadConsultas(cRep, cFlujo, cEstado, cSearch)
    }, 300)
    return ()=>{ if(consultasTimer.current) clearTimeout(consultasTimer.current) }
  },[cSearch, cFlujo, cEstado, cRep, cOrden]) // eslint-disable-line

  return {
    consultas, setConsultas,
    consultasLoading,
    consultasTotal,
    consultaSelected, setConsultaSelected,
    showConsultaModal, setShowConsultaModal,
    consultaEdit, setConsultaEdit,
    campanas,
    cFlujo, setCFlujo,
    cEstado, setCEstado,
    cOrden, setCOrden,
    cRep, setCRep,
    cSearch, setCSearch,
    cSearchInput, setCSearchInput,
    loadConsultas,
  }
}
