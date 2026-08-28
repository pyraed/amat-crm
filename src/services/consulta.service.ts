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
  } else if (estado === 'resuelto_cob') {
    // Resuelto cobranzas → en amat_consultas se guarda como 'resuelto' con flujo cobranzas
    q = q.eq('estado', 'resuelto').eq('flujo', 'cobranzas')
  } else if (estado === 'cerrado_cob') {
    // No resuelto cobranzas → en amat_consultas se guarda como 'cerrado' con flujo cobranzas
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
 * Si no existe fila para ese phone, la busca en amat_loan_leads y la crea.
 */
export async function syncConsultaVendedor(phone: string, vendedor: string) {
  // Intentar actualizar primero
  const { data: existing } = await supabase
    .from('amat_consultas')
    .select('id')
    .eq('phone', phone)
    .single()

  if (existing) {
    return safeRun('consulta.service:syncVendedor', () =>
      supabase.from('amat_consultas').update({
        vendedor,
        estado:     'pendiente',
        updated_at: new Date().toISOString(),
      }).eq('phone', phone)
    )
  }

  // No existe → crearla a partir del lead
  const { data: lead } = await supabase
    .from('amat_loan_leads')
    .select('full_name,dni,reparticion')
    .eq('phone_number', phone)
    .single()

  if (!lead) return { ok: false }

  return safeRun('consulta.service:syncVendedor:insert', () =>
    supabase.from('amat_consultas').insert({
      phone,
      nombre_apellido:  lead.full_name || null,
      dni:              lead.dni || null,
      reparticion_label:lead.reparticion || null,
      flujo:            'solicitud',
      vendedor,
      estado:           'pendiente',
      situacion:        null,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    })
  )
}

// ── Sincronización masiva de estados ─────────────────────────────────────────

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
    const { data: leads, error: leadsError } = await supabase
      .from('amat_loan_leads')
      .select('id, phone_number, status, assigned_to')
      .eq('archived', false)
      .not('phone_number', 'is', null)

    if (leadsError) return { corregidos: 0, detalle: [], error: leadsError.message }
    if (!leads?.length) return { corregidos: 0, detalle: [] }

    const phones = leads.map((l: any) => l.phone_number).filter(Boolean)

    const { data: consultas, error: consultasError } = await supabase
      .from('amat_consultas')
      .select('phone, estado')
      .in('phone', phones)

    if (consultasError) return { corregidos: 0, detalle: [], error: consultasError.message }

    const consultaMap: Record<string, string> = {}
    ;(consultas || []).forEach((c: any) => { if (c.phone) consultaMap[c.phone] = c.estado })

    const detalle: SyncResult['detalle'] = []

    // Agrupar phones por estado destino para hacer un UPDATE por grupo
    // en lugar de N UPDATEs individuales (era O(n) queries → ahora O(estados únicos))
    const grupos: Record<string, { phones: string[]; limpiarVendedor: boolean }> = {}

    for (const lead of leads as any[]) {
      const estadoEsperado = MAPEO[lead.status || '']
      const estadoActual   = consultaMap[lead.phone_number]
      if (!estadoEsperado || !estadoActual || estadoActual === estadoEsperado) continue

      detalle.push({ phone: lead.phone_number, de: estadoActual, a: estadoEsperado })

      if (!grupos[estadoEsperado]) {
        grupos[estadoEsperado] = { phones: [], limpiarVendedor: estadoEsperado === 'cola' }
      }
      grupos[estadoEsperado].phones.push(lead.phone_number)
    }

    // Un UPDATE por estado destino (máx. 10 queries — una por valor de MAPEO)
    const now = new Date().toISOString()
    await Promise.all(
      Object.entries(grupos).map(([estado, { phones, limpiarVendedor }]) => {
        const upd: any = { estado, updated_at: now }
        if (limpiarVendedor) upd.vendedor = null
        return supabase.from('amat_consultas').update(upd).in('phone', phones)
      })
    )

    return { corregidos: detalle.length, detalle }
  } catch (e: any) {
    return { corregidos: 0, detalle: [], error: e.message }
  }
}
