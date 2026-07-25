// ─────────────────────────────────────────────────────────────────────────────
//  DOMAIN · WORKFLOWS · STATUS MAPPING
//  Mapeo bidireccional canónico entre los estados de amat_loan_leads
//  y los estados de amat_consultas.
//
//  Por qué existe: estos dos mapeos vivían en distintos lugares de
//  BandejaClient (uno a nivel módulo, otro inline en el modal de consultas),
//  lo que generaba divergencias silenciosas. Tenerlos en un solo lugar
//  garantiza consistencia en toda sincronización lead ↔ consulta.
//
//  Qué ocurriría si desaparece: las sincronizaciones entre tablas usarían
//  mapeos dispersos y potencialmente inconsistentes.
// ─────────────────────────────────────────────────────────────────────────────

// Mapeo canónico: status de amat_loan_leads → estado de amat_consultas
export const STATUS_A_CONSULTA: Record<string, string> = {
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

// Mapeo inverso: estado de amat_consultas → status de amat_loan_leads
// El flujo (ventas vs cobranzas) afecta la interpretación de 'resuelto' y 'cerrado'.
export function consultaStatusToLeadStatus(
  estadoConsulta: string,
  flujo: 'cobranzas' | 'solicitud' | string
): string {
  const esCob = flujo === 'cobranzas'
  const map: Record<string, string> = {
    pendiente:              'contacted',
    contactado:             'contactado',
    resuelto:               esCob ? 'resolved' : 'closed',
    cerrado:                esCob ? 'unresolved' : 'not_interested',
    cerrado_rechazado:      'rejected',
    cerrado_no_interesado:  'not_interested',
  }
  return map[estadoConsulta] ?? 'contacted'
}
