'use client'

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTS · TABS · TAB DOCUMENTACIÓN
//  Permite buscar un lead por DNI o teléfono y ver el estado de su
//  documentación (DNI frente, DNI dorso, recibo, movimientos).
//  Las URLs son públicas — no requieren autenticación.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type DocLead = {
  full_name:                  string | null
  dni:                        string | null
  phone_number:               string | null
  dni_frente_url:             string | null
  dni_dorso_url:              string | null
  recibo_url:                 string | null
  movimientos_url:            string | null
  documentacion_completa:     boolean | null
  documentacion_completada_at:string | null
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

export default function TabDocumentacion() {
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<DocLead | null | 'not_found'>(null)
  const [preview, setPreview]   = useState<string | null>(null)

  const buscar = async () => {
    const val = query.trim()
    if (!val) return
    setLoading(true)
    setResult(null)

    const { data } = await supabase
      .from('amat_loan_leads')
      .select('full_name, dni, phone_number, dni_frente_url, dni_dorso_url, recibo_url, movimientos_url, documentacion_completa, documentacion_completada_at')
      .or(`dni.eq.${val},phone_number.eq.${val}`)
      .limit(1)
      .single()

    setLoading(false)
    setResult(data ? (data as DocLead) : 'not_found')
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const esImagen = (url: string) =>
    /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 20px 14px', background: 'white', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 10 }}>
          📄 Documentación de clientes
        </div>
        <div style={{ display: 'flex', gap: 8, maxWidth: 480 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="Buscar por DNI o teléfono…"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={buscar}
            disabled={loading || !query.trim()}
            style={{ padding: '8px 18px', borderRadius: 8, background: '#1D4ED8', color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: !query.trim() ? 0.5 : 1 }}>
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* ── Resultado ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>

        {result === null && (
          <div style={{ textAlign: 'center', color: '#94A3B8', marginTop: 60, fontSize: 13 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
            Ingresá un DNI o teléfono para buscar la documentación del cliente
          </div>
        )}

        {result === 'not_found' && (
          <div style={{ textAlign: 'center', color: '#EF4444', marginTop: 60, fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>❌</div>
            No se encontró ningún lead con ese DNI o teléfono
          </div>
        )}

        {result && result !== 'not_found' && (
          <div style={{ maxWidth: 700, margin: '0 auto' }}>

            {/* Datos del cliente */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#1D4ED8' }}>
                  {(result.full_name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{result.full_name || 'Sin nombre'}</div>
                  <div style={{ fontSize: 12, color: '#64748B', display: 'flex', gap: 12, marginTop: 2 }}>
                    {result.dni        && <span>🪪 {result.dni}</span>}
                    {result.phone_number && <span>📱 {result.phone_number}</span>}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  {result.documentacion_completa
                    ? <span style={{ background: '#ECFDF5', color: '#065F46', fontWeight: 700, fontSize: 12, padding: '4px 12px', borderRadius: 99 }}>✅ Documentación completa</span>
                    : <span style={{ background: '#FEF2F2', color: '#991B1B', fontWeight: 700, fontSize: 12, padding: '4px 12px', borderRadius: 99 }}>⏳ Documentación incompleta</span>
                  }
                </div>
              </div>
              {result.documentacion_completada_at && (
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Completada el {fmt(result.documentacion_completada_at)}
                </div>
              )}
            </div>

            {/* Documentos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {DOCS.map(doc => {
                const url = result[doc.key] as string | null
                return (
                  <div key={doc.key} style={{ background: 'white', borderRadius: 12, border: `1px solid ${url ? '#BBF7D0' : '#FEE2E2'}`, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 18 }}>{doc.emoji}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{doc.label}</span>
                      {!doc.required && (
                        <span style={{ fontSize: 10, color: '#94A3B8', background: '#F1F5F9', padding: '1px 6px', borderRadius: 99 }}>opcional</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: url ? '#065F46' : '#991B1B' }}>
                        {url ? '✅ Cargado' : '❌ Falta'}
                      </span>
                    </div>

                    {url ? (
                      <div>
                        {esImagen(url) ? (
                          <div
                            onClick={() => setPreview(url)}
                            style={{ cursor: 'zoom-in', borderRadius: 8, overflow: 'hidden', border: '1px solid #E2E8F0', maxHeight: 140 }}>
                            <img
                              src={url}
                              alt={doc.label}
                              style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                            />
                          </div>
                        ) : (
                          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px', border: '1px solid #E2E8F0' }}>
                            <span style={{ fontSize: 12, color: '#64748B', wordBreak: 'break-all' }}>Archivo adjunto</span>
                          </div>
                        )}
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}>
                          🔗 Abrir en nueva pestaña
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
        )}
      </div>

      {/* ── Preview modal ── */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}>
          <img
            src={preview}
            alt="preview"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setPreview(null)}
            style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 22, borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', fontWeight: 700 }}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
