import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { phone, text, senderName } = await req.json()

  const waRes = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text }
      })
    }
  )

  if (!waRes.ok) {
    return NextResponse.json({ error: 'WhatsApp API error' }, { status: 500 })
  }

  await supabaseAdmin.from('messages').insert({
    phone_number: phone,
    direction: 'out',
    body: text,
    sender: senderName
  })

  return NextResponse.json({ ok: true })
}