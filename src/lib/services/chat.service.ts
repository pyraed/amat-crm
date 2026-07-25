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
 * Registra automáticamente en amat_campanas si el envío tiene éxito.
 */
export async function sendTemplate(params: {
  phone:      string
  template:   string
  senderName: string
  dni?:       string | null
}): Promise<{ ok: boolean }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    await fetch('/api/send-message', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone: params.phone, template: params.template, senderName: params.senderName }),
      signal:  controller.signal,
    })
    clearTimeout(timeout)
  } catch (e) {
    console.error('[chat.service:sendTemplate] error o timeout:', e)
    // No devolvemos error — el registro de campaña igual se intenta
  }

  await registrarCampana({
    phone:     params.phone,
    dni:       params.dni,
    plantilla: params.template,
    operador:  params.senderName,
  })

  return { ok: true }
}
