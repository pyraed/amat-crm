import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const META_TEMPLATE_NAMES: Record<string, string> = {
  'primer_contacto_esp':                  'primer_contacto_esp',
  'recontacto':                           'recontacto',
  'ayuda_economica':                      'primer_contacto_esp',
  'ayuda_economica_primer_contacto_amat': 'primer_contacto_esp',
  'recontacto_sin_respuesta_amat':        'recontacto',
  'informacion_general_amat':             'recontacto',
  'documentacion_pendiente':              'documentacion_pendiente',
}

// Plantillas sin variables — no mandar components
const TEMPLATES_SIN_PARAMS = ['primer_contacto_esp', 'recontacto', 'documentacion_pendiente']

const TEMPLATES_SAVE: Record<string, string> = {
  'primer_contacto_esp':                  'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto':                           'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'ayuda_economica':                      'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'ayuda_economica_primer_contacto_amat': 'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto_sin_respuesta_amat':        'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'informacion_general_amat':             'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'documentacion_pendiente':              'Hola!\n\nTu solicitud de Ayuda Económica está pendiente de documentación. Por favor, respondé este mensaje adjuntando la documentación faltante o comunicate con nosotros para resolver tus dudas. Gracias!',
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

    // ── Rama Telegram ─────────────────────────────────────────────────────────
    // Si el phone empieza con "tg_", el mensaje va por el bot de Telegram.
    // El bot ya guarda el mensaje saliente en amat_messages internamente,
    // así que NO hacemos insert acá para evitar duplicados.
    if (String(phone).startsWith('tg_')) {
      const telegramBotUrl = process.env.TELEGRAM_BOT_SERVICE_URL

      if (!telegramBotUrl) {
        console.error('send-message: falta env var TELEGRAM_BOT_SERVICE_URL')
        return NextResponse.json({ error: 'Configuración de Telegram incompleta' }, { status: 500 })
      }

      const textoTg = resolvedTemplate
        ? (TEMPLATES_SAVE[resolvedTemplate] || resolvedTemplate)
        : text

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)

      try {
        const tgRes = await fetch(`${telegramBotUrl}/send`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ phone, text: textoTg }),
          signal:  controller.signal,
        })
        clearTimeout(timeout)

        if (!tgRes.ok) {
          const err = await tgRes.json().catch(() => ({}))
          const tgError = err?.message || err?.error || `HTTP ${tgRes.status}`
          console.error('Telegram bot error:', JSON.stringify(err))
          return NextResponse.json({ ok: false, error: tgError }, { status: 200 })
        }

        return NextResponse.json({ ok: true })
      } catch (fetchErr: any) {
        clearTimeout(timeout)
        const isTimeout = fetchErr?.name === 'AbortError'
        const tgError = isTimeout ? 'Timeout al contactar Telegram' : fetchErr.message
        console.error('send-message Telegram fetch error:', tgError)
        return NextResponse.json({ ok: false, error: tgError }, { status: 200 })
      }
    }
    // ── Fin rama Telegram ─────────────────────────────────────────────────────

    // ── Rama WhatsApp / Meta Cloud API ────────────────────────────────────────
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN   || process.env.META_TOKEN

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
            'Content-Type':  'application/json',
          },
          body: JSON.stringify(waBody),
          signal: controller.signal,
        }
      )
      clearTimeout(timeout)

      if (!waRes.ok) {
        const err = await waRes.json().catch(() => ({}))
        metaError = err?.error?.message || `HTTP ${waRes.status}`
        console.error('WhatsApp API error:', JSON.stringify(err))
        await supabaseAdmin.from('amat_messages').insert({
          phone_number: phone,
          direction:    'out',
          body:         `[ERROR META: ${metaError}] ${resolvedTemplate ? (TEMPLATES_SAVE[resolvedTemplate] || resolvedTemplate) : text}`,
          sender:       senderName || 'asesor',
          created_at:   new Date().toISOString(),
        })
        return NextResponse.json({ ok: false, error: metaError }, { status: 200 })
      }

      metaOk = true
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      const isTimeout = fetchErr?.name === 'AbortError'
      metaError = isTimeout ? 'Timeout al contactar WhatsApp' : fetchErr.message
      console.error('send-message fetch error:', metaError)
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
