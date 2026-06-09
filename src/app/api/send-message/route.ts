import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const META_TEMPLATE_NAMES: Record<string, string> = {
  'primer_contacto_esp': 'primer_contacto_esp',
  'recontacto':          'recontacto',
  // aliases por si algo viejo lo sigue llamando así
  'ayuda_economica':                      'primer_contacto_esp',
  'ayuda_economica_primer_contacto_amat': 'primer_contacto_esp',
  'recontacto_sin_respuesta_amat':        'recontacto',
  'informacion_general_amat':             'recontacto', // no existe en Meta, fallback a recontacto
}

const TEMPLATES_SAVE: Record<string, string> = {
  'primer_contacto_esp': 'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto':          'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
}

export async function POST(req: NextRequest) {
  try {
    const { phone, text, senderName, templateName, templateParams } = await req.json()

    if (!phone || (!text && !templateName)) {
      return NextResponse.json({ error: 'phone y (text o templateName) son requeridos' }, { status: 400 })
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN   || process.env.META_TOKEN

    if (phoneNumberId && accessToken) {
      const metaName = META_TEMPLATE_NAMES[templateName] || templateName

      // Armar components con las variables si las hay
      // El orden de Object.values tiene que coincidir con el orden de {{1}}, {{2}} en Meta
      const components =
        templateParams && Object.keys(templateParams).length > 0
          ? [{
              type: 'body',
              parameters: Object.values(templateParams).map((val: any) => ({
                type: 'text',
                text: String(val),
              })),
            }]
          : []

      const waBody = templateName
        ? {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              name: metaName,
              language: { code: 'es_AR' },
              ...(components.length > 0 && { components }),
            },
          }
        : {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: text },
          }

      const waRes = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
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
        console.error('WhatsApp API error:', JSON.stringify(err))
        // Status real para que el frontend lo detecte correctamente
        return NextResponse.json(
          { ok: false, error: err?.error?.message || JSON.stringify(err) },
          { status: waRes.status }
        )
      }
    }

    const bodyToSave = templateName
      ? (TEMPLATES_SAVE[META_TEMPLATE_NAMES[templateName] || templateName] || templateName)
      : text

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
