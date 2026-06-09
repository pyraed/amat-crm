import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const META_TEMPLATE_NAMES: Record<string, string> = {
  'primer_contacto_esp':                  'primer_contacto_esp',
  'recontacto':                           'recontacto',
  // aliases legacy
  'ayuda_economica':                      'primer_contacto_esp',
  'ayuda_economica_primer_contacto_amat': 'primer_contacto_esp',
  'recontacto_sin_respuesta_amat':        'recontacto',
  'informacion_general_amat':             'recontacto',
}

// Plantillas definidas en Meta SIN variables — no mandar components
const TEMPLATES_SIN_PARAMS = ['primer_contacto_esp', 'recontacto']

const TEMPLATES_SAVE: Record<string, string> = {
  'primer_contacto_esp':           'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto':                    'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'ayuda_economica':               'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto_sin_respuesta_amat': 'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      phone,
      text,
      senderName,
      // formato nuevo (campaña)
      templateName,
      templateParams,
      // formato viejo (mensajes individuales del CRM) — sigue funcionando
      template,
    } = body

    // Resolver el nombre de plantilla sea cual sea el formato que llegue
    const resolvedTemplate = templateName || template || null

    if (!phone || (!text && !resolvedTemplate)) {
      return NextResponse.json({ error: 'phone y (text o template) son requeridos' }, { status: 400 })
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN   || process.env.META_TOKEN

    if (phoneNumberId && accessToken) {
      const metaName = META_TEMPLATE_NAMES[resolvedTemplate] || resolvedTemplate

      // No mandar components si la plantilla en Meta no tiene variables
      const components =
        templateParams &&
        Object.keys(templateParams).length > 0 &&
        !TEMPLATES_SIN_PARAMS.includes(metaName)
          ? [{
              type: 'body',
              parameters: Object.values(templateParams).map((val: any) => ({
                type: 'text',
                text: String(val),
              })),
            }]
          : []

      const waBody = resolvedTemplate
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
        return NextResponse.json(
          { ok: false, error: err?.error?.message || JSON.stringify(err) },
          { status: waRes.status }
        )
      }
    }

    const bodyToSave = resolvedTemplate
      ? (TEMPLATES_SAVE[resolvedTemplate] || resolvedTemplate)
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
