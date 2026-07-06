import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const META_TEMPLATE_NAMES: Record<string, string> = {
  'primer_contacto_esp':                  'primer_contacto_esp',
  'recontacto':                           'recontacto',
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
      templateName,
      templateParams,
      template,
    } = body

    const resolvedTemplate = templateName || template || null

    if (!phone || (!text && !resolvedTemplate)) {
      return NextResponse.json({ error: 'phone y (text o template) son requeridos' }, { status: 400 })
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN   || process.env.META_TOKEN

    // FIX 3: alertar si faltan env vars en vez de skipear silenciosamente
    if (!phoneNumberId || !accessToken) {
      console.error('send-message: faltan env vars WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN')
      return NextResponse.json({ error: 'Configuración de WhatsApp incompleta' }, { status: 500 })
    }

    const metaName = META_TEMPLATE_NAMES[resolvedTemplate] || resolvedTemplate

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

    // FIX 1: timeout de 12 segundos para el fetch a Meta
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    let metaOk = false
    let metaError: string | null = null

    try {
      const waRes = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(waBody),
          signal: controller.signal,
        }
      )
      clearTimeout(timeout)

      if (!waRes.ok) {
        const err = await waRes.json()
        metaError = err?.error?.message || `HTTP ${waRes.status}`
        console.error('WhatsApp API error:', JSON.stringify(err))
        // FIX 2: guardar el intento en amat_messages igual, marcando el error
        await supabaseAdmin.from('amat_messages').insert({
          phone_number: phone,
          direction:    'out',
          body:         `[ERROR META: ${metaError}] ${resolvedTemplate ? (TEMPLATES_SAVE[resolvedTemplate] || resolvedTemplate) : text}`,
          sender:       senderName || 'asesor',
          created_at:   new Date().toISOString(),
        })
        return NextResponse.json({ ok: false, error: metaError }, { status: 200 }) // 200 para que el cliente no crashee
      }

      metaOk = true
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      const isTimeout = fetchErr?.name === 'AbortError'
      metaError = isTimeout ? 'Timeout al contactar WhatsApp' : fetchErr.message
      console.error('send-message fetch error:', metaError)
      // FIX 2: registrar el intento fallido igual
      await supabaseAdmin.from('amat_messages').insert({
        phone_number: phone,
        direction:    'out',
        body:         `[${isTimeout ? 'TIMEOUT' : 'ERROR RED'}] ${resolvedTemplate ? (TEMPLATES_SAVE[resolvedTemplate] || resolvedTemplate) : text}`,
        sender:       senderName || 'asesor',
        created_at:   new Date().toISOString(),
      })
      return NextResponse.json({ ok: false, error: metaError }, { status: 200 })
    }

    // Éxito — guardar mensaje normalmente
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
