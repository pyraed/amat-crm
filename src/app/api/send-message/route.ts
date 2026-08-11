import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Ya no existen "templates aprobadas por Meta" con Evolution API/Baileys —
// todo se manda como texto libre. Mantenemos el mapeo de nombre → texto
// para que el CRM siga pudiendo invocar la campaña por su nombre corto,
// pero el resultado siempre es un mensaje de texto plano.
const TEMPLATES_SAVE: Record<string, string> = {
  'primer_contacto_esp':           'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto':                    'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'ayuda_economica':               'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'ayuda_economica_primer_contacto_amat': 'Hola! Te contactamos desde AMAT (Asociación Mutual Amarilla de Trabajadores).\nComo empleado/a de la provincia de Buenos Aires, podés acceder a una Ayuda Económica con descuento directo en tu recibo de sueldo, sin garante.\n¿Te interesa que te contemos más? Respondé SI para continuar',
  'recontacto_sin_respuesta_amat': 'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'informacion_general_amat':      'Hola! Te escribimos nuevamente desde AMAT.\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Sin garante y con descuento por recibo.\n¿Podemos ayudarte?',
  'documentacion_pendiente':       'Hola!\n\nTu solicitud de Ayuda Económica está pendiente de documentación. Por favor, respondé este mensaje adjuntando la documentación faltante o comunicate con nosotros para resolver tus dudas. Gracias!',
}

// Config de Evolution API — reemplaza a D360_BASE_URL / D360_API_KEY.
// EVOLUTION_API_URL y EVOLUTION_INSTANCE van como env vars en Railway.
const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL  // ej: https://evolution-api-zd6c.onrender.com
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE  // ej: bot_service_02

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

    const evolutionApiKey = process.env.EVOLUTION_API_KEY

    if (!evolutionApiKey || !EVOLUTION_API_URL || !EVOLUTION_INSTANCE) {
      console.error('send-message: faltan env vars EVOLUTION_API_KEY / EVOLUTION_API_URL / EVOLUTION_INSTANCE')
      return NextResponse.json({ error: 'Configuración de WhatsApp incompleta' }, { status: 500 })
    }

    // Si viene un template, resolvemos su texto guardado. Si no está mapeado,
    // usamos el nombre tal cual llegó (por si el CRM ya manda el texto final
    // en templateName por error, mejor no perder el mensaje).
    const textoAEnviar = resolvedTemplate
      ? (TEMPLATES_SAVE[resolvedTemplate] || resolvedTemplate)
      : text

    // Evolution API espera el número limpio, solo dígitos con código de país
    // (sin '+', sin espacios, sin sufijo '@s.whatsapp.net').
    const phoneClean = String(phone).replace(/\D/g, '')

    const evoBody = {
      number: phoneClean,
      text: textoAEnviar,
    }

    // Timeout de 12 segundos para el fetch (se mantiene igual que antes)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    let evoOk = false
    let evoError: string | null = null

    try {
      const evoRes = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        {
          method: 'POST',
          headers: {
            'apikey': evolutionApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(evoBody),
          signal: controller.signal,
        }
      )
      clearTimeout(timeout)

      if (!evoRes.ok) {
        const err = await evoRes.json().catch(() => ({}))
        evoError = err?.message || err?.error || `HTTP ${evoRes.status}`
        console.error('Evolution API error:', JSON.stringify(err))
        // Guardar el intento en amat_messages igual, marcando el error
        await supabaseAdmin.from('amat_messages').insert({
          phone_number: phone,
          direction:    'out',
          body:         `[ERROR EVOLUTION: ${evoError}] ${textoAEnviar}`,
          sender:       senderName || 'asesor',
          created_at:   new Date().toISOString(),
        })
        return NextResponse.json({ ok: false, error: evoError }, { status: 200 }) // 200 para que el cliente no crashee
      }

      evoOk = true
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      const isTimeout = fetchErr?.name === 'AbortError'
      evoError = isTimeout ? 'Timeout al contactar WhatsApp' : fetchErr.message
      console.error('send-message fetch error:', evoError)
      // Registrar el intento fallido igual
      await supabaseAdmin.from('amat_messages').insert({
        phone_number: phone,
        direction:    'out',
        body:         `[${isTimeout ? 'TIMEOUT' : 'ERROR RED'}] ${textoAEnviar}`,
        sender:       senderName || 'asesor',
        created_at:   new Date().toISOString(),
      })
      return NextResponse.json({ ok: false, error: evoError }, { status: 200 })
    }

    // Éxito — guardar mensaje normalmente
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
