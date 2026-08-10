import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const D360_TEMPLATE_NAMES: Record<string, string> = {
  'primer_contacto_esp':                  'primer_contacto_esp',
  'recontacto':                           'recontacto',
  'ayuda_economica':                      'primer_contacto_esp',
  'ayuda_economica_primer_contacto_amat': 'primer_contacto_esp',
  'recontacto_sin_respuesta_amat':        'recontacto',
  'informacion_general_amat':             'recontacto',
  'documentacion_pendiente':              'documentacion_pendiente',
}

// Plantillas definidas en Meta SIN variables — no mandar components
const TEMPLATES_SIN_PARAMS = ['primer_contacto_esp', 'recontacto', 'documentacion_pendiente']

const TEMPLATES_SAVE: Record<string, string> = {
  'primer_contacto_esp':           'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto':                    'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'ayuda_economica':               'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto_sin_respuesta_amat': 'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'documentacion_pendiente':       'Hola!\n\nTu solicitud de Ayuda Económica está pendiente de documentación. Por favor, respondé este mensaje adjuntando la documentación faltante o comunicate con nosotros para resolver tus dudas. Gracias!',
}

// Base URL fija de la Messaging API de 360dialog — no hace falta phone_number_id
// en la URL, 360dialog lo resuelve automáticamente a partir del D360-API-KEY.
const D360_BASE_URL = 'https://waba-v2.360dialog.io'

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

    // Antes: WHATSAPP_PHONE_NUMBER_ID / PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN / META_TOKEN
    // Ahora: una sola variable, la API key de 360dialog identifica el canal.
    const d360ApiKey = process.env.D360_API_KEY

    if (!d360ApiKey) {
      console.error('send-message: falta env var D360_API_KEY')
      return NextResponse.json({ error: 'Configuración de WhatsApp incompleta' }, { status: 500 })
    }

    const templateNameResolved = D360_TEMPLATE_NAMES[resolvedTemplate] || resolvedTemplate

    const components =
      templateParams &&
      Object.keys(templateParams).length > 0 &&
      !TEMPLATES_SIN_PARAMS.includes(templateNameResolved)
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
            name: templateNameResolved,
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

    // FIX 1 (se mantiene): timeout de 12 segundos para el fetch
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    let metaOk = false
    let metaError: string | null = null

    try {
      const waRes = await fetch(
        `${D360_BASE_URL}/messages`,
        {
          method: 'POST',
          headers: {
            'D360-API-KEY': d360ApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(waBody),
          signal: controller.signal,
        }
      )
      clearTimeout(timeout)

      if (!waRes.ok) {
        const err = await waRes.json().catch(() => ({}))
        // 360dialog devuelve errores con la misma forma que la Cloud API de Meta
        // (err.error.message), pero por las dudas cubrimos variantes.
        metaError = err?.error?.message || err?.message || `HTTP ${waRes.status}`
        console.error('360dialog API error:', JSON.stringify(err))
        // FIX 2 (se mantiene): guardar el intento en amat_messages igual, marcando el error
        await supabaseAdmin.from('amat_messages').insert({
          phone_number: phone,
          direction:    'out',
          body:         `[ERROR 360DIALOG: ${metaError}] ${resolvedTemplate ? (TEMPLATES_SAVE[resolvedTemplate] || resolvedTemplate) : text}`,
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
      // FIX 2 (se mantiene): registrar el intento fallido igual
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
