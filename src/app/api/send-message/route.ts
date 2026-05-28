import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { phone, text, senderName } = await req.json()

    if (!phone || !text) {
      return NextResponse.json({ error: 'phone y text son requeridos' }, { status: 400 })
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN

    // Enviar mensaje por WhatsApp si hay credenciales configuradas
    if (phoneNumberId && accessToken) {
      const waRes = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: text },
          }),
        }
      )
      if (!waRes.ok) {
        const err = await waRes.json()
        console.error('WhatsApp API error:', err)
      }
    }

    // Guardar mensaje en Supabase
    await supabaseAdmin.from('amat_messages').insert({
      phone_number: phone,
      direction:    'out',
      body:         text,
      sender:       senderName || 'asesor',
      created_at:   new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('send-message error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
