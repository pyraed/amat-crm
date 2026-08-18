'use client'

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTS · TABS · TAB FORMULARIOS
//  Muestra los registros de amat_web_leads en modo solo lectura.
//  Filtros: búsqueda libre, repartición, paginación.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type WebLead = {
  id:               string
  created_at:       string
  full_name:        string | null
  dni:              string | null
  email:            string | null
  phone:            string | null
  reparticion_label:string | null
}

const PAGE_SIZE = 50

export default function TabFormularios() {
  const [leads, setLeads]       = useState<WebLead[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [page, setPage]         = useState(0)
  const [search, setSearch]     = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)

  const load = async (p = 0, s = search) => {
    setLoading(true)
    const seq = ++seqRef.current

    let q = supabase
      .from('amat_web_leads')
      .select('id,created_at,full_name,dni,email,phone,reparticion_label', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)

    if (s.trim()) {
      q = q.or(`full_name.ilike.%${s}%,dni.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`)
    }

    const { data, count, error } = await q

    if (seq !== seqRef.current) return
    if (!error) {
      setLeads((data as WebLead[]) || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }

  useEffect(() => { load(0, '') }, []) // eslint-disable-line

  const handleSearch = (val: string) => {
    setSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(val)
      setPage(0)
      load(0, val)
    }, 400)
  }

  const goPage = (p: number) => {
    setPage(p)
    load(p, search)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
      + ' ' + d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#F8FAFC' }}>

      {/* ── Header ── */}
      <div style={{ padding:'16px 20px 12px', background:'white', borderBottom:'1px solid #E2E8F0', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontWeight:700, fontSize:15, color:'#0F172A' }}>📋 Formularios web</span>
        <span style={{ fontSize:12, color:'#94A3B8' }}>{total} registros</span>
        <div style={{ flex:1, minWidth:200, maxWidth:340 }}>
          <input
            value={searchInput}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por nombre, DNI, email o teléfono…"
            style={{ width:'100%', padding:'7px 12px', borderRadius:8, border:'1px solid #E2E8F0', fontSize:13, outline:'none', fontFamily:'inherit' }}
          />
        </div>
        {loading && <span style={{ fontSize:12, color:'#94A3B8' }}>Cargando…</span>}
      </div>

      {/* ── Tabla ── */}
      <div style={{ flex:1, overflow:'auto', padding:'0 20px 20px' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ position:'sticky', top:0, background:'#F1F5F9', zIndex:1 }}>
              {['Fecha', 'Nombre', 'DNI', 'Email', 'Teléfono', 'Repartición'].map(h => (
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:600, color:'#475569', fontSize:12, whiteSpace:'nowrap', borderBottom:'1px solid #E2E8F0' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ textAlign:'center', padding:'40px', color:'#94A3B8', fontSize:13 }}>
                  No hay formularios para mostrar
                </td>
              </tr>
            )}
            {leads.map((l, i) => (
              <tr key={l.id} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
                <td style={{ padding:'10px 12px', color:'#64748B', whiteSpace:'nowrap' }}>{fmt(l.created_at)}</td>
                <td style={{ padding:'10px 12px', fontWeight:500, color:'#0F172A' }}>{l.full_name || '—'}</td>
                <td style={{ padding:'10px 12px', color:'#475569', fontFamily:'monospace' }}>{l.dni || '—'}</td>
                <td style={{ padding:'10px 12px', color:'#475569' }}>{l.email || '—'}</td>
                <td style={{ padding:'10px 12px', color:'#475569', fontFamily:'monospace' }}>{l.phone || '—'}</td>
                <td style={{ padding:'10px 12px', color:'#475569' }}>
                  {l.reparticion_label
                    ? <span style={{ background:'#EFF6FF', color:'#1D4ED8', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600 }}>{l.reparticion_label}</span>
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ── */}
      {totalPages > 1 && (
        <div style={{ padding:'12px 20px', background:'white', borderTop:'1px solid #E2E8F0', display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
          <button onClick={() => goPage(0)} disabled={page === 0}
            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #E2E8F0', background:'white', cursor:page===0?'default':'pointer', color:page===0?'#CBD5E1':'#475569', fontSize:12 }}>
            «
          </button>
          <button onClick={() => goPage(page - 1)} disabled={page === 0}
            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #E2E8F0', background:'white', cursor:page===0?'default':'pointer', color:page===0?'#CBD5E1':'#475569', fontSize:12 }}>
            ‹
          </button>
          <span style={{ fontSize:12, color:'#64748B' }}>Página {page + 1} de {totalPages}</span>
          <button onClick={() => goPage(page + 1)} disabled={page >= totalPages - 1}
            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #E2E8F0', background:'white', cursor:page>=totalPages-1?'default':'pointer', color:page>=totalPages-1?'#CBD5E1':'#475569', fontSize:12 }}>
            ›
          </button>
          <button onClick={() => goPage(totalPages - 1)} disabled={page >= totalPages - 1}
            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #E2E8F0', background:'white', cursor:page>=totalPages-1?'default':'pointer', color:page>=totalPages-1?'#CBD5E1':'#475569', fontSize:12 }}>
            »
          </button>
        </div>
      )}
    </div>
  )
}
