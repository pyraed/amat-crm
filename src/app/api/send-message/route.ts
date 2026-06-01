import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { phone, text, senderName, template } = await req.json()

    if (!phone || (!text && !template)) {
      return NextResponse.json({ error: 'phone y text o template son requeridos' }, { status: 400 })
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN

    if (phoneNumberId && accessToken) {
      // Armar body según si es plantilla o texto libre
      const waBody = template
        ? {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              // Mapear IDs internos a nombres aprobados por Meta
              name: template === 'ayuda_economica' ? 'primer_contacto_esp' : template,
              language: { code: 'es_AR' },
            },
          }
        : {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: text },
          }

      const waRes = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(waBody),
        }
      )
      if (!waRes.ok) {
        const err = await waRes.json()
        console.error('WhatsApp API error:', err)
      }
    }

    // Texto a guardar en Supabase (para plantillas guardamos el contenido real)
    const TEMPLATES: Record<string, string> = {
      recontacto: 'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
      ayuda_economica: 'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
      primer_contacto_esp: 'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
    }

    const bodyToSave = template ? (TEMPLATES[template] || template) : text

    await supabaseAdmin.from('amat_messages').insert({
      phone_number: phone,
      direction:    'out',
      body:         bodyToSave,
      sender:       senderName || 'asesor',
      created_at:   new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('send-message error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
