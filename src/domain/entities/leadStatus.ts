// ─────────────────────────────────────────────────────────────────────────────
//  DOMAIN · ENTITIES · LEAD STATUS
//  Modelo canónico de estados del sistema, sus etiquetas visuales y reglas
//  de agrupación por flujo.
//
//  Por qué existe: el modelo de estados es la pieza más referenciada del
//  dominio. Vivía disperso en BandejaClient mezclado con UI. Centralizarlo
//  garantiza que un solo cambio de estado se propague a toda la app.
//
//  Qué ocurriría si desaparece: la UI perdería etiquetas, colores y la
//  diferenciación entre flujo ventas/cobranzas.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tipo canónico ─────────────────────────────────────────────────────────────
// Nota: 'contactado' y 'sin_respuesta' existen en producción aunque no están
// en LoanLead.status de types.ts (omisión en el tipo, no en la DB).
export type LeadEstado =
  | 'new'
  | 'contacted'
  | 'contactado'
  | 'closed'
  | 'rejected'
  | 'not_interested'
  | 'sin_respuesta'
  | 'resolved'
  | 'unresolved'
  | 'finalizado'

// ── Modelo canónico de estados ────────────────────────────────────────────────
// Ventas:    pendiente (new/contacted) → vendido (closed) / rechazado (rejected) / no interesado (not_interested)
// Cobranzas: pendiente (new/contacted) → resuelto (resolved) / no resuelto (unresolved)
// Todo estado final implica archived: true — un lead archivado nunca vuelve a bandeja/cola.

export type StatusMeta = {
  label: string
  color: string
  bg:    string
  text:  string
  desc:  string
}

export const LEAD_STATUS: Record<string, StatusMeta> = {
  new:            { label:'Cola',           color:'#F59E0B', bg:'#FFFBEB', text:'#92400E', desc:'En cola, sin tomar' },
  contacted:      { label:'Pendiente',      color:'#3B82F6', bg:'#EFF6FF', text:'#1D4ED8', desc:'En bandeja del operador' },
  not_interested: { label:'No interesado',  color:'#6B7280', bg:'#F9FAFB', text:'#374151', desc:'No quiere la oferta' },
  sin_respuesta:  { label:'Sin respuesta',  color:'#94A3B8', bg:'#F1F5F9', text:'#475569', desc:'No contestó los mensajes' },
  contactado:     { label:'Contactado',     color:'#3B82F6', bg:'#EFF6FF', text:'#1D4ED8', desc:'Respondió, en conversación activa' },
  rejected:       { label:'Rechazado',      color:'#EF4444', bg:'#FEF2F2', text:'#991B1B', desc:'No cumple requisitos' },
  closed:         { label:'Vendido',        color:'#10B981', bg:'#ECFDF5', text:'#065F46', desc:'Operación concretada' },
  // legacy — solo para mostrar registros históricos, no seleccionables
  finalizado:     { label:'Cerrado',        color:'#6B7280', bg:'#F3F4F6', text:'#374151', desc:'Conversación finalizada (histórico)' },
  resolved:       { label:'Resuelto',       color:'#10B981', bg:'#ECFDF5', text:'#065F46', desc:'Caso resuelto' },
  unresolved:     { label:'No resuelto',    color:'#EF4444', bg:'#FEF2F2', text:'#991B1B', desc:'No se pudo resolver' },
}

// Estados exclusivos para flujo COBRANZA
export const COBRANZA_STATUS: Record<string, StatusMeta> = {
  new:        { label:'Pendiente',   color:'#F59E0B', bg:'#FFFBEB', text:'#92400E', desc:'En cola, sin tomar' },
  contacted:  { label:'Pendiente',   color:'#F59E0B', bg:'#FFFBEB', text:'#92400E', desc:'En bandeja del operador' },
  resolved:   { label:'Resuelto',    color:'#10B981', bg:'#ECFDF5', text:'#065F46', desc:'Caso resuelto exitosamente' },
  unresolved: { label:'No resuelto', color:'#EF4444', bg:'#FEF2F2', text:'#991B1B', desc:'No se pudo resolver' },
  finalizado: { label:'Cerrado',     color:'#6B7280', bg:'#F3F4F6', text:'#374151', desc:'Conversación finalizada (histórico)' },
}

// ── Estados finales ───────────────────────────────────────────────────────────
// Un lead en estado final requiere finalización explícita (botón "Finalizar chat").
// CAMBIO: ya no implica archived automático — el archivado ocurre solo cuando
// el operador hace click en "Finalizar chat" (ver archivarLead en lead.service.ts).
// Todos los estados finales son ahora reactivables cuando el cliente vuelve a escribir.
export const ESTADOS_FINALES: string[] = [
  'closed',
  'rejected',
  'not_interested',
  'resolved',
  'unresolved',
  'sin_respuesta',
]

// ── Estados que muestran badge "Reactivado" en Mis Chats ─────────────────────
// Cuando un lead con uno de estos estados vuelve a escribir, se muestra
// un badge distintivo en la tarjeta del chat para que el operador sepa
// que esta persona ya tenía historial previo finalizado.
export const ESTADOS_CON_BADGE_REACTIVADO: string[] = [
  'closed',
  'rejected',
  'not_interested',
  'resolved',
  'unresolved',
  'sin_respuesta',
]

// ── Opciones seleccionables en el modal Cambiar estado ────────────────────────
export const OPCIONES_VENTAS          = ['closed', 'rejected', 'not_interested', 'sin_respuesta'] as const
export const OPCIONES_VENTAS_INTERMEDIOS = ['contactado'] as const
export const OPCIONES_COBRANZAS       = ['resolved', 'unresolved'] as const

// ── Helpers de lookup por flujo ───────────────────────────────────────────────
export function getStatusMeta(status: string, flujo?: string | null): StatusMeta {
  if (flujo === 'cobranzas') {
    return COBRANZA_STATUS[status] ?? COBRANZA_STATUS.new
  }
  return LEAD_STATUS[status] ?? LEAD_STATUS.new
}

export function getEstadosFinalesPorFlujo(flujo?: string | null): string[] {
  return flujo === 'cobranzas'
    ? ['resolved', 'unresolved']
    : ['not_interested', 'rejected', 'closed']
}

export function getFlujoLabel(flujo?: string | null): string {
  return flujo === 'cobranzas' ? 'Cobranzas' : 'Ventas'
}
