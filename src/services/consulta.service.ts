// ─────────────────────────────────────────────────────────────────────────────
//  SERVICES · CONSULTA SERVICE
//  Toda interacción con amat_consultas.
//
//  Por qué existe: las queries a amat_consultas estaban dispersas en
//  BandejaClient — dentro de loadConsultas, useEffects, handlers de modales
//  y el realtime. Este servicio las centraliza.
//
//  Qué ocurriría si desaparece: el sistema perdería acceso a la tabla de
//  consultas del bot.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import { safeRun } from '@/lib/supabase-helpers'

export type ConsultaFiltros = {
  search:  string
  flujo:   string
  estado:  string
  rep:     string
  orden:   'asc' | 'desc'
}

export type ConsultaRow = {
  id:               any
  phone:            string | null
  nombre_apellido:  string | null
  dni:              string | null
  reparticion_label:string | null
  flujo:            string | null
  prestacion:       string | null
  afiliado:         string | null
  vendedor:         string | null
  situacion:        string | null
  estado:           string | null
  created_at:       string
  updated_at:       string
  [key: string]:    any
}

export type ConsultaQueryResult = {
  consultas: any[]
  leadsData: any[]
  count:     number
}

/**
 * Query principal de consultas + leads sin consulta en paralelo.
 * Devuelve los datos crudos — la transformación y deduplicación
 * quedan en el hook/componente que conoce el estado de flujoMap.
 */
