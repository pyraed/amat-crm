// ─────────────────────────────────────────────────────────────────────────────
//  SERVICES · REPORT SERVICE
//  Cálculo de rangos de fecha por período y carga de datos de reportes.
//
//  Por qué existe: loadReportes en BandejaClient mezclaba cálculo de fechas,
//  query paginada en loop, y cross-query de flujos. Este servicio separa
//  esas responsabilidades.
//
//  Qué ocurriría si desaparece: el tab de reportes no podría cargar datos.
// ─────────────────────────────────────────────────────────────────────────────

import { LoanLead } from '@/lib/types'
import { fetchReporteLeads } from './lead.service'
import { fetchFlujoMap } from './consulta.service'

export type ReportePeriodo = 'mes_actual' | 'mes_pasado' | '3_meses' | '6_meses' | 'anio_actual' | 'historico' | 'custom'

export type ReporteRango = {
  desde: string | null
  hasta: string | null
}

/**
 * Calcula el rango de fechas para un período dado.
 */
export function calcularRango(
  periodo: ReportePeriodo,
  desdeCustom?: string,
  hastaCustom?: string
): ReporteRango {
  const ahora = new Date()

  switch (periodo) {
    case 'mes_actual':
      return {
        desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString(),
        hasta: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString(),
      }
    case 'mes_pasado':
      return {
        desde: new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString(),
        hasta: new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59).toISOString(),
      }
    case '3_meses':
      return {
        desde: new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1).toISOString(),
        hasta: ahora.toISOString(),
      }
    case '6_meses':
      return {
        desde: new Date(ahora.getFullYear(), ahora.getMonth() - 5, 1).toISOString(),
        hasta: ahora.toISOString(),
      }
    case 'anio_actual':
      return {
        desde: new Date(ahora.getFullYear(), 0, 1).toISOString(),
        hasta: ahora.toISOString(),
      }
    case 'custom':
      return {
        desde: desdeCustom ? new Date(desdeCustom).toISOString() : null,
        hasta: hastaCustom ? new Date(hastaCustom + 'T23:59:59').toISOString() : null,
      }
    case 'historico':
    default:
      return { desde: null, hasta: null }
  }
}

export type ReporteData = {
  leads:     LoanLead[]
  flujoMap:  Record<string, string>
  cerradosHoy: number
}

/**
 * Carga todos los datos necesarios para el tab de reportes.
 */
export async function fetchReporteData(
  periodo: ReportePeriodo,
  desdeCustom?: string,
  hastaCustom?: string
): Promise<ReporteData> {
  const { desde, hasta } = calcularRango(periodo, desdeCustom, hastaCustom)
  const leads = await fetchReporteLeads(desde, hasta)

  const hoy = new Date().toDateString()
  const cerradosHoy = leads.filter(
    (l: any) => l.status === 'closed' && new Date(l.updated_at).toDateString() === hoy
  ).length

  const phones = leads.map((l: any) => l.phone_number).filter(Boolean) as string[]
  const flujoMap = await fetchFlujoMap(phones)

  return { leads, flujoMap, cerradosHoy }
}
