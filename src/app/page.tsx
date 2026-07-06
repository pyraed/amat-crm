import { supabaseAdmin } from '@/lib/supabase'
import { LoanLead, Message } from '@/lib/types'
import BandejaClient from '@/components/BandejaClient'

export const dynamic = 'force-dynamic'

const ESTADOS_EXCLUIDOS = ['finalizado', 'rejected', 'not_interested', 'resolved', 'unresolved']

export default async function Home() {
  // Traer solo mensajes de los últimos 30 días en el server, en lotes
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  let messages: Message[] = []
  let from = 0
  const BATCH = 1000

  while (true) {
    const { data: batch } = await supabaseAdmin
      .from('amat_messages')
      .select('id, phone_number, body, direction, sender, created_at, media_url, media_type')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .range(from, from + BATCH - 1)

    if (!batch || batch.length === 0) break
    messages = [...messages, ...batch as Message[]]
    if (batch.length < BATCH) break
    from += BATCH

    // Tope de seguridad: no más de 10.000 mensajes en SSR
    if (messages.length >= 10000) break
  }

  // Traer leads de los phones encontrados — en lotes de 200
  const phones = [...new Set(messages.map((m: any) => m.phone_number).filter(Boolean))]
  let leads: LoanLead[] = []

  if (phones.length > 0) {
    const CHUNK = 200
    const chunks = Array.from({ length: Math.ceil(phones.length / CHUNK) }, (_, i) =>
      phones.slice(i * CHUNK, (i + 1) * CHUNK)
    )
    const results = await Promise.all(
      chunks.map(chunk =>
        supabaseAdmin
          .from('amat_loan_leads')
          .select('*')
          .in('phone_number', chunk)
          .not('status', 'in', `(${ESTADOS_EXCLUIDOS.map(s => `"${s}"`).join(',')})`)
          .eq('archived', false)
          .then(({ data }) => (data as LoanLead[]) || [])
      )
    )
    leads = results.flat()
  }

  return (
    <main className="h-screen flex flex-col" style={{ background: '#F8FAFC' }}>
      <BandejaClient
        initialLeads={leads}
        initialMessages={messages}
      />
    </main>
  )
}
