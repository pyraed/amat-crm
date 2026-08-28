// ─────────────────────────────────────────────────────────────────────────────
//  HOOKS · USE REPORTES
//  Maneja el tab de reportes: período, datos y carga.
//
//  Por qué existe: reporteLeads, pipelineFlujoMap, reporteMode y loadReportes
//  vivían en BandejaClient. Este hook los encapsula.
//
//  Qué ocurriría si desaparece: el tab de reportes dejaría de mostrar datos.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { LoanLead } from '@/lib/types'
import { fetchReporteData } from '@/services/report.service'

export function useReportes(
  tab: string,
  setCerradosHoyCount: (n: number) => void
) {
  const [reporteLeads, setReporteLeads]         = useState<LoanLead[]>([])
  const [pipelineFlujoMap, setPipelineFlujoMap] = useState<Record<string,string>>({})
  const [reporteMode, setReporteMode]           = useState<'ventas'|'cobranzas'>('ventas')
  const [reportePeriodo, setReportePeriodo]     = useState('mes_actual')
  const [reporteDesde, setReporteDesde]         = useState('')
  const [reporteHasta, setReporteHasta]         = useState('')

  const loadReportes = async (
    periodo?: string,
    desdeCustom?: string,
    hastaCustom?: string
  ) => {
    const p = (periodo ?? reportePeriodo) as any
    try {
      const { leads, flujoMap, cerradosHoy } = await fetchReporteData(p, desdeCustom, hastaCustom)
      setReporteLeads(leads)
      setCerradosHoyCount(cerradosHoy)
      setPipelineFlujoMap(flujoMap)
    } catch(e: any) {
      console.error('[useReportes] Error al cargar reportes:', e)
      alert('❌ Error al cargar los reportes. Intentá de nuevo.')
    }
  }

  return {
    reporteLeads,
    pipelineFlujoMap,
    reporteMode, setReporteMode,
    reportePeriodo, setReportePeriodo,
    reporteDesde, setReporteDesde,
    reporteHasta, setReporteHasta,
    loadReportes,
  }
}
