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
  const { search, rep, banco, status, tel, assigned, page, ordenCol, ordenDir } = filtros

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

  const [asignadosRes, colaRes, countRes] = await Promise.all([
    supabase.from('amat_loan_leads').select('*')
      .eq('assigned_to', username)
      .eq('archived', false)
      .not('status', 'in', `(${EXCLUIDOS.join(',')})`)
      .order('updated_at', { ascending: false }),

    // Cola: solo leads con al menos un mensaje ENTRANTE — excluye leads de campaña sin respuesta
    supabase.from('amat_loan_leads').select('*, amat_messages!inner(direction)')
      .is('assigned_to', null)
      .eq('archived', false)
      .in('status', ['new', 'contacted'])
      .eq('amat_messages.direction', 'in')
      .order('created_at', { ascending: true })
      .limit(50),

    supabase.from('amat_loan_leads')
      .select('id', { count: 'exact', head: true })
      .is('assigned_to', null)
      .eq('archived', false)
      .in('status', ['new', 'contacted'])
      .not('phone_number', 'is', null),
  ])

  // El JOIN con amat_messages puede traer duplicados — deduplicar por id
  const colaRaw = (colaRes.data || []) as any[]
  const colaVista = new Map<number, LoanLead>()
  colaRaw.forEach(l => {
    if(!colaVista.has(l.id)) {
      // Remover el campo amat_messages que trajo el JOIN antes de guardar
      const { amat_messages: _, ...lead } = l
      colaVista.set(l.id, lead as LoanLead)
    }
  })

  return {
    asignados:  (asignadosRes.data || []) as LoanLead[],
    cola:       [...colaVista.values()],
    colaTotal:  countRes.count || 0,
  }
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
 * Cuenta leads cerrados hoy.
 */
export async function fetchCerradosHoy(): Promise<number> {
  const hoy = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('amat_loan_leads')
    .select('id,status,updated_at')
    .eq('status', 'closed')
    .gte('updated_at', hoy + 'T00:00:00.000Z')
  return data?.length || 0
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

/**
 * Asigna un lead a un operador (tomar conversación).
 * Actualiza amat_loan_leads y sincroniza amat_consultas.
 */
export async function tomarLead(lead: LoanLead, username: string): Promise<{ ok: boolean }> {
  const res = await safeRun('lead.service:tomar', () =>
    supabase.from('amat_loan_leads').update({
      assigned_to: username,
      status:      'contacted',
      updated_at:  new Date().toISOString(),
    }).eq('id', lead.id)
  )
  if (!res.ok) return { ok: false }

  if (lead.phone_number) {
    await syncConsultaVendedor(lead.phone_number, username)
  }
  return { ok: true }
}

/**
 * Auto-asigna un lead al operador que envía el primer mensaje.
 */
export async function autoAsignarLead(leadId: number, phone: string | null, username: string): Promise<{ ok: boolean }> {
  const res = await safeRun('lead.service:autoAsignar', () =>
    supabase.from('amat_loan_leads').update({
      assigned_to: username,
      status:      'contacted',
      updated_at:  new Date().toISOString(),
    }).eq('id', leadId)
  )
  if (!res.ok) return { ok: false }

  if (phone) {
    await syncConsultaVendedor(phone, username)
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
  const res = await safeRun('lead.service:reactivar', () =>
    supabase.from('amat_loan_leads').update({
      status:      'new',
      archived:    false,
      assigned_to: null,
      updated_at:  new Date().toISOString(),
    }).eq('id', leadId)
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
