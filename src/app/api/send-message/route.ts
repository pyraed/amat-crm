import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const TEMPLATES_SAVE: Record<string, string> = {
  'primer_contacto_esp':                  'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto':                           'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'ayuda_economica':                      'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'ayuda_economica_primer_contacto_amat': 'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto_sin_respuesta_amat':        'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'informacion_general_amat':             'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'documentacion_pendiente':              'Hola!\n\nTu solicitud de Ayuda Económica está pendiente de documentación. Por favor, respondé este mensaje adjuntando la documentación faltante o comunicate con nosotros para resolver tus dudas. Gracias!',
}

const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      phone,
      text,
      senderName,
      templateName,
      template,
    } = body

    const resolvedTemplate = templateName || template || null

    if (!phone || (!text && !resolvedTemplate)) {
      return NextResponse.json({ error: 'phone y (text o template) son requeridos' }, { status: 400 })
    }

    const textoAEnviar = resolvedTemplate
      ? (TEMPLATES_SAVE[resolvedTemplate] || resolvedTemplate)
      : text

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

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)

      try {
        const tgRes = await fetch(`${telegramBotUrl}/send`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ phone, text: textoAEnviar }),
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

    // ── Rama WhatsApp / Evolution API ─────────────────────────────────────────
    const evolutionApiKey = process.env.EVOLUTION_API_KEY

    if (!evolutionApiKey || !EVOLUTION_API_URL || !EVOLUTION_INSTANCE) {
      console.error('send-message: faltan env vars EVOLUTION_API_KEY / EVOLUTION_API_URL / EVOLUTION_INSTANCE')
      return NextResponse.json({ error: 'Configuración de WhatsApp incompleta' }, { status: 500 })
    }

    // Evolution API espera el número limpio, solo dígitos con código de país
    // (sin '+', sin espacios, sin sufijo '@s.whatsapp.net').
    const phoneClean = String(phone).replace(/\D/g, '')

    const evoBody = {
      number: phoneClean,
      text:   textoAEnviar,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    let evoOk = false
    let evoError: string | null = null

    try {
      const evoRes = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        {
          method:  'POST',
          headers: {
            'apikey':         evolutionApiKey,
            'Content-Type':   'application/json',
          },
          body:   JSON.stringify(evoBody),
          signal: controller.signal,
        }
      )
      clearTimeout(timeout)

      if (!evoRes.ok) {
        const err = await evoRes.json().catch(() => ({}))
        evoError = err?.message || err?.error || `HTTP ${evoRes.status}`
        console.error('Evolution API error:', JSON.stringify(err))
        await supabaseAdmin.from('amat_messages').insert({
          phone_number: phone,
          direction:    'out',
          body:         `[ERROR EVOLUTION: ${evoError}] ${textoAEnviar}`,
          sender:       senderName || 'asesor',
          created_at:   new Date().toISOString(),
        })
        return NextResponse.json({ ok: false, error: evoError }, { status: 200 })
      }

      evoOk = true
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      const isTimeout = fetchErr?.name === 'AbortError'
      evoError = isTimeout ? 'Timeout al contactar WhatsApp' : fetchErr.message
      console.error('send-message fetch error:', evoError)
      await supabaseAdmin.from('amat_messages').insert({
        phone_number: phone,
        direction:    'out',
        body:         `[${isTimeout ? 'TIMEOUT' : 'ERROR RED'}] ${textoAEnviar}`,
        sender:       senderName || 'asesor',
        created_at:   new Date().toISOString(),
      })
      return NextResponse.json({ ok: false, error: evoError }, { status: 200 })
    }

    // Éxito WhatsApp — guardar mensaje normalmente
    await supabaseAdmin.from('amat_messages').insert({
      phone_number: phone,
      direction:    'out',
      body:         textoAEnviar,
      sender:       senderName || 'asesor',
      created_at:   new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('send-message error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
