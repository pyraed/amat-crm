import { supabaseAdmin } from '@/lib/supabase'
import { LoanLead, Message } from '@/lib/types'
import BandejaClient from '@/components/BandejaClient'

export const dynamic = 'force-dynamic'

const ESTADOS_EXCLUIDOS = ['finalizado', 'rejected', 'not_interested', 'resolved', 'unresolved']

export default async function Home() {
  const { data: messages } = await supabaseAdmin
    .from('amat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  const phones = [...new Set((messages || []).map((m: any) => m.phone_number).filter(Boolean))]

  let leads: LoanLead[] = []
  if (phones.length > 0) {
    const { data } = await supabaseAdmin
      .from('amat_loan_leads')
      .select('*')
      .in('phone_number', phones.slice(0, 500))
      .not('status', 'in', `(${ESTADOS_EXCLUIDOS.map(s => `"${s}"`).join(',')})`)
      .eq('archived', false)   // ← excluye conversaciones finalizadas
    leads = (data as LoanLead[]) || []
  }

  return (
    <main className="h-screen flex flex-col" style={{background:"#F8FAFC"}}>
      <BandejaClient
        initialLeads={leads}
        initialMessages={(messages as Message[]) || []}
      />
    </main>
  )
}
