// ─────────────────────────────────────────────────────────────────────────────
//  SERVICES · EXPORT SERVICE
//  Generación de archivos Excel para exportación de ventas.
//
//  Por qué existe: exportVentas en BandejaClient mezclaba query a Supabase,
//  transformación de datos y generación de XLSX. Este servicio separa
//  la query y el formateo de la UI.
//
//  Qué ocurriría si desaparece: el botón "Exportar ventas" del tab de
//  consultas dejaría de funcionar.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchVentasCerradas } from './lead.service'

/**
 * Descarga un Excel con todas las ventas cerradas.
 * Importa xlsx de forma dinámica para no aumentar el bundle inicial.
 */
export async function exportarVentas(): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await fetchVentasCerradas()
    if (!data.length) {
      return { ok: false, error: 'No hay ventas cerradas para exportar' }
    }

    const XLSX = await import('xlsx')
    const fmtNum = (n: any) => (n ? Number(n).toLocaleString('es-AR') : '')

    const rows = data.map((l: any) => ({
      'DNI':             l.dni             || '',
      'Nombre':          l.full_name       || '',
      'Teléfono':        l.phone_number    || '',
      'Email':           l.email           || '',
      'Repartición':     l.reparticion     || '',
      'Entidad':         l.entidad         || '',
      'Línea':           l.linea           || '',
      'Monto ($)':       fmtNum(l.monto_solicitado),
      'Cuotas':          l.cant_cuotas     || '',
      'Valor cuota ($)': fmtNum(l.valor_cuota),
      'Asignado a':      l.assigned_to     || '',
      'Fecha venta':     l.fecha_venta
                           ? new Date(l.fecha_venta).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
                           : new Date(l.updated_at).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' }),
      'Observaciones':   l.notes           || '',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 28 }, { wch: 30 },
      { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 8  }, { wch: 16 },
      { wch: 12 }, { wch: 16 }, { wch: 30 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas AMAT')
    XLSX.writeFile(wb, 'AMAT_ventas_' + new Date().toISOString().slice(0, 10) + '.xlsx')

    return { ok: true }
  } catch (e: any) {
    console.error('[export.service:exportarVentas]', e)
    return { ok: false, error: e.message }
  }
}
