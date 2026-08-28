// ─────────────────────────────────────────────────────────────────────────────
//  SERVICES · LEAD SERVICE
//  Toda interacción con amat_loan_leads.
//
//  Por qué existe: las queries y mutaciones de leads estaban dispersas en
//  BandejaClient — loadBase, cambiarEstado, tomarConversacion, saveEdit,
//  saveNote, updateStatus, y varios useEffects. Este servicio las centraliza.
//
//  Qué ocurriría si desaparece: el sistema perdería acceso a la tabla
//  principal de leads.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import { safeQuery, safeRun } from '@/lib/supabase-helpers'
import { LoanLead } from '@/lib/types'
import { ESTADOS_FINALES } from '@/domain/entities/leadStatus'
import { STATUS_A_CONSULTA } from '@/domain/workflows/statusMapping'
import { syncConsultaEstado, syncConsultaVendedor } from './consulta.service'

const PAGE_SIZE = 50

export type BaseFiltros = {
  search:   string
  rep:      string
  banco:    string
  status:   string
  tel:      'all' | 'con' | 'sin'
  assigned: string
  flujo:    string
  page:     number
  ordenCol: string
  ordenDir: 'asc' | 'desc'
}

export type BaseQueryResult = {
  leads: LoanLead[]
  total: number
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Carga la base de contactos paginada con filtros.
 */
export async function fetchBase(filtros: BaseFiltros): Promise<BaseQueryResult> {
  const { search, rep, banco, status, tel, assigned, flujo, page, ordenCol, ordenDir } = filtros

  // Si hay filtro por flujo, primero obtenemos los phones del flujo pedido desde amat_consultas
  let phonesDelFlujo: string[] | null = null
  if (flujo !== 'all') {
    const { data: cData } = await supabase
      .from('amat_consultas')
      .select('phone')
      .eq('flujo', flujo)
    phonesDelFlujo = (cData || []).map((c: any) => c.phone).filter(Boolean)
    // Si no hay ningún phone en ese flujo, devolver vacío directamente
    if (phonesDelFlujo.length === 0) return { leads: [], total: 0 }
  }

  let q = supabase
    .from('amat_loan_leads')
    .select('id,phone_number,full_name,dni,reparticion,bank,status,assigned_to,created_at,updated_at,archived,email', { count: 'exact' })

  if (search)           q = q.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%,phone_number.ilike.%${search}%`)
  if (rep !== 'all')    q = q.ilike('reparticion', rep)
  if (banco !== 'all')  q = q.eq('bank', banco)
  if (status !== 'all') q = q.eq('status', status)
  if (tel === 'con')    q = q.not('phone_number', 'is', null).neq('phone_number', '')
  if (tel === 'sin')    q = q.or('phone_number.is.null,phone_number.eq.')
  if (assigned === 'sin')       q = q.is('assigned_to', null)
  else if (assigned !== 'all')  q = q.eq('assigned_to', assigned)
  if (phonesDelFlujo !== null)  q = q.in('phone_number', phonesDelFlujo)

  q = q.order(ordenCol, { ascending: ordenDir === 'asc' }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const { data, count, error } = await q
  if (error) throw error

  return { leads: (data as LoanLead[]) || [], total: count || 0 }
}

/**
 * Carga los mensajes de la bandeja (últimos 30 días, en lotes).
 */
export async function fetchMensajesBandeja() {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const allMsgs: any[] = []
  let fromIdx = 0
  const BATCH = 1000
  const MAX_BATCHES = 10

  let batches = 0
  while (batches < MAX_BATCHES) {
    const { data: batch } = await supabase
      .from('amat_messages')
      .select('id,phone_number,body,direction,sender,created_at,media_url,media_type')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .range(fromIdx, fromIdx + BATCH - 1)
    if (!batch || batch.length === 0) break
    allMsgs.push(...batch)
    if (batch.length < BATCH) break
    fromIdx += BATCH
    batches++
  }
  return allMsgs
}

/**
 * Carga leads asignados a un operador + cola de no asignados en paralelo.
 */
export async function fetchBandejaLeads(username: string) {
  const EXCLUIDOS = ['finalizado', 'rejected', 'not_interested', 'resolved', 'unresolved', 'sin_respuesta', 'closed']

  const [asignadosRes, colaRes] = await Promise.all([
    supabase.from('amat_loan_leads').select('*')
      .eq('assigned_to', username)
      .eq('archived', false)
      .not('status', 'in', `(${EXCLUIDOS.join(',')})`)
      .order('updated_at', { ascending: false }),

    supabase.from('amat_loan_leads').select('*')
      .is('assigned_to', null)
      .eq('archived', false)
      .in('status', ['new', 'contacted'])
      .order('created_at', { ascending: true })
      .limit(200),
  ])

  // Filtrar cola: solo leads que tienen al menos un mensaje entrante
  // Esto excluye leads de campaña que nunca respondieron
  const todasLasCola = (colaRes.data || []) as LoanLead[]

  // Traer phones con mensajes entrantes para filtrar
  const phonesEnCola = todasLasCola.map(l => l.phone_number).filter(Boolean) as string[]
  let phonesConRespuesta = new Set<string>()

  if(phonesEnCola.length > 0) {
    const { data: msgsIn } = await supabase
      .from('amat_messages')
      .select('phone_number')
      .in('phone_number', phonesEnCola)
      .eq('direction', 'in')
      .limit(1000)
    ;(msgsIn || []).forEach((m: any) => { if(m.phone_number) phonesConRespuesta.add(m.phone_number) })
  }

  const cola = todasLasCola.filter(l => l.phone_number && phonesConRespuesta.has(l.phone_number)).slice(0, 50)

  return {
    asignados:  (asignadosRes.data || []) as LoanLead[],
    cola,
    colaTotal:  cola.length,
  }
}

/**
 * Carga leads activos sin asignar para los phones con mensajes recientes (carga inicial SSR).
 * Reemplaza la query inline que vivía en useBandeja con un import dinámico.
 * Procesa en batches de 200 para no superar los límites de PostgREST.
 */
export async function fetchLeadsIniciales(phones: string[]): Promise<LoanLead[]> {
  if (phones.length === 0) return []

  const BATCH = 200
  const ESTADOS_EXCLUIDOS = '("finalizado","rejected","not_interested","resolved","unresolved","sin_respuesta","closed")'
  const chunks = Array.from(
    { length: Math.ceil(phones.length / BATCH) },
    (_, i) => phones.slice(i * BATCH, (i + 1) * BATCH)
  )

  const results = await Promise.all(
    chunks.map(chunk =>
      supabase
        .from('amat_loan_leads')
        .select('*')
        .in('phone_number', chunk)
        .not('status', 'in', ESTADOS_EXCLUIDOS)
        .eq('archived', false)
        .is('assigned_to', null)
        .then(({ data }) => (data || []) as LoanLead[])
    )
  )

  const seen = new Set<string>()
  return results.flat().filter(l => {
    const key = l.phone_number || String(l.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Carga un lead por phone_number (usado en callbacks de Realtime).
 * Devuelve null si no existe.
 */
export async function fetchLeadByPhone(phone: string): Promise<LoanLead | null> {
  const { data } = await supabase
    .from('amat_loan_leads')
    .select('*')
    .eq('phone_number', phone)
    .single()
  return (data as LoanLead) || null
}

/**
 * Verifica si un número tiene al menos un mensaje entrante.
 * Usado en Realtime para evitar que leads de campaña aparezcan en cola.
 */
export async function tieneMensajesEntrantes(phone: string): Promise<boolean> {
  const { count } = await supabase
    .from('amat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('phone_number', phone)
    .eq('direction', 'in')
    .limit(1)
  return (count || 0) > 0
}

/**
 * Carga datos de un lead por id (para refrescar al abrir chat).
 */
export async function fetchLeadById(id: number) {
  return safeQuery<LoanLead>('lead.service:fetchById', () =>
    supabase.from('amat_loan_leads').select('*').eq('id', id).single()
  )
}

/**
 * Cuenta leads cerrados (closed + resolved) en el mes calendario actual.
 * Usa COUNT para evitar traer filas innecesarias.
 * Se vuelve a ejecutar cuando un lead pasa a closed/resolved via Realtime.
 *
 * LIMITACIÓN CONOCIDA: usa updated_at como proxy de fecha de cierre.
 * Si un lead cerrado en un mes anterior es editado este mes (nota, datos,
 * reasignación), va a aparecer en el conteo actual porque updated_at se
 * actualiza en cada operación sobre el lead (editLead, saveLeadNote, etc.).
 * Solución correcta a futuro: agregar columna closed_at TIMESTAMPTZ que
 * se escriba una sola vez al pasar a estado final y usar esa fecha aquí.
 * Migración pendiente — no implementar sin poblar el histórico existente.
 */
export async function fetchCerradosMes(): Promise<number> {
  const inicioMes = new Date()
  inicioMes.setUTCDate(1)
  inicioMes.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('amat_loan_leads')
    .select('*', { count: 'exact', head: true })
    .in('status', ['closed', 'resolved'])
    .gte('updated_at', inicioMes.toISOString())
  return count || 0
}

/**
 * Cuenta leads creados en el mes calendario actual (global, todos los flujos).
 * Usa COUNT para evitar traer filas innecesarias.
 * Se vuelve a ejecutar cuando llega un INSERT via Realtime.
 */
export async function fetchInboundMes(): Promise<number> {
  const inicioMes = new Date()
  inicioMes.setUTCDate(1)
  inicioMes.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('amat_loan_leads')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', inicioMes.toISOString())
  return count || 0
}

/**
 * Carga todos los leads del período para el tab de reportes (paginado en loop).
 */
export async function fetchReporteLeads(desde: string | null, hasta: string | null) {
  let allData: any[] = []
  let from = 0
  let batches = 0
  const MAX_BATCHES = 20

  while (batches < MAX_BATCHES) {
    let q = supabase
      .from('amat_loan_leads')
      .select('id,status,reparticion,assigned_to,updated_at,created_at,phone_number,entidad,linea,monto_solicitado,cant_cuotas,valor_cuota')
      .order('updated_at', { ascending: false })
      .range(from, from + 999)
    if (desde) q = q.gte('updated_at', desde)
    if (hasta) q = q.lte('updated_at', hasta)

    const { data } = await q
    if (!data || data.length === 0) break
    allData = [...allData, ...data]
    if (data.length < 1000) break
    from += 1000
    batches++
  }
  return allData as LoanLead[]
}

// ── Mutaciones ────────────────────────────────────────────────────────────────

/**
 * Función central de cambio de estado.
 * Actualiza amat_loan_leads y sincroniza amat_consultas.
 * Devuelve { ok, esFinal } para que el hook actualice la UI.
 */
export async function cambiarEstadoLead(
  lead: LoanLead,
  nuevoStatus: string,
  opts?: { notes?: string; situacion?: string; extraFields?: Record<string, any> }
): Promise<{ ok: boolean; esFinal: boolean }> {
  const esFinal = ESTADOS_FINALES.includes(nuevoStatus)
  const upd: any = {
    status:     nuevoStatus,
    updated_at: new Date().toISOString(),
    ...(esFinal && { archived: true }),
    ...(opts?.notes !== undefined && { notes: opts.notes }),
    ...(opts?.extraFields || {}),
  }

  const resLead = await safeRun('lead.service:cambiarEstado', () =>
    supabase.from('amat_loan_leads').update(upd).eq('id', lead.id)
  )
  if (!resLead.ok) return { ok: false, esFinal }

  // Sync consulta — fallo no crítico
  if (lead.phone_number) {
    await syncConsultaEstado(
      lead.phone_number,
      STATUS_A_CONSULTA[nuevoStatus] || 'pendiente',
      opts?.situacion
    )
  }

  return { ok: true, esFinal }
}

// ── Asignación de leads ──────────────────────────────────────────────────────

/**
 * Función privada base para toda asignación de lead.
 * Centraliza la lógica de concurrencia: el UPDATE incluye
 * AND assigned_to IS NULL, por lo que si otro operador tomó
 * el lead primero, afecta 0 filas y devuelve { ok: false, tomadoPor }.
 *
 * PostgreSQL garantiza atomicidad: dos UPDATEs concurrentes con
 * WHERE id = X AND assigned_to IS NULL nunca pueden ambos tener éxito.
 * No se necesita transacción explícita.
 *
 * Sync con amat_consultas queda en responsabilidad del caller.
 */
async function _asignarLead(
  leadId: number,
  username: string
): Promise<{ ok: boolean; tomadoPor?: string }> {
  const { data, error } = await supabase
    .from('amat_loan_leads')
    .update({
      assigned_to: username,
      status:      'contacted',
      updated_at:  new Date().toISOString(),
    })
    .eq('id', leadId)
    .is('assigned_to', null)   // protección de concurrencia
    .select('id')              // necesario para saber si afectó filas

  if (error) {
    // LOG TEMPORAL — eliminar una vez validado el comportamiento en producción
    console.error('[_asignarLead] Error real de DB:', { leadId, username, error: error.message })
    return { ok: false }
  }

  // UPDATE exitoso — afectó exactamente 1 fila
  if (data && data.length > 0) return { ok: true }

  // UPDATE afectó 0 filas — el lead ya fue tomado por otro operador.
  // Consultamos quién lo tiene para informar al operador actual.
  const { data: leadActual } = await supabase
    .from('amat_loan_leads')
    .select('assigned_to')
    .eq('id', leadId)
    .single()

  const tomadoPor = leadActual?.assigned_to || 'otro operador'

  // LOG TEMPORAL — eliminar una vez validado el comportamiento en producción
  console.warn('[_asignarLead] Lead ya tomado:', { leadId, username, tomadoPor })

  return { ok: false, tomadoPor }
}

/**
 * Tomar conversación desde la cola (click explícito del operador).
 * Usa protección de concurrencia — si el lead ya fue tomado,
 * devuelve { ok: false, tomadoPor } con el nombre del operador.
 */
export async function tomarLead(
  lead: LoanLead,
  username: string
): Promise<{ ok: boolean; tomadoPor?: string }> {
  const res = await _asignarLead(lead.id, username)
  if (!res.ok) return res

  if (lead.phone_number) {
    await syncConsultaVendedor(lead.phone_number, username)
  }
  return { ok: true }
}

/**
 * Auto-asignar lead al operador que envía el primer mensaje.
 * Usa la misma protección de concurrencia que tomarLead.
 * Si el lead ya fue tomado por otro operador, devuelve { ok: false, tomadoPor }.
 */
export async function autoAsignarLead(
  leadId: number,
  phone: string | null,
  username: string
): Promise<{ ok: boolean; tomadoPor?: string }> {
  const res = await _asignarLead(leadId, username)
  if (!res.ok) return res

  if (phone) {
    await syncConsultaVendedor(phone, username)
  }
  return { ok: true }
}

/**
 * Reasigna un lead a otro operador (acción administrativa).
 * Operación conceptualmente distinta a tomarLead:
 *   - No requiere assigned_to IS NULL — puede mover leads ya asignados.
 *   - No modifica el status — la reasignación es solo un cambio de responsable.
 *   - Sincroniza amat_consultas.vendedor para mantener consistencia.
 *
 * Si aparece un lead en estado 'new' con assigned_to seteado, es una
 * inconsistencia a investigar — esta función no la corrige silenciosamente.
 */
export async function reasignarLead(
  leadId: number,
  phone: string | null,
  nuevoVendedor: string
): Promise<{ ok: boolean }> {
  const res = await safeRun('lead.service:reasignar', () =>
    supabase.from('amat_loan_leads').update({
      assigned_to: nuevoVendedor,
      updated_at:  new Date().toISOString(),
    }).eq('id', leadId)
  )
  if (!res.ok) return { ok: false }

  if (phone) {
    await syncConsultaVendedor(phone, nuevoVendedor)
  }
  return { ok: true }
}

/**
 * Quita la asignación de un lead (acción administrativa).
 * Comportamiento histórico del CRM: solo limpia assigned_to y vendedor.
 * No modifica status ni amat_consultas.estado — eso preserva el estado
 * del flujo de ventas. Si en el futuro se decide devolver el lead a cola
 * al quitar la asignación, implementarlo como regla de negocio explícita.
 */
export async function quitarAsignacionLead(
  leadId: number,
  phone: string | null
): Promise<{ ok: boolean }> {
  const res = await safeRun('lead.service:quitarAsignacion', () =>
    supabase.from('amat_loan_leads').update({
      assigned_to: null,
      updated_at:  new Date().toISOString(),
    }).eq('id', leadId)
  )
  if (!res.ok) return { ok: false }

  // Solo limpiar el vendedor — no cambiar amat_consultas.estado.
  // Históricamente quitar la asignación no modificaba el estado de la consulta.
  if (phone) {
    await supabase.from('amat_consultas').update({
      vendedor:   null,
      updated_at: new Date().toISOString(),
    }).eq('phone', phone)
  }
  return { ok: true }
}

/**
 * Edita los datos de un lead (modal de edición).
 */
export async function editLead(
  id: number,
  phone: string | null,
  formData: Partial<LoanLead>
): Promise<{ ok: boolean }> {
  const upd: any = {
    ...formData,
    full_name:   formData.full_name?.toUpperCase()   || formData.full_name,
    reparticion: formData.reparticion?.toUpperCase() || formData.reparticion,
    bank:        formData.bank?.toUpperCase()        || formData.bank,
    updated_at:  new Date().toISOString(),
  }

  if (formData.status) {
    upd.archived = ESTADOS_FINALES.includes(formData.status)
  }

  const res = await safeRun('lead.service:edit', () =>
    supabase.from('amat_loan_leads').update(upd).eq('id', id)
  )
  if (!res.ok) return { ok: false }

  // Sync consulta — fallo no crítico
  if (phone && formData.status) {
    await syncConsultaEstado(phone, STATUS_A_CONSULTA[formData.status] || 'pendiente')
  }
  return { ok: true }
}

/**
 * Guarda la nota interna de un lead.
 */
export async function saveLeadNote(id: number, notes: string) {
  return safeRun('lead.service:saveNote', () =>
    supabase.from('amat_loan_leads').update({ notes, updated_at: new Date().toISOString() }).eq('id', id)
  )
}

/**
 * Exporta todas las ventas cerradas.
 */
export async function fetchVentasCerradas() {
  const { data, error } = await supabase
    .from('amat_loan_leads')
    .select('*')
    .eq('status', 'closed')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Reactiva un lead archivado (cuando la persona vuelve a escribir).
 * Solo aplica a estados no_interested, sin_respuesta, unresolved.
 */
export async function reactivarLead(leadId: number, phone?: string | null) {
  // Guarda de estado: closed y rejected son irreversibles — nunca se reactivan.
  // La regla vive aquí y no solo en el caller, por lo que la función es segura
  // independientemente de quién la invoque o con qué validaciones previas.
  // Sintaxis .not('status', 'in', ...) ya usada en fetchBandejaLeads.
  //
  // ASUNCIÓN: closed y rejected son los ÚNICOS estados irreversibles del sistema.
  // Si en el futuro se agrega un nuevo estado terminal (ej: 'cancelled', 'duplicado'),
  // hay que agregarlo aquí para que reactivarLead no lo procese.
  // Ver también: ESTADOS_FINALES en domain/entities/leadStatus.ts.
  const ESTADOS_NO_REACTIVABLES = ['closed', 'rejected']

  const res = await safeRun('lead.service:reactivar', () =>
    supabase.from('amat_loan_leads').update({
      status:      'new',
      archived:    false,
      assigned_to: null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', leadId)
    .not('status', 'in', `(${ESTADOS_NO_REACTIVABLES.join(',')})`)
  )
  // Sincronizar amat_consultas — el lead volvió a cola
  if(res.ok && phone) {
    await syncConsultaEstadoLocal(phone, 'cola')
  }
  return res
}

// Helper interno para evitar importación circular
async function syncConsultaEstadoLocal(phone: string, estado: string) {
  try {
    await supabase.from('amat_consultas').update({
      estado,
      vendedor:   null,
      updated_at: new Date().toISOString(),
    }).eq('phone', phone)
  } catch(e) {
    console.error('[lead.service:reactivar] Error sincronizando consulta:', e)
  }
}
