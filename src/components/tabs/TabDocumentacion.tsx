'use client'

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTS · TABS · TAB DOCUMENTACIÓN
//  Muestra leads que subieron recibo y permite buscar por DNI o teléfono.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { sanitizeSearch } from '@/lib/sanitize'

type DocLead = {
  id:                         number
  full_name:                  string | null
  dni:                        string | null
  phone_number:               string | null
  reparticion:                string | null
  status:                     string | null
  dni_frente_url:             string | null
  dni_dorso_url:              string | null
  recibo_url:                 string | null
  movimientos_url:            string | null
  documentacion_completa:     boolean | null
  documentacion_completada_at:string | null
  created_at:                 string
}

type DocItem = {
  key:      keyof DocLead
  label:    string
  emoji:    string
  required: boolean
}

const DOCS: DocItem[] = [
  { key: 'dni_frente_url',  label: 'DNI Frente',   emoji: '🪪', required: true  },
  { key: 'dni_dorso_url',   label: 'DNI Dorso',    emoji: '🪪', required: true  },
  { key: 'recibo_url',      label: 'Último recibo', emoji: '📄', required: true  },
  { key: 'movimientos_url', label: 'Movimientos',   emoji: '📊', required: false },
]

const PAGE_SIZE = 50

type Filtro = 'con_recibo' | 'doc_completa' | 'doc_incompleta' | 'todos'

