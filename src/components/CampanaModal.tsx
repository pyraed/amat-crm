'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { LoanLead } from '@/lib/types'

// ─────────────────────────────────────────────
//  PLANTILLAS (mismas que el sistema)
// ─────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'ayuda_economica',
    name: 'Ayuda Económica — Primer contacto',
    category: 'MARKETING',
    body: `Hola {{nombre}} 👋 Te contactamos desde *AMAT* (Asociación Mutual Amarilla de Trabajadores).\n\nComo empleado/a de {{reparticion}}, podés acceder a una *Ayuda Económica* con descuento directo en tu recibo de sueldo.\n\n¿Te interesa que te contemos más? Respondé *SI* para continuar.`,
    variables: ['nombre', 'reparticion'],
    metaName: 'primer_contacto_esp',
  },
  {
    id: 'recontacto',
    name: 'Recontacto — Sin respuesta previa',
    category: 'MARKETING',
    body: `Hola {{nombre}}, te escribimos nuevamente desde *AMAT*.\n\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Es sin garante y con descuento por recibo.\n\n¿Podemos ayudarte?`,
    variables: ['nombre'],
    metaName: 'recontacto',
  },
  // info_general eliminada — no existe en Meta todavía
]

const REPARTICIONES = [
  'MINISTERIO DE SEGURIDAD',
  'MINISTERIO DE EDUCACION',
  'SERVICIO PENITENCIARIO BONAERENSE',
  'MINISTERIO DE SALUD',
]

// Límites seguros por hora según nivel de Meta
const RATE_LIMITS = [
  { label: 'Conservador — 60/hora (nivel 1 nuevo)', value: 60 },
  { label: 'Moderado — 200/hora (nivel 1 establecido)', value: 200 },
  { label: 'Normal — 500/hora (nivel 2)', value: 500 },
  { label: 'Activo — 1.000/hora (nivel 2 establecido)', value: 1000 },
]

type CampanaResult = {
  phone: string
  name: string
  status: 'pending' | 'sent' | 'error' | 'skipped'
  error?: string
}

type Props = {
  onClose: () => void
}