export async function fetchConsultas(
  filtros: ConsultaFiltros
): Promise<ConsultaQueryResult> {
  const { search, flujo, estado, rep, orden } = filtros

  let q = supabase
    .from('amat_consultas')
    .select(
      'id,phone,nombre_apellido,dni,reparticion_label,flujo,prestacion,afiliado,vendedor,situacion,estado,created_at,updated_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: orden === 'asc' })
    .limit(500)

  if (search) q = q.or(`nombre_apellido.ilike.%${search}%,dni.ilike.%${search}%,phone.ilike.%${search}%`)
  if (flujo !== 'all') q = q.eq('flujo', flujo)

  if (estado === 'cola') {
    q = q.eq('estado', 'cola')
  } else if (estado === 'pendiente') {
    q = q.eq('estado', 'pendiente')
  } else if (estado === 'contactado') {
    q = q.eq('estado', 'contactado')
  } else if (estado === 'vendido') {
    // Vendido = resuelto en solicitudes (excluye cobranzas)
    q = q.eq('estado', 'resuelto').neq('flujo', 'cobranzas')
  } else if (estado === 'rechazado') {
    q = q.eq('estado', 'cerrado_rechazado')
  } else if (estado === 'no_interesado') {
    q = q.eq('estado', 'cerrado_no_interesado')
  } else if (estado === 'sin_respuesta') {
    // Sin respuesta = cerrado en solicitudes (excluye cobranzas)
    q = q.eq('estado', 'cerrado').neq('flujo', 'cobranzas')
  } else if (estado === 'resuelto_cob') {
    // Resuelto cobranzas
    q = q.eq('estado', 'resuelto').eq('flujo', 'cobranzas')
  } else if (estado === 'no_resuelto_cob') {
    // No resuelto cobranzas = cerrado en cobranzas
    q = q.eq('estado', 'cerrado').eq('flujo', 'cobranzas')
  } else if (estado !== 'all') {
    q = q.eq('estado', estado)
  }

  if (rep !== 'all') q = q.ilike('reparticion_label', rep)

  // Query paralela de leads sin consulta
  let lq = supabase
    .from('amat_loan_leads')
    .select('id,phone_number,full_name,dni,reparticion,assigned_to,status,created_at')
    .order('created_at', { ascending: false })
    .limit(300)
  if (search) lq = lq.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%,phone_number.ilike.%${search}%`)
  if (rep !== 'all') lq = lq.ilike('reparticion', `%${rep}%`)

  const [consultasRes, leadsRes] = await Promise.all([q, lq])
  if (consultasRes.error) throw consultasRes.error

  return {
    consultas: consultasRes.data || [],
    leadsData: leadsRes.data   || [],
    count:     consultasRes.count || 0,
  }
}

/**
 * Carga el mapa phone → flujo para un conjunto de teléfonos.
 * Reutilizable desde bandeja, base, reportes y cola.
 */
export async function fetchFlujoMap(phones: string[]): Promise<Record<string, string>> {
  if (phones.length === 0) return {}

  const BATCH = 200
  const chunks = Array.from(
    { length: Math.ceil(phones.length / BATCH) },
    (_, i) => phones.slice(i * BATCH, (i + 1) * BATCH)
  )

  const results = await Promise.all(
    chunks.map(chunk =>
      supabase.from('amat_consultas').select('phone,flujo').in('phone', chunk)
        .then(({ data }) => data || [])
    )
  )

  const map: Record<string, string> = {}
  results.flat().forEach((r: any) => {
    if (r.phone) map[r.phone] = r.flujo || 'solicitud'
  })
  return map
}

/**
 * Carga el mapa phone → fecha de última campaña enviada.
 * Usado en el tab de consultas para mostrar el badge de campaña reciente.
 */
export async function fetchCampanasRecientes(diasAtras = 60): Promise<Record<string, string>> {
  const desde = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('amat_campanas')
    .select('telefono,fecha')
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .limit(5000)

  const map: Record<string, string> = {}
  ;(data || []).forEach((r: any) => {
    if (r.telefono && !map[r.telefono]) map[r.telefono] = r.fecha
  })
  return map
}

/**
 * Actualiza una consulta existente.
 */
export async function updateConsulta(
  id: any,
  data: { vendedor?: string; situacion?: string; estado?: string; updated_at?: string }
) {
  return safeRun('consulta.service:update', () =>
    supabase.from('amat_consultas').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  )
}

/**
 * Inserta una consulta nueva (para leads que llegaron del bot sin consulta previa).
 */
export async function insertConsulta(data: {
  phone:            string
  nombre_apellido:  string | null
  dni:              string | null
  reparticion_label:string | null
  flujo:            string
  vendedor:         string
  situacion:        string
  estado:           string
}) {
  return safeRun('consulta.service:insert', () =>
    supabase.from('amat_consultas').insert({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  )
}

/**
 * Sincroniza el estado de amat_consultas a partir de un cambio en amat_loan_leads.
 * Fallo no crítico — el lead ya se actualizó, esto es best-effort.
 */
export async function syncConsultaEstado(
  phone: string,
  nuevoEstado: string,
  situacion?: string
) {
  const upd: any = { estado: nuevoEstado, updated_at: new Date().toISOString() }
  if (situacion?.trim()) upd.situacion = situacion.trim()
  return safeRun('consulta.service:sync', () =>
    supabase.from('amat_consultas').update(upd).eq('phone', phone)
  )
}

/**
 * Sincroniza vendedor y estado de amat_consultas al tomar/asignar un lead.
 */
export async function syncConsultaVendedor(phone: string, vendedor: string) {
  return safeRun('consulta.service:syncVendedor', () =>
    supabase.from('amat_consultas').update({
      vendedor,
      estado:     'pendiente',
      updated_at: new Date().toISOString(),
    }).eq('phone', phone)
  )
}

// ── Sincronización masiva de estados ─────────────────────────────────────────
// Corrige desincronizaciones entre amat_loan_leads y amat_consultas.
// Solo disponible para administradores.

export type SyncResult = {
  corregidos: number
  detalle: { phone: string; de: string; a: string }[]
  error?: string
}

export async function sincronizarEstados(): Promise<SyncResult> {
  const MAPEO: Record<string, string> = {
    new:            'cola',
    contacted:      'pendiente',
    contactado:     'contactado',
    closed:         'resuelto',
    resolved:       'resuelto',
    rejected:       'cerrado_rechazado',
    not_interested: 'cerrado_no_interesado',
    sin_respuesta:  'cerrado',
    unresolved:     'cerrado',
    finalizado:     'cerrado',
  }

  try {
    const { data, error } = await supabase
      .from('amat_loan_leads')
      .select('id, phone_number, status, assigned_to, amat_consultas!inner(phone, estado, vendedor)')
      .eq('archived', false)
      .not('phone_number', 'is', null)

    if(error) return { corregidos: 0, detalle: [], error: error.message }

    const desincronizados = (data || []).filter((l: any) => {
      const consulta = l.amat_consultas?.[0]
      if(!consulta) return false
      const esperado = MAPEO[l.status || '']
      return esperado && consulta.estado !== esperado
    })

    if(desincronizados.length === 0) return { corregidos: 0, detalle: [] }

    const detalle: SyncResult['detalle'] = []

    for(const lead of desincronizados) {
      const consulta = (lead as any).amat_consultas[0]
      const estadoEsperado = MAPEO[lead.status || '']
      const upd: any = { estado: estadoEsperado, updated_at: new Date().toISOString() }
      if(estadoEsperado === 'cola') upd.vendedor = null
      await supabase.from('amat_consultas').update(upd).eq('phone', lead.phone_number)
      detalle.push({ phone: lead.phone_number!, de: consulta.estado, a: estadoEsperado })
    }

    return { corregidos: detalle.length, detalle }
  } catch(e: any) {
    return { corregidos: 0, detalle: [], error: e.message }
  }
}
