export type Session = {
  phone_number: string
  state: string
  data: Record<string, any>
  assigned_to: string | null
  // Fecha exacta en que el operador registró la venta (status → closed).
  // Se setea una sola vez y no cambia con ediciones posteriores del lead.
  fecha_venta: string | null
  created_at: string
  updated_at: string
}

export type LoanLead = {
  id: number
  phone_number: string | null
  full_name: string | null
  dni: string | null
  reparticion: string | null
  bank: string | null
  email: string | null
  amount: number | null
  installments: number | null
  status: 'new' | 'contacted' | 'not_interested' | 'rejected' | 'closed' | 'resolved' | 'unresolved' | 'finalizado'
  assigned_to: string | null
  notes: string | null
  archived: boolean
  // Campos de venta cerrada
  entidad: string | null
  linea: string | null
  monto_solicitado: number | null
  cant_cuotas: number | null
  valor_cuota: number | null
  fecha_venta: string | null
  // Fecha exacta de cierre — se escribe una sola vez al pasar a estado final.
  // Usar siempre esta columna para reportes de período, nunca updated_at.
  closed_at: string | null
  created_at: string
  updated_at: string
}

export type Message = {
  id: number
  phone_number: string
  direction: 'in' | 'out'
  body: string
  sender: string | null
  // Campos de media
  media_url: string | null
  media_type: 'image' | 'document' | 'audio' | 'video' | null
  created_at: string
}

export type Complaint = {
  id: number
  phone_number: string
  ticket_id: string | null
  type: string | null
  description: string | null
  status: 'open' | 'in_progress' | 'closed'
  created_at: string
}