export default function CampanaModal({ onClose }: Props) {
  const [step, setStep] = useState<'config' | 'preview' | 'running' | 'done'>('config')

  // Filtros de segmento
  const [filterRep, setFilterRep]     = useState('all')
  const [filterBanco, setFilterBanco] = useState('all')
  const [filterStatus, setFilterStatus] = useState('new')
  const [filterTel, setFilterTel]     = useState<'con' | 'all'>('con')
  const [filterAssigned, setFilterAssigned] = useState('all')
  const [limitCount, setLimitCount]   = useState('500')

  // Plantilla
  const [selectedTpl, setSelectedTpl] = useState(TEMPLATES[0])
  const [tplVars, setTplVars]         = useState<Record<string,string>>({})
  const [useContactName, setUseContactName] = useState(true)
  const [useContactRep, setUseContactRep]   = useState(true)

  // Rate
  const [rateLimit, setRateLimit]     = useState(200)

  // Estado de campaña
  const [contacts, setContacts]       = useState<LoanLead[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [results, setResults]         = useState<CampanaResult[]>([])
  const [running, setRunning]         = useState(false)
  const [paused, setPaused]           = useState(false)
  const [progress, setProgress]       = useState(0)
  const [sentCount, setSentCount]     = useState(0)
  const [errorCount, setErrorCount]   = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [startTime, setStartTime]     = useState<number>(0)
  const [eta, setEta]                 = useState('')
  const [campaignName, setCampaignName] = useState('')

  const pauseRef   = useRef(false)
  const cancelRef  = useRef(false)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Auto-scroll resultados
  useEffect(() => {
    if (resultsRef.current) {
      resultsRef.current.scrollTop = resultsRef.current.scrollHeight
    }
  }, [results])

  // Calcular ETA
  useEffect(() => {
    if (!running || sentCount === 0) return
    const elapsed = (Date.now() - startTime) / 1000
    const rate    = sentCount / elapsed
    const remaining = contacts.length - progress
    if (rate > 0) {
      const secsLeft = remaining / rate
      const mins = Math.floor(secsLeft / 60)
      const secs = Math.floor(secsLeft % 60)
      setEta(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`)
    }
  }, [sentCount, progress, running, startTime, contacts.length])

  // ── Cargar contactos del segmento ────────────────────────
  const loadContacts = async () => {
    setLoadingContacts(true)
    let q = supabase
      .from('loan_leads')
      .select('*')
      .not('phone_number', 'is', null)

    if (filterRep !== 'all')      q = q.eq('reparticion', filterRep)
    if (filterBanco !== 'all')    q = q.eq('bank', filterBanco)
    if (filterStatus !== 'all')   q = q.eq('status', filterStatus)
    if (filterAssigned !== 'all') q = q.eq('assigned_to', filterAssigned)

    const limit = parseInt(limitCount) || 500
    q = q.order('created_at', { ascending: true }).limit(limit)

    const { data } = await q
    setContacts((data as LoanLead[]) || [])
    setLoadingContacts(false)

    // Inicializar resultados
    setResults(
      ((data as LoanLead[]) || []).map(c => ({
        phone: c.phone_number || '',
        name: c.full_name || c.phone_number || '—',
        status: 'pending',
      }))
    )
  }

  const goToPreview = async () => {
    await loadContacts()
    setStep('preview')
  }

  // ── Preview del mensaje con datos reales ─────────────────
  const previewMessage = (lead?: LoanLead) => {
    let msg = selectedTpl.body
    selectedTpl.variables.forEach(v => {
      let val = tplVars[v] || `[${v}]`
      if (v === 'nombre' && useContactName && lead) {
        val = (lead.full_name || '').trim() || tplVars[v] || '[nombre]'
      }
      if (v === 'reparticion' && useContactRep && lead) {
        val = lead.reparticion || tplVars[v] || '[reparticion]'
      }
      msg = msg.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), val)
    })
    return msg
  }

  // ── Enviar un mensaje individual ─────────────────────────
  const sendMessage = async (lead: LoanLead): Promise<{ ok: boolean; error?: string }> => {
    if (!lead.phone_number) return { ok: false, error: 'Sin teléfono' }

    // Armar parámetros por separado — el orden tiene que coincidir
    // con el orden de {{1}}, {{2}} en la plantilla de Meta
    const templateParams: Record<string, string> = {}
    selectedTpl.variables.forEach(v => {
      if (v === 'nombre') {
        templateParams[v] = (useContactName && lead.full_name?.trim()) ? lead.full_name.trim() : (tplVars[v] || '')
      } else if (v === 'reparticion') {
        templateParams[v] = (useContactRep && lead.reparticion) ? lead.reparticion : (tplVars[v] || '')
      } else {
        templateParams[v] = tplVars[v] || ''
      }
    })

    try {
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:          lead.phone_number,
          templateName:   selectedTpl.metaName,
          templateParams,
          senderName:     'Campaña AMAT',
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { ok: false, error: err.error || `HTTP ${res.status}` }
      }

      // Actualizar estado del lead a "attempted"
      await supabase
        .from('loan_leads')
        .update({ status: 'attempted', updated_at: new Date().toISOString() })
        .eq('id', lead.id)

      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message || 'Error de red' }
    }
  }

  // ── Motor de envío ────────────────────────────────────────
  const runCampaign = async () => {
    if (contacts.length === 0) return
    setStep('running')
    setRunning(true)
    pauseRef.current  = false
    cancelRef.current = false
    setStartTime(Date.now())
    setSentCount(0)
    setErrorCount(0)
    setSkippedCount(0)
    setProgress(0)

    // Guardar registro de campaña en Supabase
    await supabase.from('amat_campaigns').insert({
      name:       campaignName || `Campaña ${new Date().toLocaleDateString('es-AR')}`,
      template:   selectedTpl.id,
      total:      contacts.length,
      status:     'running',
      created_at: new Date().toISOString(),
    }).select().single()

    // Delay entre mensajes en ms (respeta el rate limit por hora)
    const delayMs = Math.ceil(3600000 / rateLimit)

    for (let i = 0; i < contacts.length; i++) {
      // Cancelar
      if (cancelRef.current) break

      // Pausar
      while (pauseRef.current) {
        await new Promise(r => setTimeout(r, 500))
        if (cancelRef.current) break
      }
      if (cancelRef.current) break

      const lead   = contacts[i]
      const result = await sendMessage(lead)

      setResults(prev => prev.map((r, idx) =>
        idx === i
          ? { ...r, status: result.ok ? 'sent' : 'error', error: result.error }
          : r
      ))

      setProgress(i + 1)
      if (result.ok) setSentCount(c => c + 1)
      else setErrorCount(c => c + 1)

      // Delay anti-ban entre mensajes
      if (i < contacts.length - 1) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

    setRunning(false)
    setStep('done')
  }

  const togglePause = () => {
    pauseRef.current = !pauseRef.current
    setPaused(p => !p)
  }

  const cancelCampaign = () => {
    cancelRef.current = true
    pauseRef.current  = false
    setPaused(false)
  }

  // ── Estilos ───────────────────────────────────────────────
  const s = {
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(15,23,42,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 300,
      backdropFilter: 'blur(6px)',
    },
    modal: {
      background: 'white',
      borderRadius: 20,
      padding: 0,
      width: 640,
      maxWidth: '96vw',
      maxHeight: '92vh',
      display: 'flex',
      flexDirection: 'column' as const,
      boxShadow: '0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)',
      overflow: 'hidden',
    },
    header: {
      padding: '20px 24px 16px',
      borderBottom: '1px solid #F1F5F9',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 18,
      fontWeight: 700,
      color: '#0F172A',
      fontFamily: "'Playfair Display', serif",
      letterSpacing: '-0.01em',
      margin: '0 0 4px',
    },
    subtitle: {
      fontSize: 12,
      color: '#94A3B8',
      fontFamily: "'DM Mono', monospace",
      textTransform: 'uppercase' as const,
      letterSpacing: '0.07em',
    },
    body: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '20px 24px',
    },
    footer: {
      padding: '14px 24px',
      borderTop: '1px solid #F1F5F9',
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end',
      background: '#FAFAFA',
    },
    label: {
      display: 'block' as const,
      fontSize: 10.5,
      fontWeight: 600,
      color: '#64748B',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      marginBottom: 6,
      fontFamily: "'DM Mono', monospace",
    },
    input: {
      width: '100%',
      border: '1px solid #E2E8F0',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      color: '#0F172A',
      background: 'white',
      outline: 'none',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      fontFamily: 'inherit',
    },
    select: {
      width: '100%',
      border: '1px solid #E2E8F0',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      color: '#0F172A',
      background: 'white',
      outline: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    grid2: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 16,
    },
    group: {
      marginBottom: 16,
    },
    btn: (variant: 'primary' | 'ghost' | 'danger') => ({
      padding: '9px 18px',
      borderRadius: 9,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'inherit',
      border: variant === 'ghost' ? '1px solid #E2E8F0' : 'none',
      background:
        variant === 'primary' ? 'linear-gradient(135deg,#2563EB,#4F46E5)' :
        variant === 'danger'  ? '#FEF2F2' : 'white',
      color:
        variant === 'primary' ? 'white' :
        variant === 'danger'  ? '#991B1B' : '#374151',
      boxShadow: variant === 'primary' ? '0 2px 8px rgba(245,158,11,.3)' :
                 variant === 'ghost'   ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      transition: 'all .15s',
    }),
    tplCard: (active: boolean) => ({
      border: `1px solid ${active ? '#3B82F6' : '#E2E8F0'}`,
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 8,
      cursor: 'pointer',
      background: active ? '#EFF6FF' : 'white',
      transition: 'all .15s',
      boxShadow: active ? '0 0 0 3px rgba(59,130,246,.1)' : '0 1px 2px rgba(0,0,0,0.04)',
    }),
    badge: (cat: string) => ({
      fontSize: 10,
      padding: '2px 7px',
      borderRadius: 99,
      fontWeight: 600,
      fontFamily: "'DM Mono', monospace",
      background: cat === 'MARKETING' ? '#EFF6FF' : '#ECFDF5',
      color:      cat === 'MARKETING' ? '#1D4ED8' : '#065F46',
      border: `1px solid ${cat === 'MARKETING' ? '#BFDBFE' : '#A7F3D0'}`,
    }),
    progressBar: (pct: number) => ({
      height: 6,
      background: '#F1F5F9',
      borderRadius: 99,
      overflow: 'hidden',
      marginBottom: 4,
    }),
    progressFill: (pct: number) => ({
      height: '100%',
      width: `${pct}%`,
      background: 'linear-gradient(90deg,#B45309,#F59E0B)',
      borderRadius: 99,
      transition: 'width .3s ease',
    }),
    resultRow: (status: CampanaResult['status']) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 10px',
      borderRadius: 6,
      marginBottom: 3,
      background:
        status === 'sent'    ? '#F0FDF4' :
        status === 'error'   ? '#FEF2F2' :
        status === 'skipped' ? '#FFFBEB' : '#F8FAFC',
      border: `1px solid ${
        status === 'sent'    ? '#BBF7D0' :
        status === 'error'   ? '#FECACA' :
        status === 'skipped' ? '#FDE68A' : '#E2E8F0'
      }`,
    }),
    statCard: {
      background: '#F8FAFC',
      border: '1px solid #E2E8F0',
      borderRadius: 10,
      padding: '12px 16px',
      textAlign: 'center' as const,
      flex: 1,
    },
  }

  const pct = contacts.length > 0 ? Math.round((progress / contacts.length) * 100) : 0

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget && step !== 'running') onClose() }}>
      <div style={s.modal}>

        {/* ── HEADER ── */}
        <div style={s.header}>
          <div>
            <div style={s.title}>
              {step === 'config'  && '📣 Nueva campaña de WhatsApp'}
              {step === 'preview' && '👁 Vista previa del segmento'}
              {step === 'running' && '🚀 Campaña en progreso'}
              {step === 'done'    && '✅ Campaña finalizada'}
            </div>
            <div style={s.subtitle}>
              {step === 'config'  && 'Configurá el segmento, la plantilla y el ritmo de envío'}
              {step === 'preview' && `${contacts.length.toLocaleString('es-AR')} contactos seleccionados`}
              {step === 'running' && `${progress} / ${contacts.length} enviados`}
              {step === 'done'    && `${sentCount} enviados · ${errorCount} errores`}
            </div>
          </div>
          {step !== 'running' && (
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#94A3B8', lineHeight:1, padding:'0 4px' }}>×</button>
          )}
        </div>

        {/* ── BODY ── */}
        <div style={s.body}>

          {/* ════ STEP 1: CONFIG ════ */}
          {step === 'config' && (
            <>
              {/* Nombre de campaña */}
              <div style={s.group}>
                <label style={s.label}>Nombre de la campaña</label>
                <input style={s.input} placeholder={`Campaña ${new Date().toLocaleDateString('es-AR')}`} value={campaignName} onChange={e => setCampaignName(e.target.value)} />
              </div>

              {/* Segmento */}
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'16px', marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
                  <span>🎯</span> Segmento de contactos
                </div>
                <div style={s.grid2}>
                  <div>
                    <label style={s.label}>Repartición</label>
                    <select style={s.select} value={filterRep} onChange={e => setFilterRep(e.target.value)}>
                      <option value="all">Todas</option>
                      {REPARTICIONES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Estado actual</label>
                    <select style={s.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                      <option value="new">Nuevo</option>
                      <option value="contacted">Contactado</option>
                      <option value="not_interested">No interesado</option>
                      <option value="rejected">Rechazado</option>
                      <option value="closed">Cerrado</option>
                      <option value="all">Todos los estados</option>
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Teléfono</label>
                    <select style={s.select} value={filterTel} onChange={e => setFilterTel(e.target.value as any)}>
                      <option value="con">Solo con teléfono</option>
                      <option value="all">Todos</option>
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Límite de contactos</label>
                    <input style={s.input} type="number" placeholder="500" value={limitCount} onChange={e => setLimitCount(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Plantilla */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                  <span>💬</span> Plantilla de mensaje
                </div>
                {TEMPLATES.map(tpl => (
                  <div key={tpl.id} style={s.tplCard(selectedTpl.id === tpl.id)} onClick={() => setSelectedTpl(tpl)}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{tpl.name}</span>
                      <span style={s.badge(tpl.category)}>{tpl.category}</span>
                      {selectedTpl.id === tpl.id && (
                        <span style={{ marginLeft:'auto', color:'#2563EB', fontSize:16 }}>✓</span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:'#64748B', lineHeight:1.55, fontFamily:"'DM Mono',monospace", whiteSpace:'pre-wrap' }}>
                      {tpl.body.substring(0, 120)}...
                    </div>
                  </div>
                ))}
              </div>

              {/* Variables */}
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:16, marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                  <span>⚙️</span> Variables del mensaje
                </div>
                {selectedTpl.variables.map(v => (
                  <div key={v} style={{ marginBottom:12 }}>
                    <label style={s.label}>{'{{'}{ v }{'}}'}
                      <span style={{ color:'#94A3B8', fontWeight:400, marginLeft:6 }}>— se reemplaza en cada mensaje</span>
                    </label>
                    {v === 'nombre' && (
                      <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#374151', cursor:'pointer', marginBottom:6 }}>
                        <input type="checkbox" checked={useContactName} onChange={e => setUseContactName(e.target.checked)} />
                        Usar el nombre del contacto automáticamente
                      </label>
                    )}
                    {v === 'reparticion' && (
                      <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#374151', cursor:'pointer', marginBottom:6 }}>
                        <input type="checkbox" checked={useContactRep} onChange={e => setUseContactRep(e.target.checked)} />
                        Usar la repartición del contacto automáticamente
                      </label>
                    )}
                    {((v === 'nombre' && !useContactName) || (v === 'reparticion' && !useContactRep) || (v !== 'nombre' && v !== 'reparticion')) && (
                      <input
                        style={s.input}
                        placeholder={`Valor fijo para {{${v}}}`}
                        value={tplVars[v] || ''}
                        onChange={e => setTplVars(prev => ({ ...prev, [v]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Rate limit */}
              <div style={s.group}>
                <label style={s.label}>Ritmo de envío — anti-ban</label>
                <select style={s.select} value={rateLimit} onChange={e => setRateLimit(Number(e.target.value))}>
                  {RATE_LIMITS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <div style={{ fontSize:11.5, color:'#94A3B8', marginTop:6, fontFamily:"'DM Mono',monospace" }}>
                  Delay entre mensajes: {Math.ceil(3600 / rateLimit)}s · Tiempo estimado para {limitCount || 500} contactos: {Math.ceil((parseInt(limitCount)||500) / rateLimit * 60)} min
                </div>
              </div>

              {/* Aviso seguridad */}
              <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 14px', fontSize:12.5, color:'#92400E', lineHeight:1.6 }}>
                <strong>⚠️ Importante antes de lanzar:</strong> Asegurate de que las plantillas estén aprobadas en Meta Business Suite. Enviar mensajes masivos con plantillas no aprobadas puede resultar en la suspensión del número. El sistema respeta el rate limit que configurás arriba.
              </div>
            </>
          )}

          {/* ════ STEP 2: PREVIEW ════ */}
          {step === 'preview' && (
            <>
              {/* Resumen del segmento */}
              <div style={{ display:'flex', gap:10, marginBottom:20 }}>
                {[
                  { label:'Contactos', val: contacts.length.toLocaleString('es-AR'), color:'#2563EB' },
                  { label:'Con teléfono', val: contacts.filter(c=>c.phone_number).length.toLocaleString('es-AR'), color:'#10B981' },
                  { label:'Sin teléfono', val: contacts.filter(c=>!c.phone_number).length.toLocaleString('es-AR'), color:'#F59E0B' },
                  { label:'Tiempo est.', val: `${Math.ceil(contacts.length / rateLimit * 60)} min`, color:'#8B5CF6' },
                ].map(s2 => (
                  <div key={s2.label} style={s.statCard}>
                    <div style={{ fontSize:22, fontWeight:700, color:s2.color, fontFamily:"'Playfair Display',serif" }}>{s2.val}</div>
                    <div style={{ fontSize:11, color:'#94A3B8', fontFamily:"'DM Mono',monospace", textTransform:'uppercase', letterSpacing:'0.06em', marginTop:3 }}>{s2.label}</div>
                  </div>
                ))}
              </div>

              {/* Vista previa del mensaje con datos reales */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:"'DM Mono',monospace", marginBottom:10 }}>
                  Vista previa — usando datos del primer contacto
                </div>
                <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'#065F46', fontFamily:"'DM Mono',monospace", marginBottom:8 }}>
                    🤖 Asistente Virtual AMAT → {contacts[0]?.phone_number || '—'}
                  </div>
                  <div style={{ fontSize:13, color:'#0F172A', lineHeight:1.65, whiteSpace:'pre-wrap' }}>
                    {previewMessage(contacts[0])}
                  </div>
                </div>
              </div>

              {/* Lista de primeros 10 contactos */}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:"'DM Mono',monospace", marginBottom:10 }}>
                  Primeros contactos del segmento
                </div>
                <div style={{ border:'1px solid #E2E8F0', borderRadius:10, overflow:'hidden' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                    <thead>
                      <tr style={{ background:'#F8FAFC' }}>
                        {['Nombre','Teléfono','Repartición','Estado'].map(h => (
                          <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontSize:10.5, fontWeight:600, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', borderBottom:'1px solid #E2E8F0', fontFamily:"'DM Mono',monospace" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.slice(0, 8).map((c, i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #F8FAFC' }}>
                          <td style={{ padding:'7px 12px', fontWeight:500, color:'#0F172A' }}>{c.full_name || '—'}</td>
                          <td style={{ padding:'7px 12px', color:'#64748B', fontFamily:"'DM Mono',monospace", fontSize:12 }}>{c.phone_number || <span style={{color:'#CBD5E1'}}>Sin tel.</span>}</td>
                          <td style={{ padding:'7px 12px', color:'#64748B', fontSize:12 }}>{c.reparticion || '—'}</td>
                          <td style={{ padding:'7px 12px' }}><span style={{ fontSize:11, padding:'2px 7px', borderRadius:99, background:'#FFFBEB', color:'#B45309', fontWeight:600, fontFamily:"'DM Mono',monospace" }}>
                            {({'new':'Nuevo','contacted':'Contactado','not_interested':'No interesado','rejected':'Rechazado','closed':'Cerrado'} as Record<string,string>)[c.status] || c.status}
                          </span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {contacts.length > 8 && (
                    <div style={{ padding:'8px 12px', fontSize:12, color:'#94A3B8', textAlign:'center', fontFamily:"'DM Mono',monospace", borderTop:'1px solid #F1F5F9' }}>
                      + {(contacts.length - 8).toLocaleString('es-AR')} contactos más
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ════ STEP 3: RUNNING ════ */}
          {(step === 'running' || step === 'done') && (
            <>
              {/* Barra de progreso */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748B', fontFamily:"'DM Mono',monospace", marginBottom:8 }}>
                  <span>{progress.toLocaleString('es-AR')} / {contacts.length.toLocaleString('es-AR')} mensajes</span>
                  <span>{pct}%{eta && step === 'running' ? ` · ETA: ${eta}` : ''}</span>
                </div>
                <div style={s.progressBar(pct)}>
                  <div style={s.progressFill(pct)} />
                </div>
              </div>

              {/* Stats en tiempo real */}
              <div style={{ display:'flex', gap:10, marginBottom:20 }}>
                {[
                  { label:'Enviados', val:sentCount, color:'#10B981', bg:'#ECFDF5' },
                  { label:'Errores', val:errorCount, color:'#EF4444', bg:'#FEF2F2' },
                  { label:'Pendientes', val:contacts.length - progress, color:'#64748B', bg:'#F8FAFC' },
                  { label:'Tasa OK', val:sentCount > 0 ? `${Math.round(sentCount/(sentCount+errorCount)*100)}%` : '—', color:'#2563EB', bg:'#EFF6FF' },
                ].map(s2 => (
                  <div key={s2.label} style={{ ...s.statCard, background:s2.bg }}>
                    <div style={{ fontSize:22, fontWeight:700, color:s2.color, fontFamily:"'Playfair Display',serif" }}>{s2.val}</div>
                    <div style={{ fontSize:10.5, color:s2.color, fontFamily:"'DM Mono',monospace", textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2, opacity:0.7 }}>{s2.label}</div>
                  </div>
                ))}
              </div>

              {/* Log de resultados */}
              <div ref={resultsRef} style={{ border:'1px solid #E2E8F0', borderRadius:10, padding:10, height:240, overflowY:'auto', background:'#FAFAFA' }}>
                {results.map((r, i) => (
                  <div key={i} style={s.resultRow(r.status)}>
                    <span style={{ fontSize:13, flexShrink:0 }}>
                      {r.status === 'sent'    ? '✓' :
                       r.status === 'error'   ? '✕' :
                       r.status === 'skipped' ? '⊘' : '·'}
                    </span>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11.5, color:'#374151', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {r.name} · {r.phone}
                    </span>
                    {r.error && (
                      <span style={{ fontSize:11, color:'#EF4444', fontFamily:"'DM Mono',monospace", flexShrink:0 }}>{r.error}</span>
                    )}
                    <span style={{ fontSize:10.5, fontFamily:"'DM Mono',monospace", color:'#94A3B8', flexShrink:0 }}>
                      {r.status === 'sent' ? 'enviado' : r.status === 'error' ? 'error' : r.status === 'pending' ? 'esperando' : 'omitido'}
                    </span>
                  </div>
                ))}
              </div>

              {step === 'done' && (
                <div style={{ marginTop:16, background: errorCount === 0 ? '#ECFDF5' : '#FFFBEB', border:`1px solid ${errorCount === 0 ? '#BBF7D0' : '#FDE68A'}`, borderRadius:10, padding:'14px 16px', fontSize:13, color: errorCount === 0 ? '#065F46' : '#92400E', lineHeight:1.6 }}>
                  <strong>{errorCount === 0 ? '🎉 Campaña completada sin errores.' : `⚠️ Campaña finalizada con ${errorCount} errores.`}</strong>
                  {' '}Todos los contactos alcanzados cambiaron a estado <strong>"Intentado"</strong> en la base.
                  {errorCount > 0 && ' Revisá el log para ver los números que fallaron.'}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={s.footer}>
          {step === 'config' && (
            <>
              <button style={s.btn('ghost')} onClick={onClose}>Cancelar</button>
              <button style={s.btn('primary')} onClick={goToPreview} disabled={loadingContacts}>
                {loadingContacts ? '⏳ Cargando...' : `Vista previa →`}
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button style={s.btn('ghost')} onClick={() => setStep('config')}>← Volver</button>
              <button style={s.btn('primary')} onClick={runCampaign} disabled={contacts.filter(c=>c.phone_number).length === 0}>
                🚀 Lanzar campaña ({contacts.filter(c=>c.phone_number).length.toLocaleString('es-AR')} mensajes)
              </button>
            </>
          )}
          {step === 'running' && (
            <>
              <button style={s.btn('danger')} onClick={cancelCampaign}>✕ Cancelar</button>
              <button style={s.btn('ghost')} onClick={togglePause}>
                {paused ? '▶ Reanudar' : '⏸ Pausar'}
              </button>
            </>
          )}
          {step === 'done' && (
            <button style={s.btn('primary')} onClick={onClose}>Cerrar y volver a la base</button>
          )}
        </div>

      </div>
    </div>
  )
}
