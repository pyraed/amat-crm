export type Session = {
  phone_number: string
  state: string
  data: Record<string, any>
  assigned_to: string | null
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
  status: 'new' | 'contacted' | 'not_interested' | 'rejected' | 'closed'
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type Message = {
  id: number
  phone_number: string
  direction: 'in' | 'out'
  body: string
  sender: string | null
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
