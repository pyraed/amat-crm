// ─────────────────────────────────────────────────────────────────────────────
//  SERVICES · CHAT SERVICE
//  Toda interacción con amat_messages y amat_campanas relacionada con el chat.
//
//  Por qué existe: sendReply, sendTemplate, cargarMensajes y puedeEnviarPlantilla
//  vivían dentro de BandejaClient con acceso directo a Supabase y fetch.
//  Este servicio los centraliza, dejando al componente solo con la UI.
//
//  Qué ocurriría si desaparece: el sistema perdería la capacidad de enviar
//  mensajes y cargar el historial de chat.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import { Message } from '@/lib/types'

const LIMITE_PLANTILLA_HORAS = 24

/**
 * Carga los últimos 200 mensajes de un teléfono, ordenados de más viejo a más nuevo.
 */
export async function fetchMensajesPhone(phone: string): Promise<Message[]> {
  const { data } = await supabase
    .from('amat_messages')
    .select('id,phone_number,body,direction,sender,created_at,media_url,media_type')
    .eq('phone_number', phone)
    .order('created_at', { ascending: false })
    .limit(200)
  return data ? (data as Message[]).reverse() : []
}

/**
 * Verifica si se puede enviar una plantilla a un número.
 * Regla: no se puede enviar si ya se envió una en las últimas 24hs.
 */
export async function puedeEnviarPlantilla(
  phone: string
): Promise<{ ok: boolean; horasRestantes?: number }> {
  const desde = new Date(Date.now() - LIMITE_PLANTILLA_HORAS * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('amat_campanas')
    .select('fecha')
    .eq('telefono', phone)
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .limit(1)

  if (data?.length) {
    const horasPasadas = (Date.now() - new Date(data[0].fecha).getTime()) / (1000 * 60 * 60)
    return { ok: false, horasRestantes: Math.ceil(LIMITE_PLANTILLA_HORAS - horasPasadas) }
  }
  return { ok: true }
}

/**
 * Registra un envío de plantilla en amat_campanas.
 */
export async function registrarCampana(params: {
  phone:     string
  dni?:      string | null
  plantilla: string
  operador:  string
}) {
  try {
    await supabase.from('amat_campanas').insert({
      documento: params.dni || null,
      telefono:  params.phone,
      fecha:     new Date().toISOString(),
      plantilla: params.plantilla,
      operador:  params.operador,
    })
  } catch (e) {
    console.error('[chat.service:registrarCampana] Error:', e)
    // No crítico — no bloquear el flujo de envío
  }
}

/**
 * Envía un mensaje de texto libre por WhatsApp vía /api/send-message.
 * Devuelve ok:true si el fetch no tiró error.
 */
export async function sendReply(params: {
  phone:      string
  text:       string
  senderName: string
}): Promise<{ ok: boolean }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    await fetch('/api/send-message', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone: params.phone, text: params.text, senderName: params.senderName }),
      signal:  controller.signal,
    })
    clearTimeout(timeout)
    return { ok: true }
  } catch (e) {
    console.error('[chat.service:sendReply] error o timeout:', e)
    return { ok: false }
  }
}

/**
 * Envía una plantilla WhatsApp vía /api/send-message.
 * Registra en amat_campanas SOLO si Meta confirmó el envío.
 *
 * Comportamiento anterior: silenciaba errores y registraba la campaña
 * siempre, bloqueando el número 24hs aunque el mensaje no hubiera salido.
 * Comportamiento actual: lee la respuesta de Meta, propaga el error al
 * caller si falló, y solo registra en amat_campanas si el envío fue exitoso.
 */
export async function sendTemplate(params: {
  phone:      string
  template:   string
  senderName: string
  dni?:       string | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController()
    // 12 segundos — alineado con el timeout interno de route.ts
    // El valor anterior (8s) podía abortar el cliente antes de que route.ts terminara,
    // dejando el fetch del servidor en vuelo sin que el cliente lo supiera.
    const timeout = setTimeout(() => controller.abort(), 12000)
    const res = await fetch('/api/send-message', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone: params.phone, template: params.template, senderName: params.senderName }),
      signal:  controller.signal,
    })
    clearTimeout(timeout)

    // .catch(() => ({})) cubre: respuesta no-JSON, fetch fallido, excepción.
    // En todos esos casos json.ok es undefined (falsy) → se trata como error.
    const json = await res.json().catch(() => ({}))
    if (!json.ok) {
      const error = json.error || 'Error al enviar la plantilla'
      console.error('[chat.service:sendTemplate] Meta rechazó el envío:', error)
      return { ok: false, error }
    }
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError'
    const error = isTimeout ? 'Timeout al contactar WhatsApp' : (e?.message || 'Error de red')
    console.error('[chat.service:sendTemplate] error o timeout:', error)
    return { ok: false, error }
  }

  // Solo registrar si Meta confirmó el envío exitoso.
  // Si registrarCampana falla, no bloquea — el envío ya ocurrió.
  await registrarCampana({
    phone:     params.phone,
    dni:       params.dni,
    plantilla: params.template,
    operador:  params.senderName,
  })

  return { ok: true }
}