export default function TabDocumentacion() {
  // ── Búsqueda individual ──
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState<DocLead | null>(null)
  const [preview, setPreview]   = useState<string | null>(null)

  // ── Listado ──
  const [leads, setLeads]       = useState<DocLead[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [filtro, setFiltro]     = useState<Filtro>('con_recibo')
  const [listLoading, setListLoading] = useState(false)
  const [listSearch, setListSearch]   = useState('')
  const [listSearchInput, setListSearchInput] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)

  const loadList = useCallback(async (p = page, f = filtro, s = listSearch) => {
    setListLoading(true)
    const seq = ++seqRef.current

    let q = supabase
      .from('amat_loan_leads')
      .select('id,full_name,dni,phone_number,reparticion,status,dni_frente_url,dni_dorso_url,recibo_url,movimientos_url,documentacion_completa,documentacion_completada_at,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)

    if (f === 'con_recibo') q = q.not('recibo_url', 'is', null)
    if (f === 'doc_completa') q = q.eq('documentacion_completa', true)
    if (f === 'doc_incompleta') {
      q = q.not('recibo_url', 'is', null).or('documentacion_completa.is.null,documentacion_completa.eq.false')
    }

    if (s.trim()) {
      const ss = sanitizeSearch(s)
      q = q.or(`full_name.ilike.%${ss}%,dni.ilike.%${ss}%,phone_number.ilike.%${ss}%`)
    }

    const { data, count, error } = await q
    if (seq !== seqRef.current) return
    if (!error) {
      setLeads((data as DocLead[]) || [])
      setTotal(count || 0)
    }
    setListLoading(false)
  }, [page, filtro, listSearch])

  useEffect(() => { loadList(0, filtro, '') }, []) // eslint-disable-line

  const handleListSearch = (val: string) => {
    setListSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setListSearch(val)
      setPage(0)
      loadList(0, filtro, val)
    }, 400)
  }

  const handleFiltro = (f: Filtro) => {
    setFiltro(f)
    setPage(0)
    loadList(0, f, listSearch)
  }

  const goPage = (p: number) => {
    setPage(p)
    loadList(p, filtro, listSearch)
  }

  // ── Búsqueda individual ──
  const buscar = async () => {
    const val = query.trim()
    if (!val) return
    setLoading(true)
    setSelected(null)

    const { data } = await supabase
      .from('amat_loan_leads')
      .select('id,full_name,dni,phone_number,reparticion,status,dni_frente_url,dni_dorso_url,recibo_url,movimientos_url,documentacion_completa,documentacion_completada_at,created_at')
      .or(`dni.eq.${sanitizeSearch(val)},phone_number.eq.${sanitizeSearch(val)}`)
      .limit(1)
      .single()

    setLoading(false)
    if (data) {
      setSelected(data as DocLead)
    } else {
      alert('No se encontró ningún lead con ese DNI o teléfono.')
    }
  }

  const selectLead = (lead: DocLead) => setSelected(lead)
  const clearSelected = () => setSelected(null)

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const esImagen = (url: string) =>
    /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)

  const docsCount = (lead: DocLead) => {
    let loaded = 0
    if (lead.dni_frente_url) loaded++
    if (lead.dni_dorso_url) loaded++
    if (lead.recibo_url) loaded++
    if (lead.movimientos_url) loaded++
    return loaded
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Vista detalle de un lead ──
  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>
        <div style={{ padding: '16px 20px 14px', background: 'white', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={clearSelected}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#475569', fontWeight: 500 }}>
            ← Volver al listado
          </button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>
            📄 Documentación de {selected.full_name || selected.dni || 'cliente'}
          </span>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            {/* Datos del cliente */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#1D4ED8' }}>
                  {(selected.full_name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{selected.full_name || 'Sin nombre'}</div>
                  <div style={{ fontSize: 12, color: '#64748B', display: 'flex', gap: 12, marginTop: 2 }}>
                    {selected.dni && <span>🪪 {selected.dni}</span>}
                    {selected.phone_number && <span>📱 {selected.phone_number}</span>}
                    {selected.reparticion && <span>🏛️ {selected.reparticion}</span>}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  {selected.documentacion_completa
                    ? <span style={{ background: '#ECFDF5', color: '#065F46', fontWeight: 700, fontSize: 12, padding: '4px 12px', borderRadius: 99 }}>Documentación completa</span>
                    : <span style={{ background: '#FEF2F2', color: '#991B1B', fontWeight: 700, fontSize: 12, padding: '4px 12px', borderRadius: 99 }}>Documentación incompleta</span>
                  }
                </div>
              </div>
              {selected.documentacion_completada_at && (
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Completada el {fmt(selected.documentacion_completada_at)}
                </div>
              )}
            </div>

            {/* Documentos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {DOCS.map(doc => {
                const url = selected[doc.key] as string | null
                return (
                  <div key={doc.key} style={{ background: 'white', borderRadius: 12, border: `1px solid ${url ? '#BBF7D0' : '#FEE2E2'}`, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 18 }}>{doc.emoji}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{doc.label}</span>
                      {!doc.required && (
                        <span style={{ fontSize: 10, color: '#94A3B8', background: '#F1F5F9', padding: '1px 6px', borderRadius: 99 }}>opcional</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: url ? '#065F46' : '#991B1B' }}>
                        {url ? 'Cargado' : 'Falta'}
                      </span>
                    </div>

                    {url ? (
                      <div>
                        {esImagen(url) ? (
                          <div
                            onClick={() => setPreview(url)}
                            style={{ cursor: 'zoom-in', borderRadius: 8, overflow: 'hidden', border: '1px solid #E2E8F0', maxHeight: 140 }}>
                            <img src={url} alt={doc.label} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                          </div>
                        ) : (
                          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px', border: '1px solid #E2E8F0' }}>
                            <span style={{ fontSize: 12, color: '#64748B' }}>Archivo adjunto</span>
                          </div>
                        )}
                        <a href={url} target="_blank" rel="noreferrer"
                          style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}>
                          Abrir en nueva pestaña
                        </a>
                      </div>
                    ) : (
                      <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '14px 12px', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
                        No cargado todavía
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Preview modal */}
        {preview && (
          <div onClick={() => setPreview(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}>
            <img src={preview} alt="preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
            <button onClick={() => setPreview(null)}
              style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 22, borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', fontWeight: 700 }}>
              ✕
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Vista listado principal ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 20px 12px', background: 'white', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>📄 Documentación de clientes</span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>{total} registros</span>
          {listLoading && <span style={{ fontSize: 12, color: '#94A3B8' }}>Cargando…</span>}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 3, background: '#F1F5F9', padding: 3, borderRadius: 8 }}>
            {([
              ['con_recibo', 'Con recibo'],
              ['doc_completa', 'Doc. completa'],
              ['doc_incompleta', 'Doc. incompleta'],
              ['todos', 'Todos'],
            ] as [Filtro, string][]).map(([f, label]) => (
              <button key={f} onClick={() => handleFiltro(f)}
                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                  background: filtro === f ? 'white' : 'transparent',
                  color: filtro === f ? '#1E293B' : '#64748B',
                  boxShadow: filtro === f ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Búsqueda en listado */}
          <div style={{ flex: 1, minWidth: 200, maxWidth: 340 }}>
            <input
              value={listSearchInput}
              onChange={e => handleListSearch(e.target.value)}
              placeholder="Filtrar por nombre, DNI o teléfono…"
              style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            />
          </div>

          {/* Búsqueda individual */}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder="Buscar por DNI exacto…"
              style={{ width: 160, padding: '7px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={buscar} disabled={loading || !query.trim()}
              style={{ padding: '7px 14px', borderRadius: 8, background: '#1D4ED8', color: 'white', border: 'none', fontWeight: 600, fontSize: 12, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: !query.trim() ? 0.5 : 1 }}>
              {loading ? '…' : 'Buscar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: '#F1F5F9', zIndex: 1 }}>
              {['Fecha', 'Nombre', 'DNI', 'Teléfono', 'Repartición', 'Docs'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #E2E8F0' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && !listLoading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: 13 }}>
                  No hay registros con documentación para mostrar
                </td>
              </tr>
            )}
            {leads.map((lead, i) => {
              const docs = docsCount(lead)
              return (
                <tr key={lead.id}
                  onClick={() => selectLead(lead)}
                  style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#F8FAFC')}>
                  <td style={{ padding: '10px 12px', color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(lead.created_at)}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 500, color: '#0F172A' }}>{lead.full_name || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#475569', fontFamily: 'monospace' }}>{lead.dni || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#475569', fontFamily: 'monospace' }}>{lead.phone_number || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                    {lead.reparticion
                      ? <span style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>{lead.reparticion}</span>
                      : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <span title="DNI Frente" style={{ width: 8, height: 8, borderRadius: '50%', background: lead.dni_frente_url ? '#10B981' : '#E2E8F0' }} />
                        <span title="DNI Dorso" style={{ width: 8, height: 8, borderRadius: '50%', background: lead.dni_dorso_url ? '#10B981' : '#E2E8F0' }} />
                        <span title="Recibo" style={{ width: 8, height: 8, borderRadius: '50%', background: lead.recibo_url ? '#10B981' : '#E2E8F0' }} />
                        <span title="Movimientos" style={{ width: 8, height: 8, borderRadius: '50%', background: lead.movimientos_url ? '#10B981' : '#E2E8F0' }} />
                      </div>
                      <span style={{ fontSize: 11, color: docs === 4 ? '#065F46' : docs >= 2 ? '#92400E' : '#991B1B', fontWeight: 600 }}>
                        {docs}/4
                      </span>
                      {lead.documentacion_completa && (
                        <span style={{ fontSize: 10, background: '#ECFDF5', color: '#065F46', padding: '1px 6px', borderRadius: 99, fontWeight: 600 }}>OK</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ── */}
      {totalPages > 1 && (
        <div style={{ padding: '12px 20px', background: 'white', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => goPage(0)} disabled={page === 0}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#CBD5E1' : '#475569', fontSize: 12 }}>
            «
          </button>
          <button onClick={() => goPage(page - 1)} disabled={page === 0}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#CBD5E1' : '#475569', fontSize: 12 }}>
            ‹
          </button>
          <span style={{ fontSize: 12, color: '#64748B' }}>Página {page + 1} de {totalPages}</span>
          <button onClick={() => goPage(page + 1)} disabled={page >= totalPages - 1}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', cursor: page >= totalPages - 1 ? 'default' : 'pointer', color: page >= totalPages - 1 ? '#CBD5E1' : '#475569', fontSize: 12 }}>
            ›
          </button>
          <button onClick={() => goPage(totalPages - 1)} disabled={page >= totalPages - 1}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', cursor: page >= totalPages - 1 ? 'default' : 'pointer', color: page >= totalPages - 1 ? '#CBD5E1' : '#475569', fontSize: 12 }}>
            »
          </button>
        </div>
      )}
    </div>
  )
}
