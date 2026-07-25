'use client'

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart, RadialBarChart, RadialBar
} from 'recharts'
import ImportExport from '@/components/ImportExport'
import CampanaModal from '@/components/CampanaModal'
import CalculadorOferta from '@/components/CalculadorOferta'
import { supabase } from '@/lib/supabase'
import { LoanLead, Message } from '@/lib/types'
import { SysUser } from '@/domain/entities/users'
import {
  LEAD_STATUS, COBRANZA_STATUS, ESTADOS_FINALES,
  OPCIONES_VENTAS, OPCIONES_VENTAS_INTERMEDIOS, OPCIONES_COBRANZAS,
  getStatusMeta, getEstadosFinalesPorFlujo, getFlujoLabel,
} from '@/domain/entities/leadStatus'
import { REPARTICIONES, BANCOS, REJECTION_REASONS, TEMPLATES } from '@/domain/entities/catalogs'
import { STATUS_A_CONSULTA, consultaStatusToLeadStatus } from '@/domain/workflows/statusMapping'
import { TABLAS_CUOTA, calcularCuotaAMAT } from '@/domain/calculations/cuotas'
import { updateConsulta, insertConsulta, syncConsultaEstado, fetchFlujoMap } from '@/services/consulta.service'
import { fetchMensajesPhone } from '@/services/chat.service'
import { exportarVentas } from '@/services/export.service'
import { registrarCampana } from '@/services/chat.service'
import { useAuth } from '@/hooks/useAuth'
import { useRealtime } from '@/hooks/useRealtime'
import { useBandeja } from '@/hooks/useBandeja'
import { useConsultas } from '@/hooks/useConsultas'
import { useBase } from '@/hooks/useBase'
import { useReportes } from '@/hooks/useReportes'

// ── Tipos de formularios ──────────────────────────────────
type VentaForm = {
  entidad:     string
  linea:       string
  reparticion: string
  monto:       string
  cuotas:      string
  valor_cuota: string
  notas:       string
}

type ConsultaEditForm = {
  vendedor:  string
  situacion: string
  estado:    string
}


const PAGE_SIZE = 50

type Props = { initialLeads: LoanLead[]; initialMessages: Message[] }
type Tab = 'bandeja' | 'consultas' | 'base' | 'reportes'



export default function BandejaClient({ initialLeads, initialMessages }: Props) {

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = useAuth()
  const {
    me, userRef, handleLogin, handleLogout, handleRememberMe,
    loginUser, setLoginUser, loginPass, setLoginPass,
    loginErr, showPass, setShowPass,
    locked, countdown, rememberMe,
  } = auth

  // ── Tab UI ────────────────────────────────────────────────────────────────
  const [tab, setTab]         = useState<Tab>('bandeja')
  const [tabLoading, setTabLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)

  // Montaje — SSR hydration guard
  useEffect(()=>{ setMounted(true) },[])

  // ── Messages (global) ─────────────────────────────────────────────────────
  const [messages, setMessages]   = useState<Message[]>(initialMessages)
  const [vistaMode, setVistaMode] = useState<'cola'|'mis_chats'>('cola')

  // selectedPhone y currentChatMsgs viven aquí porque los necesitan
  // tanto useBandeja (tomarConversacion) como useChat (cargarMensajes)
  const [selectedPhone, setSelectedPhone]     = useState<string|null>(null)
  const [currentChatMsgs, setCurrentChatMsgs] = useState<Message[]>([])

  // ── Bandeja ───────────────────────────────────────────────────────────────
  const bandeja = useBandeja(
    me, tab, messages, initialMessages,
    setSelectedPhone, setVistaMode,
    (phone: string) => {
      // cargarMensajes inline — evita dependencia circular con useChat
      import('@/services/chat.service').then(({ fetchMensajesPhone }) => {
        fetchMensajesPhone(phone).then(msgs => {
          setCurrentChatMsgs(msgs)
          setMessages(prev => [...prev.filter(m => m.phone_number !== phone), ...msgs])
        })
      })
    }
  )

  // ── Base ──────────────────────────────────────────────────────────────────
  const base = useBase(tab, {
    setFlujoMap: bandeja.setFlujoMap,
    setBotLeads: bandeja.setBotLeads,
  })

  // ── Realtime ──────────────────────────────────────────────────────────────
  const { meRef } = useRealtime(me, {
    setMessages,
    setCurrentChatMsgs,
    setBotLeads:        bandeja.setBotLeads,
    setColaLeadsState:  bandeja.setColaLeadsState,
    setColaTotal:       bandeja.setColaTotal,
    setFlujoMap:        bandeja.setFlujoMap,
    setConsultas:       consultas$.setConsultas,
    setBaseLeads:       base.setBaseLeads,
  })

  // ── Consultas ─────────────────────────────────────────────────────────────
  const consultas$ = useConsultas(tab, bandeja.flujoMap)

  // ── Reportes ──────────────────────────────────────────────────────────────
  const reportes = useReportes(tab, bandeja.setCerradosHoyCount)

  // Wire loadReportes into the tab effect
  useEffect(()=>{
    if(tab==='reportes') reportes.loadReportes(reportes.reportePeriodo, reportes.reporteDesde, reportes.reporteHasta)
  },[tab]) // eslint-disable-line

  // ── Destructure for convenience ───────────────────────────────────────────
  const {
    botLeads, setBotLeads, allLeads, bandejaLeads,
    colaLeadsState, setColaLeadsState,
    colaTotal, setColaTotal,
    colaPage, setColaPage,
    colaMenu, setColaMenu,
    colaMenuRef, setColaMenuRef,
    flujoMap, setFlujoMap,
    cerradosHoyCount, setCerradosHoyCount,
    bandejaSearch, setBandejaSearch,
    soloNoLeidos, setSoloNoLeidos,
    editandoFlujo, setEditandoFlujo,
    cambiarEstado, updateStatus, tomarConversacion,
  } = bandeja

  // Base destructuring
  const {
    baseLeads, setBaseLeads, baseTotal, baseLoading,
    basePage, setBasePage,
    baseSearch, setBaseSearch, baseSearchInput, setBaseSearchInput,
    baseRep, setBaseRep, baseBanco, setBaseBanco,
    baseStatus, setBaseStatus, baseTel, setBaseTel,
    baseAssigned, setBaseAssigned, baseFlujo, setBaseFlujo,
    baseOrdenCol, setBaseOrdenCol, baseOrdenDir, setBaseOrdenDir,
    baseSearchTimer,
    showEditModal, setShowEditModal,
    editTarget, setEditTarget,
    editForm, setEditForm, editSaving,
    showNoteModal, setShowNoteModal, noteText, setNoteText,
    loadBase, openEdit, saveEdit,
  } = base

  // Consultas destructuring
  const {
    consultas, setConsultas, consultasLoading, consultasTotal,
    consultaSelected, setConsultaSelected,
    showConsultaModal, setShowConsultaModal,
    consultaEdit, setConsultaEdit, campanas,
    cFlujo, setCFlujo, cEstado, setCEstado,
    cOrden, setCOrden, cRep, setCRep,
    cSearch, setCSearch, cSearchInput, setCSearchInput,
    loadConsultas,
  } = consultas$

  // Reportes destructuring
  const {
    reporteLeads, pipelineFlujoMap,
    reporteMode, setReporteMode,
    reportePeriodo, setReportePeriodo,
    reporteDesde, setReporteDesde,
    reporteHasta, setReporteHasta,
    loadReportes,
  } = reportes

  // Chat state (local — coordinado entre bandeja y realtime)
  const [replyText, setReplyText]     = useState('')
  const [sending, setSending]         = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const chatScrollRef  = useRef<HTMLDivElement>(null)
  const isAtBottom     = useRef(true)

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = chatScrollRef.current
    if(!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    setUnreadCount(0)
    isAtBottom.current = true
  }

  const handleChatScroll = () => {
    const el = chatScrollRef.current
    if(!el) return
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if(isAtBottom.current) setUnreadCount(0)
  }

  const cargarMensajes = (phone: string) => {
    import('@/services/chat.service').then(({ fetchMensajesPhone }) => {
      fetchMensajesPhone(phone).then(msgs => {
        setCurrentChatMsgs(msgs)
        setMessages(prev => [...prev.filter(m => m.phone_number !== phone), ...msgs])
      })
    })
  }

  const abrirChat = (lead: LoanLead) => {
    setCurrentChatMsgs([])
    setSelectedPhone(lead.phone_number)
    if(lead.phone_number) cargarMensajes(lead.phone_number)
    if(lead.id) {
      import('@/services/lead.service').then(({ fetchLeadById }) => {
        fetchLeadById(lead.id).then(res => {
          if(res.ok && res.data) {
            bandeja.setBotLeads(prev => prev.map(l => l.id === res.data!.id ? res.data! : l))
            base.setBaseLeads(prev => prev.map(l => l.id === res.data!.id ? res.data! : l))
          }
        })
      })
    }
  }



  const LIMITE_BANDEJA = 50

  // ── Remaining local state (modales y acciones que quedan en el componente) ──
  const [showFinalizarModal, setShowFinalizarModal] = useState(false)
  const [finalizarEstado, setFinalizarEstado]       = useState('')
  const [finalizarNota, setFinalizarNota]           = useState('')
  const [showVentaModal, setShowVentaModal]         = useState(false)
  const [ventaForm, setVentaForm] = useState<VentaForm>({entidad:'',linea:'',reparticion:'',monto:'',cuotas:'',valor_cuota:'',notas:''})
  const [showStatusModal, setShowStatusModal]     = useState(false)
  const [showAssignModal, setShowAssignModal]     = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showImportExport, setShowImportExport]   = useState(false)
  const [showCampana, setShowCampana]             = useState(false)
  const [showCalculador, setShowCalculador]       = useState(false)
  const [showRejectModal, setShowRejectModal]     = useState(false)
  const [rejectReason, setRejectReason]           = useState('')
  const [selectedTemplate, setSelectedTemplate]   = useState<typeof TEMPLATES[0]|null>(null)
  const [templateVars, setTemplateVars]           = useState<Record<string,string>>({})
  const cSearchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  // ── Scroll effect ─────────────────────────────────────────────────────────
  const prevPhone    = useRef<string|null>(null)
  const prevMsgCount = useRef(0)

  useEffect(()=>{
    const phoneChanged = prevPhone.current !== selectedPhone
    prevPhone.current = selectedPhone
    if(phoneChanged) {
      scrollToBottom('instant' as ScrollBehavior)
      prevMsgCount.current = messages.length
      return
    }
    const newMsgs = messages.length - prevMsgCount.current
    prevMsgCount.current = messages.length
    if(newMsgs > 0 && !isAtBottom.current) {
      setUnreadCount(c => c + newMsgs)
    } else if(isAtBottom.current) {
      scrollToBottom('smooth')
    }
  },[messages, selectedPhone]) // eslint-disable-line



  // ── Actions ───────────────────────────────────────────────────────────────
  const LIMITE_PLANTILLA_HORAS = 24

  const sendReply = async () => {
    if(!replyText.trim() || !selectedPhone || !me) return
    const text = replyText
    setReplyText('')
    setSending(true)
    if(currentLead && !currentLead.assigned_to) {
      const { autoAsignarLead } = await import('@/services/lead.service')
      const res = await autoAsignarLead(currentLead.id, selectedPhone, me.username)
      if(res.ok) {
        bandeja.setBotLeads(prev => prev.map(l => l.id===currentLead.id ? {...l, assigned_to: me.username, status: 'contacted'} : l))
        bandeja.setColaLeadsState(prev => prev.filter(l => l.id !== currentLead.id))
        bandeja.setColaTotal(t => Math.max(0, t - 1))
      }
    }
    const tempMsg: Message = {
      id: `temp_${Date.now()}` as any,
      phone_number: selectedPhone,
      body: text, direction: 'out',
      sender: me.username,
      created_at: new Date().toISOString(),
      media_url: null, media_type: null,
    }
    setCurrentChatMsgs(prev => [...prev, tempMsg])
    setMessages(prev => [...prev, tempMsg])
    try {
      const { sendReply: chatSendReply } = await import('@/services/chat.service')
      await chatSendReply({ phone: selectedPhone, text, senderName: me.username })
    } catch(e) {
      setReplyText(text)
    } finally {
      setSending(false)
    }
  }

  const sendTemplate = async (template: 'recontacto'|'primer_contacto_esp'|'ayuda_economica') => {
    if(!selectedPhone || !me) return
    const { puedeEnviarPlantilla, sendTemplate: chatSendTemplate } = await import('@/services/chat.service')
    const check = await puedeEnviarPlantilla(selectedPhone)
    if(!check.ok) {
      alert(`🚫 No se puede enviar la plantilla.\n\nYa se le envió una plantilla a este número en las últimas ${LIMITE_PLANTILLA_HORAS} horas. Podrás volver a enviarle en aprox. ${check.horasRestantes}hs.\n\nEste límite protege el número de WhatsApp de la empresa.`)
      return
    }
    if(currentLead && !currentLead.assigned_to) {
      const { autoAsignarLead } = await import('@/services/lead.service')
      const res = await autoAsignarLead(currentLead.id, selectedPhone, me.username)
      if(res.ok) {
        bandeja.setBotLeads(prev => prev.map(l => l.id===currentLead.id ? {...l, assigned_to: me.username, status: 'contacted'} : l))
        bandeja.setColaLeadsState(prev => prev.filter(l => l.id !== currentLead.id))
        bandeja.setColaTotal(t => Math.max(0, t - 1))
      }
    }
    setSending(true)
    const lead = bandeja.bandejaLeads.find(l=>l.phone_number===selectedPhone) || base.baseLeads.find(l=>l.phone_number===selectedPhone)
    await chatSendTemplate({ phone: selectedPhone, template, senderName: me.username, dni: lead?.dni })
    setSending(false)
  }

  const saveNote = async () => {
    const lead = currentLead || editTarget
    if(!lead) return
    const { saveLeadNote } = await import('@/services/lead.service')
    const res = await saveLeadNote(lead.id, noteText)
    if(!res.ok) { alert('❌ No se pudo guardar la nota. Intentá de nuevo.'); return }
    setShowNoteModal(false)
  }

  const handleReject = async () => {
    const lead = currentLead || editTarget
    if(!lead || !rejectReason) return
    const note = `Rechazado: ${rejectReason}`
    await bandeja.updateStatus(lead.id, 'rejected', lead.notes ? lead.notes + '\n' + note : note)
    setShowRejectModal(false); setRejectReason('')
  }

  const exportVentas = async () => {
    const { ok, error } = await exportarVentas()
    if(!ok) alert(error || 'Error al exportar')
  }

  const openTemplate = (lead: LoanLead) => {
    setEditTarget(lead)
    setSelectedTemplate(null)
    setTemplateVars({})
    setShowTemplateModal(true)
  }

  const applyTemplate = (tpl: typeof TEMPLATES[0], lead: LoanLead) => {
    setSelectedTemplate(tpl)
    const vars: Record<string,string> = {}
    tpl.variables.forEach(v => {
      if(v==='nombre')     vars[v] = (lead.full_name||'').split(' ')[0] || ''
      if(v==='reparticion') vars[v] = lead.reparticion || ''
    })
    setTemplateVars(vars)
  }

  const finalizarConversacion = async (nota?: string) => {
    if(!currentLead) return
    const statusFinal = finalizarEstado || (ESTADOS_FINALES.includes(currentLead.status||'') ? currentLead.status! : 'not_interested')
    await bandeja.cambiarEstado(currentLead, statusFinal, { situacion: nota })
    setShowFinalizarModal(false)
    setFinalizarEstado('')
    setFinalizarNota('')
  }

  const guardarVenta = async () => {
    if(!currentLead || !me) return
    await bandeja.cambiarEstado(currentLead, 'closed', {
      notes: ventaForm.notas || undefined,
      situacion: `Venta cerrada - ${ventaForm.entidad} ${ventaForm.linea} $${parseInt(ventaForm.monto).toLocaleString('es-AR')} en ${ventaForm.cuotas} cuotas · Valor cuota: $${parseFloat(ventaForm.valor_cuota).toLocaleString('es-AR')}`,
      extraFields: {
        entidad:          ventaForm.entidad,
        linea:            ventaForm.linea,
        reparticion:      ventaForm.reparticion || currentLead.reparticion,
        monto_solicitado: parseInt(ventaForm.monto) || 0,
        cant_cuotas:      parseInt(ventaForm.cuotas) || 0,
        valor_cuota:      parseFloat(ventaForm.valor_cuota) || 0,
      },
    })
    setShowVentaModal(false)
    setVentaForm({entidad:'',linea:'',reparticion:'',monto:'',cuotas:'',valor_cuota:'',notas:''})
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentLead = allLeads.find(l=>l.phone_number===selectedPhone)
    || colaLeadsState.find(l=>l.phone_number===selectedPhone)
    || baseLeads.find(l=>l.phone_number===selectedPhone)

  const currentMsgs = (
    currentChatMsgs.length > 0 && currentChatMsgs[0]?.phone_number === selectedPhone
  )
    ? currentChatMsgs
    : messages
        .filter(m=>m.phone_number===selectedPhone)
        .sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())

  const stats = useMemo(()=>({
    inbound:  bandejaLeads.length,
    activos:  bandejaLeads.filter(l=>['contacted','new'].includes(l.status||'')).length,
    sinResp:  (() => {
      const outPhones = new Set(messages.filter(m=>m.direction==='out'&&m.sender!=='bot').map(m=>m.phone_number))
      return [...new Set(messages.filter(m=>m.direction==='in').map(m=>m.phone_number))]
        .filter(p=>bandejaLeads.find(l=>l.phone_number===p))
        .filter(p=>!outPhones.has(p)).length
    })(),
    cerrados: cerradosHoyCount,
  }),[bandejaLeads, messages, cerradosHoyCount])

  if(!mounted) return null

  const sc    = (status:string) => getStatusMeta(status, 'solicitud')
  const scCob = (status:string) => getStatusMeta(status, 'cobranzas')
  const scFor = (status:string, phone:string|null) => getStatusMeta(status, phone ? flujoMap[phone] : 'solicitud')
  const getEstadosFor = (phone:string|null) => {
    const flujo = phone ? flujoMap[phone] : 'solicitud'
    return flujo==='cobranzas' ? COBRANZA_STATUS : LEAD_STATUS
  }
  const getEstadosFinalesFor = (phone:string|null) => getEstadosFinalesPorFlujo(phone ? flujoMap[phone] : 'solicitud')
  const getFlujoLabelFor = (phone:string|null) => getFlujoLabel(phone ? flujoMap[phone] : 'solicitud')

  // ══════════════════════════════════════════
  //  PANTALLA DE LOGIN
  // ══════════════════════════════════════════
  if(!me) return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0A0F1E 0%,#0F172A 50%,#0D1B2A 100%)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');.li{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:13px 16px;color:#F1F5F9;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;transition:all .2s}.li:focus{border-color:#3B82F6;background:rgba(59,130,246,.08)}.li::placeholder{color:#334155}.mono{font-family:'DM Mono',monospace}`}</style>
      <div style={{background:'rgba(255,255,255,.03)',backdropFilter:'blur(24px)',border:'1px solid rgba(255,255,255,.07)',borderRadius:24,padding:'48px 44px',width:420,position:'relative',zIndex:1}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{width:60,height:60,background:'linear-gradient(135deg,#B45309,#F59E0B)',borderRadius:18,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,margin:'0 auto 18px',boxShadow:'0 8px 24px rgba(245,158,11,.3)'}}>🏦</div>
          <div style={{fontSize:22,fontWeight:600,color:'#F1F5F9',marginBottom:4}}>AMAT · CRM</div>
          <div style={{fontSize:13,color:'#475569'}}>Sistema de gestión de consultas</div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{display:'block',fontSize:11,fontWeight:500,color:'#64748B',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Usuario</label>
          <input ref={userRef} className="li mono" placeholder="Usuario" value={loginUser} onChange={e=>setLoginUser(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} disabled={locked}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{display:'block',fontSize:11,fontWeight:500,color:'#64748B',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Contraseña</label>
          <div style={{position:'relative'}}>
            <input className="li" type={showPass?'text':'password'} placeholder="••••••••••••" value={loginPass} onChange={e=>setLoginPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} disabled={locked}/>
            <button onClick={()=>setShowPass(p=>!p)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#475569',fontSize:16}} tabIndex={-1}>{showPass?'🙈':'👁'}</button>
          </div>
        </div>
        {loginErr&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.2)',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#FCA5A5'}}>⚠️ {loginErr}</div>}
        {locked&&<div style={{background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.2)',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#FCD34D',textAlign:'center'}}>🔒 {countdown}s...</div>}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
          <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={e=>{
            setRememberMe(e.target.checked)
            if(!e.target.checked){ localStorage.removeItem('amat_remember_user'); localStorage.removeItem('amat_remember_pass') }
          }} style={{width:15,height:15,accentColor:'#F59E0B',cursor:'pointer'}}/>
          <label htmlFor="rememberMe" style={{fontSize:12,color:'#475569',cursor:'pointer',userSelect:'none'}}>Recordar usuario</label>
        </div>
        <button onClick={handleLogin} disabled={locked} style={{width:'100%',background:'linear-gradient(135deg,#B45309,#F59E0B)',border:'none',borderRadius:12,padding:14,color:'white',fontSize:14,fontWeight:600,cursor:locked?'not-allowed':'pointer',fontFamily:'inherit',opacity:locked?.5:1}}>
          {locked?'🔒 Bloqueado':'Iniciar sesión'}
        </button>
      </div>
    </div>
  )

  // ══════════════════════════════════════════
  //  APP
  // ══════════════════════════════════════════
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',fontFamily:"'DM Sans',system-ui,sans-serif",background:'#F8FAFC',overflow:'hidden'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:99px}
        .tabbtn{padding:7px 14px;border-radius:8px;border:none;background:transparent;font-size:13px;font-weight:500;cursor:pointer;color:#64748B;font-family:inherit;display:flex;align-items:center;gap:5px;transition:all .15s;white-space:nowrap}
        .tabbtn:hover{background:#F1F5F9;color:#1E293B}
        .tabbtn.on{background:white;color:#1E293B;box-shadow:0 1px 3px rgba(0,0,0,.1)}
        .ci{display:flex;gap:10px;padding:11px 13px;border-bottom:1px solid #F1F5F9;cursor:pointer;align-items:flex-start;transition:background .1s}
        .ci:hover{background:#F8FAFC}
        .ci.on{background:#EFF6FF;border-left:3px solid #3B82F6}
        .av{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}
        .pill{display:inline-flex;align-items:center;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:500;white-space:nowrap}
        .btn{padding:7px 13px;border-radius:8px;border:1px solid #E2E8F0;background:white;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;color:#374151;display:flex;align-items:center;gap:5px;transition:all .15s;white-space:nowrap}
        .btn:hover{background:#F8FAFC;border-color:#CBD5E1}
        .btn.pri{background:linear-gradient(135deg,#3B82F6,#6366F1);color:white;border-color:#3B82F6}
        .btn.pri:hover{opacity:.9}
        .btn.suc{background:#ECFDF5;color:#065F46;border-color:#A7F3D0}
        .btn.war{background:#FFFBEB;color:#92400E;border-color:#FDE68A}
        .btn.dan{background:#FEF2F2;color:#991B1B;border-color:#FECACA}
        .btn.wa{background:#25D366;color:white;border-color:#25D366}
        .btn.wa:hover{background:#128C7E;border-color:#128C7E}
        .btn:disabled{opacity:.4;cursor:not-allowed}
        .movo{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(3px)}
        .mod{background:white;border-radius:18px;padding:26px;width:500px;max-width:95vw;box-shadow:0 25px 60px rgba(0,0,0,.18);max-height:90vh;overflow-y:auto}
        .mod h3{font-size:16px;font-weight:600;margin:0 0 16px;color:#0F172A}
        .mopt{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;cursor:pointer;transition:background .1s;margin-bottom:3px;border:1px solid transparent}
        .mopt:hover{background:#F8FAFC;border-color:#E2E8F0}
        .fsel{border:1px solid #E2E8F0;border-radius:8px;padding:7px 10px;font-size:12px;font-family:inherit;color:#374151;background:white;outline:none;cursor:pointer}
        .fsel:focus{border-color:#3B82F6}
        .si{border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px 8px 30px;font-size:13px;font-family:inherit;outline:none;width:100%;background:white;color:#1E293B}
        .si:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .mi{background:white;border:1px solid #E2E8F0;border-radius:3px 14px 14px 14px;padding:10px 14px;max-width:68%}
        .mb{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:3px 14px 14px 14px;padding:10px 14px;max-width:68%}
        .mo{background:linear-gradient(135deg,#3B82F6,#6366F1);color:white;border-radius:14px 3px 14px 14px;padding:10px 14px;max-width:68%}
        .fi{width:100%;border:1px solid #E2E8F0;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;color:#1E293B;background:white;outline:none}
        .fi:focus{border-color:#F59E0B;box-shadow:0 0 0 3px rgba(245,158,11,.1)}
        .fs{width:100%;border:1px solid #E2E8F0;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;color:#1E293B;background:white;outline:none;cursor:pointer}
        .fs:focus{border-color:#3B82F6}
        .fl{display:block;font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
        .tbl th{text-align:left;padding:10px 14px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;position:sticky;top:0;z-index:1}
        .tbl td{padding:9px 14px;border-bottom:1px solid #F8FAFC;font-size:13px;color:#374151;vertical-align:middle;user-select:text}
        .tbl tr{cursor:default}
        .tbl tr:hover td{background:#F8FAFC;cursor:pointer}
        .mono{font-family:'DM Mono',monospace}
        .ta{width:100%;border:1px solid #E2E8F0;border-radius:10px;padding:11px 14px;font-size:13px;font-family:inherit;resize:vertical;color:#1E293B;outline:none;min-height:80px}
        .ta:focus{border-color:#F59E0B;box-shadow:0 0 0 3px rgba(245,158,11,.1)}
        textarea:focus{outline:none}
        .pb{padding:5px 10px;border:1px solid #E2E8F0;border-radius:6px;background:white;font-size:12px;cursor:pointer;font-family:inherit;color:#374151}
        .pb:hover{background:#F8FAFC}
        .pb:disabled{opacity:.4;cursor:not-allowed}
        .tcard{border:1px solid #E2E8F0;border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;transition:all .15s}
        .tcard:hover{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .tcard.on{border-color:#F59E0B;background:#FFFBEB}
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 20px',background:'white',borderBottom:'1px solid #E2E8F0',flexShrink:0,minHeight:56}}>
        <div style={{width:34,height:34,background:'linear-gradient(135deg,#B45309,#F59E0B)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>🏦</div>
        <span style={{fontWeight:700,fontSize:15,color:'#0F172A',marginRight:6,whiteSpace:'nowrap'}}>AMAT · CRM</span>
        <div style={{display:'flex',gap:2,background:'#F1F5F9',padding:3,borderRadius:10}}>
          {([['bandeja','💬','Bandeja'],['consultas','📥','Consultas'],['base','👥','Base'],['reportes','📊','Reportes']] as const).map(([t,i,l])=>(
            <button key={t} className={`tabbtn ${tab===t?'on':''}`} onClick={()=>{ if(tab!==t){ const tieneSpinnerPropio=['consultas','base','reportes'].includes(t); if(tieneSpinnerPropio){ setTab(t) } else { setTabLoading(true); setTimeout(()=>{ setTab(t); setTabLoading(false) },30) } } }}>{i} {l}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:16,marginLeft:16}}>
          {[{v:stats.inbound,l:'Inbound',c:'#F59E0B'},{v:stats.activos,l:'Activos',c:'#8B5CF6'},{v:stats.sinResp,l:'Sin resp.',c:'#EF4444'},{v:stats.cerrados,l:'Cerrados hoy',c:'#10B981'}].map(s=>(
            <div key={s.l} style={{textAlign:'center',lineHeight:1}}>
              <div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:'#94A3B8',marginTop:2,whiteSpace:'nowrap'}}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:'50%',background:me.color,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:11,fontWeight:700}}>{me.initials}</div>
          <div style={{lineHeight:1.3}}>
            <div style={{fontSize:12,fontWeight:600,color:'#1E293B'}}>{me.username}</div>
            <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,fontWeight:600,background:me.role==='Administrador'?'#EFF6FF':me.role==='Vendedor'?'#F0FDF4':'#F5F3FF',color:me.role==='Administrador'?'#1D4ED8':me.role==='Vendedor'?'#15803D':'#6D28D9'}}>{me.role}</span>
          </div>
          <button onClick={()=>setMe(null)} style={{padding:'5px 12px',border:'1px solid #E2E8F0',borderRadius:8,background:'white',fontSize:12,cursor:'pointer',color:'#64748B',fontFamily:'inherit',fontWeight:500}}>Salir</button>
        </div>
      </div>

      {/* ══ BANDEJA ══ */}
      {tabLoading && (
        <div style={{position:'absolute',inset:0,background:'rgba(255,255,255,0.7)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{fontSize:13,color:'#64748B',fontWeight:600}}>Cargando...</div>
        </div>
      )}
      {tab==='bandeja'&&(
        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          {/* Sidebar */}
          <div style={{width:292,borderRight:'1px solid #E2E8F0',background:'white',display:'flex',flexDirection:'column',flexShrink:0}}>
            <div style={{padding:'10px 12px',borderBottom:'1px solid #F1F5F9',display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'flex',gap:4,background:'#F1F5F9',padding:3,borderRadius:8}}>
                <button style={{flex:1,padding:'6px 4px',borderRadius:6,border:'none',fontSize:11.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all .15s',background:vistaMode==='cola'?'white':'transparent',color:vistaMode==='cola'?'#0F172A':'#64748B',boxShadow:vistaMode==='cola'?'0 1px 3px rgba(0,0,0,.1)':'none'}}
                  onClick={()=>{setVistaMode('cola');setSelectedPhone(null)}}>
                  📥 Cola {(()=>{
                    const n = colaLeadsState.filter(l=>{
                      const fl=flujoMap[l.phone_number||'']||'solicitud'
                      if(me?.role==='Vendedor') return fl!=='cobranzas'
                      if(me?.role==='Cobranza') return fl==='cobranzas'
                      return true
                    }).length
                    const total = n > 0 ? n : 0
                    return total>0&&<span style={{background:'#F59E0B',color:'white',borderRadius:99,padding:'1px 6px',fontSize:10,fontWeight:700,marginLeft:3}}>{total}</span>
                  })()}
                </button>
                <button style={{flex:1,padding:'6px 4px',borderRadius:6,border:'none',fontSize:11.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all .15s',background:vistaMode==='mis_chats'?'white':'transparent',color:vistaMode==='mis_chats'?'#0F172A':'#64748B',boxShadow:vistaMode==='mis_chats'?'0 1px 3px rgba(0,0,0,.1)':'none'}}
                  onClick={()=>setVistaMode('mis_chats')}>
                  💬 Mis chats {(()=>{
                    const n = bandejaLeads.filter(l=>l.assigned_to===me?.username&&!['closed','rejected','not_interested','resolved','unresolved','finalizado','sin_respuesta'].includes(l.status||'')).length
                    return n>0?<span style={{background:'#3B82F6',color:'white',borderRadius:99,padding:'1px 6px',fontSize:10,fontWeight:700,marginLeft:3}}>{n}</span>:null
                  })()}
                </button>
              </div>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94A3B8',fontSize:13,pointerEvents:'none'}}>🔍</span>
                <input className="si" placeholder="Buscar..." value={bandejaSearch} onChange={e=>setBandejaSearch(e.target.value)}/>
              </div>
              <button onClick={()=>setSoloNoLeidos(p=>!p)} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #E2E8F0",background:soloNoLeidos?"#FFFBEB":"white",color:soloNoLeidos?"#B45309":"#64748B",fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",alignSelf:"flex-start"}}>
                {soloNoLeidos ? "🔔 Solo no leídos" : "🔔 Todos"}
              </button>
            </div>

            <div style={{flex:1,overflowY:'auto'}}>
              {vistaMode==='cola'&&(()=>{
                let leads = colaLeadsState.filter(l=>{
                  const fl=flujoMap[l.phone_number||'']||'solicitud'
                  if(me?.role==='Vendedor') return fl!=='cobranzas'
                  if(me?.role==='Cobranza') return fl==='cobranzas'
                  if(me?.role==='Administrador') return fl!=='cobranzas'
                  return fl!=='cobranzas'
                })
                if(bandejaSearch) leads=leads.filter(l=>(l.full_name||'').toLowerCase().includes(bandejaSearch.toLowerCase())||(l.phone_number||'').includes(bandejaSearch)||(l.dni||'').includes(bandejaSearch))
                if(leads.length===0) return (
                  <div style={{padding:32,textAlign:'center',color:'#94A3B8',fontSize:13}}>
                    <div style={{fontSize:36,marginBottom:8}}>✅</div>
                    <div style={{fontWeight:600,marginBottom:4}}>Cola vacía</div>
                    No hay conversaciones nuevas pendientes
                  </div>
                )
                const leadsVisibles = leads.slice(0, colaPage)
                return (<>
                  {leadsVisibles.map(lead=>{
                  return (
                    <div key={lead.phone_number??lead.id} style={{display:'flex',gap:10,padding:'12px 14px',borderBottom:'1px solid #F1F5F9',cursor:'pointer',alignItems:'flex-start',background:'#FFFBEB',borderLeft:'3px solid #F59E0B'}}
                      onClick={(e)=>{ if(me?.username==='Nicolas') { const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setColaMenuRef({x:r.right+4,y:r.top}); setColaMenu(lead) } else tomarConversacion(lead) }}>
                      <div className="av" style={{width:38,height:38,fontSize:12,background:'#FFFBEB',color:'#B45309'}}>{(lead.full_name||lead.phone_number||'?').slice(0,2).toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:2}}>
                          <span style={{fontWeight:600,fontSize:13,color:'#0F172A',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.full_name||lead.phone_number||'Sin datos'}</span>
                          <span style={{fontSize:9,padding:'2px 6px',borderRadius:99,background:'#F59E0B',color:'white',fontWeight:700,flexShrink:0}}>NUEVO</span>
                          {(()=>{ const fl=flujoMap[lead.phone_number||'']||'solicitud'; return(
                            <span style={{fontSize:9,padding:'2px 6px',borderRadius:99,background:fl==='cobranzas'?'#7C3AED':'#2563EB',color:'white',fontWeight:700,flexShrink:0}}>
                              {fl==='cobranzas'?'COB':'VTA'}
                            </span>
                          )})()}
                        </div>
                        <div style={{fontSize:11,color:'#94A3B8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.reparticion||lead.phone_number||'—'}</div>
                        <div style={{marginTop:4,fontSize:10.5,color:'#B45309',fontWeight:600}}>🟡 En cola · Click para tomar</div>
                      </div>
                    </div>
                  )
                  })}
                  {/* Dropdown discreto para Nicolas — aparece pegado al item */}
                  {colaMenu && colaMenuRef && me?.username==='Nicolas' && (
                    <div style={{position:'fixed',inset:0,zIndex:100,background:'transparent'}} onClick={()=>{setColaMenu(null);setColaMenuRef(null)}}>
                      <div style={{
                        position:'fixed',
                        top: Math.min(colaMenuRef.y, window.innerHeight-100),
                        left: Math.min(colaMenuRef.x, window.innerWidth-200),
                        background:'white',borderRadius:8,
                        boxShadow:'0 4px 16px rgba(0,0,0,.12)',
                        border:'1px solid #E2E8F0',
                        padding:'4px',minWidth:180,zIndex:101,
                      }} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>{
                          setCurrentChatMsgs([])
                          setSelectedPhone(colaMenu.phone_number)
                          if(colaMenu.phone_number) cargarMensajes(colaMenu.phone_number)
                          setBotLeads(prev => prev.find(l=>l.id===colaMenu.id) ? prev : [colaMenu,...prev])
                          setColaMenu(null); setColaMenuRef(null)
                        }} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px 10px',border:'none',background:'none',cursor:'pointer',borderRadius:6,fontSize:12,color:'#0F172A',fontWeight:500,fontFamily:'inherit',textAlign:'left'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')}
                          onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                          👁️ Vista previa
                        </button>
                        <button onClick={()=>{
                          tomarConversacion(colaMenu)
                          setColaMenu(null); setColaMenuRef(null)
                        }} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px 10px',border:'none',background:'none',cursor:'pointer',borderRadius:6,fontSize:12,color:'#0F172A',fontWeight:500,fontFamily:'inherit',textAlign:'left'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')}
                          onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                          ✋ Tomar conversación
                        </button>
                      </div>
                    </div>
                  )}

                  {colaTotal > colaLeadsState.length && (
                    <div style={{padding:'12px 16px',textAlign:'center'}}>
                      <button onClick={async()=>{
                        const idsEnMemoria = new Set(colaLeadsState.map(l=>l.id))
                        const { data: mas } = await supabase
                          .from('amat_loan_leads').select('*')
                          .is('assigned_to', null).eq('archived', false)
                          .in('status', ['new','contacted'])
                          .order('created_at', { ascending: true })
                          .range(colaLeadsState.length, colaLeadsState.length + 49)
                        if(mas?.length) {
                          const nuevos = (mas as LoanLead[]).filter(l=>!idsEnMemoria.has(l.id))
                          if(nuevos.length) setColaLeadsState(prev => [...prev, ...nuevos])
                        }
                        setColaPage(p => p + 50)
                      }} style={{padding:'8px 20px',borderRadius:8,border:'1px solid #FCD34D',background:'#FFFBEB',color:'#B45309',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                        Cargar 50 más ({Math.max(0, colaTotal - colaLeadsState.length).toLocaleString('es-AR')} restantes)
                      </button>
                    </div>
                  )}
                </>)
              })()}

              {vistaMode==='mis_chats'&&(()=>{
                let leads = bandejaLeads.filter(l=>{
                  if(l.assigned_to!==me?.username||l.status==='finalizado') return false
                  if(me?.role==='Vendedor'){
                    const fl=flujoMap[l.phone_number||'']||'solicitud'
                    return fl!=='cobranzas'
                  }
                  if(me?.role==='Cobranza'){
                    const fl=flujoMap[l.phone_number||'']||'solicitud'
                    return fl==='cobranzas'
                  }
                  return true
                })
                if(bandejaSearch) leads=leads.filter(l=>(l.full_name||'').toLowerCase().includes(bandejaSearch.toLowerCase())||(l.phone_number||'').includes(bandejaSearch)||(l.dni||'').includes(bandejaSearch))
                if(leads.length===0) return (
                  <div style={{padding:32,textAlign:'center',color:'#94A3B8',fontSize:13}}>
                    <div style={{fontSize:36,marginBottom:8}}>💬</div>
                    <div style={{fontWeight:600,marginBottom:4}}>Sin chats activos</div>
                    Tomá conversaciones de la cola
                  </div>
                )
                return leads.map(lead=>{
                  const s=sc(lead.status)
                  const lastMsg=messages.filter(m=>m.phone_number===lead.phone_number).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]
                  const unread=messages.some(m=>m.phone_number===lead.phone_number&&m.direction==='in'&&new Date(m.created_at)>new Date(lead.updated_at))
                  return (
                    <div key={lead.phone_number??lead.id} className={`ci ${selectedPhone===lead.phone_number?'on':''}`} onClick={()=>abrirChat(lead)}>
                      <div className="av" style={{width:38,height:38,fontSize:12,background:s.bg,color:s.text}}>{(lead.full_name||lead.phone_number||'?').slice(0,2).toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:2}}>
                          <span style={{fontWeight:unread?700:500,fontSize:13,color:'#0F172A',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.full_name||lead.phone_number||'Sin datos'}</span>
                          {unread&&<span style={{width:7,height:7,borderRadius:'50%',background:'#F59E0B',flexShrink:0}}/>}
                        </div>
                        <div style={{fontSize:11,color:'#94A3B8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lastMsg?(lastMsg.direction==='out'?'✓ ':'')+lastMsg.body:lead.reparticion||'Sin mensajes'}</div>
                        <div style={{marginTop:4,display:'flex',alignItems:'center',gap:5}}>
                          <span className="pill" style={{background:s.bg,color:s.text}}>{s.label}</span>
                          {(()=>{ const fl=flujoMap[lead.phone_number||'']||'solicitud'; return(
                            <span style={{fontSize:9,padding:'2px 6px',borderRadius:99,background:fl==='cobranzas'?'#7C3AED':'#2563EB',color:'white',fontWeight:700,flexShrink:0}}>
                              {fl==='cobranzas'?'COB':'VTA'}
                            </span>
                          )})()}
                        </div>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>

          {/* Chat */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {selectedPhone&&currentLead?(
              <>
                <div style={{padding:'10px 18px',background:'white',borderBottom:'1px solid #E2E8F0',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                  <div className="av" style={{width:40,height:40,fontSize:13,background:'#EFF6FF',color:'#1D4ED8'}}>{(currentLead.full_name||selectedPhone).slice(0,2).toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,color:'#0F172A'}}>{currentLead.full_name||selectedPhone}</div>
                    <div style={{fontSize:12,color:'#64748B',display:'flex',gap:8,flexWrap:'wrap'}}>
                      <span className="mono">📱 {selectedPhone}</span>
                      {currentLead.reparticion&&<span>· {currentLead.reparticion}</span>}
                      {editandoFlujo ? (
                        <select autoFocus
                          defaultValue={flujoMap[currentLead.phone_number||'']||'solicitud'}
                          onBlur={()=>setEditandoFlujo(false)}
                          onChange={async e=>{
                            const nuevoFlujo = e.target.value
                            setFlujoMap(prev=>({...prev,[currentLead.phone_number||'']:nuevoFlujo}))
                            // También actualizar botLeads y colaLeadsState para que el cambio persista
                            setBotLeads(prev=>prev.map(l=>l.phone_number===currentLead.phone_number?{...l,_flujo:nuevoFlujo}:l))
                            setColaLeadsState(prev=>prev.map(l=>l.phone_number===currentLead.phone_number?{...l,_flujo:nuevoFlujo}:l))
                            await supabase.from('amat_consultas')
                              .update({flujo:nuevoFlujo, updated_at:new Date().toISOString()})
                              .eq('phone', currentLead.phone_number||'')
                            setEditandoFlujo(false)
                          }}
                          style={{fontSize:10,padding:'1px 4px',borderRadius:6,border:'1px solid #E2E8F0',fontFamily:'inherit',fontWeight:700}}>
                          <option value="solicitud">💼 Ventas</option>
                          <option value="cobranzas">🔔 Cobranzas</option>
                        </select>
                      ) : (
                        <button
                          onClick={()=>setEditandoFlujo(true)}
                          title="Cambiar flujo"
                          style={{fontSize:11,padding:'3px 10px',borderRadius:99,fontWeight:700,cursor:'pointer',border:'none',
                            background:flujoMap[currentLead.phone_number||'']==='cobranzas'?'#F5F3FF':'#EFF6FF',
                            color:flujoMap[currentLead.phone_number||'']==='cobranzas'?'#6D28D9':'#1D4ED8',
                            display:'flex',alignItems:'center',gap:4,fontFamily:'inherit'}}>
                          {getFlujoLabelFor(currentLead.phone_number)} <span style={{fontSize:9}}>▼</span>
                        </button>
                      )}
                      {currentLead.assigned_to&&<span>· 👤 {currentLead.assigned_to}</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0,flexWrap:'wrap'}}>
                    {!currentLead.assigned_to && me?.username!=='Nicolas' && (()=>{
                      const misActivas = bandejaLeads.filter(l=>l.assigned_to===me?.username&&!['closed','rejected','not_interested','resolved','unresolved','finalizado','sin_respuesta'].includes(l.status||'')).length
                      const lleno = misActivas >= LIMITE_BANDEJA
                      return (
                        <button onClick={()=>tomarConversacion(currentLead)} style={{
                          padding:'6px 12px',borderRadius:8,border:`1px solid ${lleno?'#FCA5A5':'#FCD34D'}`,
                          background:lleno?'#FEF2F2':'#FFFBEB',color:lleno?'#991B1B':'#B45309',
                          fontSize:12,fontWeight:700,cursor:lleno?'not-allowed':'pointer',
                          fontFamily:'inherit',whiteSpace:'nowrap',opacity:lleno?0.7:1,
                        }}>
                          {lleno ? `🚫 Límite alcanzado (${misActivas}/${LIMITE_BANDEJA})` : `✋ Tomar conversación (${misActivas}/${LIMITE_BANDEJA})`}
                        </button>
                      )
                    })()}
                    <button className="btn" onClick={()=>{ if(!currentLead.assigned_to){ alert('⚠️ Asigná el lead a un asesor antes de cambiar el estado.'); return } setShowStatusModal(true) }} style={{opacity:!currentLead.assigned_to?0.5:1}}>
                      <span className="pill" style={{background:scFor(currentLead.status,currentLead.phone_number).bg,color:scFor(currentLead.status,currentLead.phone_number).text}}>{scFor(currentLead.status,currentLead.phone_number).label}</span>▾
                    </button>
                    {me?.role==='Administrador'&&(
                      <button className="btn" onClick={()=>setShowAssignModal(true)}>👤 Asignar</button>
                    )}
                    <button className="btn" onClick={()=>{setNoteText(currentLead.notes||'');setEditTarget(currentLead);setShowNoteModal(true)}}>📝 Nota</button>
                    <button className="btn" onClick={()=>openEdit(currentLead)}>✏️ Editar</button>
                    <button style={{padding:'6px 12px',borderRadius:8,border:'1px solid #E2E8F0',background:'#F8FAFC',color:'#64748B',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5,transition:'all .15s',whiteSpace:'nowrap',opacity:!currentLead.assigned_to?0.5:1}}
                      onClick={()=>{ if(!currentLead.assigned_to){ alert('⚠️ Asigná el lead a un asesor antes de finalizar la conversación.'); return } setShowFinalizarModal(true) }}>
                      ✓ Finalizar
                    </button>
                  </div>
                </div>

                <div style={{flex:1,position:'relative',minHeight:0}}>
                  {unreadCount > 0 && (
                    <button onClick={()=>scrollToBottom('smooth')} style={{
                      position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',
                      zIndex:10,padding:'6px 14px',borderRadius:20,border:'none',
                      background:'#1E293B',color:'white',fontSize:12,fontWeight:600,
                      cursor:'pointer',boxShadow:'0 4px 12px rgba(0,0,0,.25)',
                      display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',
                    }}>
                      ↓ {unreadCount} mensaje{unreadCount>1?'s':''} nuevo{unreadCount>1?'s':''}
                    </button>
                  )}
                <div ref={chatScrollRef} onScroll={handleChatScroll} style={{height:'100%',overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:10,background:'#F8FAFC',overflowAnchor:'none'}}>
                  {currentMsgs.length===0&&<div style={{textAlign:'center',color:'#94A3B8',fontSize:13,marginTop:60}}>💬 Sin mensajes</div>}
                  {currentMsgs.map(msg=>(
                    <div key={msg.id} style={{display:'flex',justifyContent:msg.direction==='out'?'flex-end':'flex-start'}}>
                      <div>
                        <div style={{fontSize:10,color:'#94A3B8',marginBottom:3,padding:msg.direction==='out'?'0 4px 0 0':'0 0 0 4px',textAlign:msg.direction==='out'?'right':'left'}}>
                          {msg.direction==='out'?msg.sender:msg.sender==='bot'?'🤖 Arturito':'Cliente'}
                        </div>
                        <div className={msg.direction==='out'?'mo':msg.sender==='bot'?'mb':'mi'}>
                          {(msg as any).media_url && (msg as any).media_type==='image' && (
                            <div style={{position:'relative',display:'inline-block',maxWidth:'100%'}}>
                              <img src={(msg as any).media_url} style={{width:'100%',height:'auto',borderRadius:8,marginBottom:4,display:'block'}} />
                              <button
                                onClick={async()=>{
                                  const url = (msg as any).media_url
                                  const res = await fetch(url)
                                  const blob = await res.blob()
                                  const a = document.createElement('a')
                                  a.href = URL.createObjectURL(blob)
                                  const ext = url.split('.').pop()?.split('?')[0] || 'jpg'
                                  a.download = `recibo_${msg.phone_number}.${ext}`
                                  a.click()
                                  URL.revokeObjectURL(a.href)
                                }}
                                style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.55)',borderRadius:6,padding:'4px 8px',color:'white',fontSize:11,border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4,backdropFilter:'blur(4px)'}}>
                                ⬇️ Descargar
                              </button>
                            </div>
                          )}
                          {(msg as any).media_url && (msg as any).media_type==='document' && (
                            <a href={(msg as any).media_url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:6,color:'inherit',textDecoration:'none',background:'rgba(255,255,255,0.15)',padding:'8px 12px',borderRadius:8,marginBottom:4}}>
                              📄 <span style={{fontSize:12}}>{msg.body||'Ver documento'}</span>
                            </a>
                          )}
                          {(msg as any).media_url && (msg as any).media_type==='audio' && (
                            <audio controls src={(msg as any).media_url} style={{width:'100%',marginBottom:4}}/>
                          )}
                          {msg.body && (
                            <div style={{fontSize:13,lineHeight:1.55,whiteSpace:'pre-wrap'}}>{msg.body}</div>
                          )}
                          <div style={{fontSize:10,marginTop:4,color:msg.direction==='out'?'rgba(255,255,255,.6)':'#94A3B8'}}>
                            {(()=>{
                              const d = new Date(msg.created_at)
                              const hoy = new Date()
                              const ayer = new Date(hoy); ayer.setDate(hoy.getDate()-1)
                              const hora = d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})
                              if(d.toDateString()===hoy.toDateString()) return `Hoy ${hora}`
                              if(d.toDateString()===ayer.toDateString()) return `Ayer ${hora}`
                              return `${d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})} ${hora}`
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={msgEndRef} style={{overflowAnchor:"auto",height:1}}/>
                </div>
                </div>

                <div style={{padding:'12px 18px',background:'white',borderTop:'1px solid #E2E8F0',display:'flex',gap:8,alignItems:'flex-end',flexShrink:0}}>
                  {/* Botones de plantillas Meta */}
                  <div style={{display:'flex',gap:6,marginBottom:6}}>
                    <button onClick={()=>sendTemplate('ayuda_economica')} disabled={sending}
                      style={{flex:1,padding:'6px 8px',border:'1px solid #DDD6FE',borderRadius:7,background:'#F5F3FF',color:'#6D28D9',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                      👋 Primer contacto
                    </button>
                    <button onClick={()=>sendTemplate('recontacto')} disabled={sending}
                      style={{flex:1,padding:'6px 8px',border:'1px solid #FDE68A',borderRadius:7,background:'#FFFBEB',color:'#B45309',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                      🔄 Recontacto
                    </button>
                  </div>
                  <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendReply()}}}
                    placeholder={`Respondé como ${me.username}... (Enter envía, Shift+Enter nueva línea)`}
                    style={{flex:1,border:'1px solid #E2E8F0',borderRadius:10,padding:'10px 14px',fontSize:13,resize:'none',fontFamily:'inherit',color:'#1E293B',background:'#F8FAFC'}} rows={2}/>
                  <button onClick={sendReply} disabled={sending||!replyText.trim()} className="btn pri" style={{padding:'10px 20px',fontSize:13,fontWeight:600,alignSelf:'stretch'}}>
                    {sending?'...':'↑ Enviar'}
                  </button>
                </div>
              </>
            ):(
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8',flexDirection:'column',gap:10,background:'#F8FAFC'}}>
                <div style={{fontSize:48}}>💬</div>
                <div style={{fontSize:14,fontWeight:500,color:'#64748B'}}>Seleccioná una conversación</div>
                <div style={{fontSize:13,color:'#94A3B8'}}>Las consultas del bot aparecen acá automáticamente</div>
              </div>
            )}
          </div>

          {/* Panel lateral */}
          {currentLead&&(
            <div style={{width:260,borderLeft:'1px solid #E2E8F0',background:'white',flexShrink:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              {showCalculador?(
                <CalculadorOferta
                  contactName={currentLead.full_name||undefined}
                  onSendMessage={(msg)=>{ setReplyText(msg); setShowCalculador(false) }}
                  onClose={()=>setShowCalculador(false)}
                />
              ):(
                <div style={{overflowY:'auto',flex:1,padding:'14px 16px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:10,fontFamily:"'DM Mono',monospace"}}>Ficha del contacto</div>
                  <div style={{padding:'8px 10px',borderRadius:8,background:scFor(currentLead.status,currentLead.phone_number).bg,marginBottom:12}}>
                    <div style={{fontSize:12,fontWeight:600,color:scFor(currentLead.status,currentLead.phone_number).text}}>{scFor(currentLead.status,currentLead.phone_number).label}</div>
                    <div style={{fontSize:11,color:scFor(currentLead.status,currentLead.phone_number).text,opacity:.7,marginTop:2}}>{scFor(currentLead.status,currentLead.phone_number).desc}</div>
                  </div>
                  {[
                    {l:'Nombre',v:currentLead.full_name},
                    {l:'DNI',v:currentLead.dni,m:true},
                    {l:'Teléfono',v:currentLead.phone_number,m:true},
                    {l:'Repartición',v:currentLead.reparticion},
                    {l:'Banco',v:currentLead.bank},
                    {l:'Monto',v:currentLead.amount?`$${currentLead.amount.toLocaleString('es-AR')}`:null},
                    {l:'Cuotas',v:currentLead.installments?`${currentLead.installments} cuotas`:null},
                    {l:'Email',v:currentLead.email},
                    {l:'Asignado a',v:currentLead.assigned_to},
                  ].map(({l,v,m})=>(
                    <div key={l} style={{marginBottom:10}}>
                      <div style={{fontSize:9.5,color:'#94A3B8',marginBottom:2,textTransform:'uppercase',letterSpacing:'.08em',fontFamily:"'DM Mono',monospace"}}>{l}</div>
                      <div className={m?'mono':''} style={{fontSize:12.5,fontWeight:v?500:400,color:v?'#0F172A':'#CBD5E1'}}>{v||'—'}</div>
                    </div>
                  ))}
                  {currentLead.notes&&(
                    <div style={{marginTop:8,padding:'10px 12px',background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:10}}>
                      <div style={{fontSize:9.5,color:'#92400E',fontWeight:700,marginBottom:4,textTransform:'uppercase',fontFamily:"'DM Mono',monospace",letterSpacing:'.06em'}}>📝 Nota</div>
                      <div style={{fontSize:12,color:'#78350F',lineHeight:1.6}}>{currentLead.notes}</div>
                    </div>
                  )}
                  <div style={{marginTop:12,fontSize:10,color:'#CBD5E1',fontFamily:"'DM Mono',monospace"}}>Ingresó: {new Date(currentLead.created_at).toLocaleDateString('es-AR')}</div>
                  <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid #F1F5F9'}}>
                    <button onClick={()=>setShowCalculador(true)} style={{width:'100%',padding:'10px',background:'linear-gradient(135deg,#059669,#10B981)',color:'white',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 2px 8px rgba(16,185,129,.25)'}}>
                      💰 Calcular oferta
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ BASE DE CONTACTOS ══ */}
      {tab==='base'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'10px 16px',background:'white',borderBottom:'1px solid #E2E8F0',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
            <div style={{position:'relative',flex:'1',minWidth:200}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94A3B8',fontSize:13,pointerEvents:'none'}}>🔍</span>
              <input className="si" placeholder="Nombre, DNI o teléfono..." value={baseSearchInput}
                onChange={e=>{
                  const v=e.target.value
                  setBaseSearchInput(v)
                  if(baseSearchTimer.current) clearTimeout(baseSearchTimer.current)
                  baseSearchTimer.current=setTimeout(()=>{ setBaseSearch(v); setBasePage(0) },400)
                }}
                onKeyDown={e=>{ if(e.key==='Enter'){ if(baseSearchTimer.current) clearTimeout(baseSearchTimer.current); setBaseSearch(baseSearchInput); setBasePage(0) } }}
              />
            </div>
            <button className="btn pri" onClick={()=>{setBaseSearch(baseSearchInput);setBasePage(0)}}>Buscar</button>
            <button className="btn suc" onClick={()=>setShowImportExport(true)}>📊 Imp/Exp</button>
            <button style={{padding:'7px 14px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#18181B,#3F3F46)',color:'white',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5,boxShadow:'0 2px 8px rgba(24,24,27,0.3)',transition:'all .15s',whiteSpace:'nowrap'}} onClick={()=>setShowCampana(true)}>
              📣 Campaña WhatsApp
            </button>
            <select className="fsel" value={baseFlujo} onChange={e=>{setBaseFlujo(e.target.value);setBasePage(0)}}>
              <option value="all">Todos los flujos</option>
              <option value="solicitud">Solicitud</option>
              <option value="cobranzas">Cobranzas</option>
            </select>
            <select className="fsel" value={baseRep} onChange={e=>{setBaseRep(e.target.value);setBasePage(0)}}>
              <option value="all">Todas las reparticiones</option>
              {REPARTICIONES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <select className="fsel" value={baseBanco} onChange={e=>{setBaseBanco(e.target.value);setBasePage(0)}}>
              <option value="all">Todos los bancos</option>
              {BANCOS.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
            <select className="fsel" value={baseStatus} onChange={e=>{setBaseStatus(e.target.value);setBasePage(0)}}>
              <option value="all">Todos los estados</option>
              <option value="new">Cola</option>
              <option value="contacted">Pendiente</option>
              <option value="contactado">Contactado</option>
              <option value="sin_respuesta">Sin respuesta</option>
              <option value="closed">Vendido</option>
              <option value="rejected">Rechazado</option>
              <option value="not_interested">No interesado</option>
              <option value="resolved">Resuelto (cobranzas)</option>
              <option value="unresolved">No resuelto (cobranzas)</option>
            </select>
            <select className="fsel" value={baseTel} onChange={e=>{setBaseTel(e.target.value as any);setBasePage(0)}}>
              <option value="all">Con y sin teléfono</option>
              <option value="con">Con teléfono</option>
              <option value="sin">Sin teléfono</option>
            </select>
            <select className="fsel" value={baseAssigned} onChange={e=>{setBaseAssigned(e.target.value);setBasePage(0)}}>
              <option value="all">Todos los asignados</option>
              <option value="sin">Sin asignar</option>
              {USERS.map(u=><option key={u.id} value={u.username}>{u.username}</option>)}
            </select>
            {(baseSearch||baseRep!=='all'||baseBanco!=='all'||baseStatus!=='all'||baseTel!=='all'||baseAssigned!=='all'||baseFlujo!=='all')&&(
              <button className="btn" onClick={()=>{setBaseSearch('');setBaseSearchInput('');setBaseRep('all');setBaseBanco('all');setBaseStatus('all');setBaseTel('all');setBaseAssigned('all');setBaseFlujo('all');setBasePage(0)}}>✕ Limpiar</button>
            )}
            <span style={{fontSize:12,color:'#94A3B8',marginLeft:'auto',whiteSpace:'nowrap'}}>{baseTotal.toLocaleString()} contacto{baseTotal!==1?'s':''}</span>
          </div>

          <div style={{flex:1,overflow:'auto'}}>
            {baseLoading?(
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#94A3B8',flexDirection:'column',gap:10}}>
                <div style={{fontSize:32}}>⏳</div><div style={{fontSize:14}}>Cargando...</div>
              </div>
            ):(
              <table className="tbl" style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  {(()=>{
                    const cols: {label:string; col:string|null}[] = [
                      {label:'Fecha', col:'created_at'},
                      {label:'Hora',  col:null},
                      {label:'Últ. mod.', col:'updated_at'},
                      {label:'DNI',   col:'dni'},
                      {label:'Nombre',col:'full_name'},
                      {label:'Teléfono', col:null},
                      {label:'Email', col:null},
                      {label:'Repartición', col:'reparticion'},
                      {label:'Flujo', col:null},
                      {label:'Banco', col:'bank'},
                      {label:'Estado',col:'status'},
                      {label:'Asignado', col:'assigned_to'},
                      {label:'Acciones', col:null},
                    ]
                    return cols.map(({label, col})=>(
                      <th key={label} onClick={()=>{
                        if(!col) return
                        if(baseOrdenCol===col) {
                          const newDir = baseOrdenDir==='desc'?'asc':'desc'
                          setBaseOrdenDir(newDir)
                          loadBase({search:baseSearch,rep:baseRep,banco:baseBanco,status:baseStatus,tel:baseTel,assigned:baseAssigned,page:0,ordenCol:col,ordenDir:newDir})
                        } else {
                          setBaseOrdenCol(col); setBaseOrdenDir('desc'); setBasePage(0)
                          loadBase({search:baseSearch,rep:baseRep,banco:baseBanco,status:baseStatus,tel:baseTel,assigned:baseAssigned,page:0,ordenCol:col,ordenDir:'desc'})
                        }
                      }} style={{cursor:col?'pointer':'default',userSelect:'none',whiteSpace:'nowrap'}}>
                        {label}
                        {col&&baseOrdenCol===col&&<span style={{marginLeft:4,fontSize:10}}>{baseOrdenDir==='desc'?'↓':'↑'}</span>}
                      </th>
                    ))
                  })()}
                </tr></thead>
                <tbody>
                  {baseLeads.filter(lead=>{
                    if(baseFlujo==='all') return true
                    const fl = flujoMap[lead.phone_number||''] || 'solicitud'
                    return fl === baseFlujo
                  }).map(lead=>{
                    const s=sc(lead.status)
                    return (
                      <tr key={lead.id}>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:'#64748B',whiteSpace:'nowrap'}}>
                          {new Date(lead.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                        </td>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:'#94A3B8',whiteSpace:'nowrap'}}>
                          {new Date(lead.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}
                        </td>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:'#CBD5E1',whiteSpace:'nowrap'}}>
                          {new Date(lead.updated_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                        </td>
                        <td className="mono" style={{color:'#64748B',fontSize:12}}>{lead.dni||'—'}</td>
                        <td style={{fontWeight:600,color:'#0F172A',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.full_name||'—'}</td>
                        <td style={{fontSize:12}}>
                          {lead.phone_number
                            ? <span className="mono">{lead.phone_number}</span>
                            : <span style={{color:'#CBD5E1',fontSize:11}}>Sin teléfono</span>}
                        </td>
                        <td style={{fontSize:12,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#64748B'}}>{lead.email||<span style={{color:'#CBD5E1'}}>—</span>}</td>
                        <td style={{fontSize:12,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.reparticion?.toUpperCase()||'—'}</td>
                        <td>
                          {(()=>{ const fl=flujoMap[lead.phone_number||'']||null; return fl ? (
                            <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,fontWeight:600,fontFamily:"'DM Mono',monospace",background:fl==='cobranzas'?'#F5F3FF':'#EFF6FF',color:fl==='cobranzas'?'#5B21B6':'#1D4ED8'}}>
                              {fl==='cobranzas'?'Cobranzas':'Solicitud'}
                            </span>
                          ) : <span style={{color:'#CBD5E1',fontSize:11}}>—</span> })()}
                        </td>
                        <td style={{fontSize:12}}>{lead.bank||'—'}</td>
                        <td><span className="pill" style={{background:s.bg,color:s.text}}>{s.label}</span></td>
                        <td style={{fontSize:12,color:'#64748B'}}>{lead.assigned_to||<span style={{color:'#CBD5E1'}}>—</span>}</td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            <button className="btn" style={{padding:'4px 9px',fontSize:11}} onClick={()=>openEdit(lead)}>✏️</button>
                            <button className="btn war" style={{padding:'4px 9px',fontSize:11}} onClick={()=>openTemplate(lead)}>💬 Plantilla</button>
                            <button className="btn" style={{padding:'4px 9px',fontSize:11,borderColor:'#6EE7B7',color:'#065F46',background:'#ECFDF5'}}
                              onClick={()=>{
                                if(lead.phone_number) cargarMensajes(lead.phone_number)
                                // Solo agregar a botLeads si ya está asignado al usuario actual
                                // Si no está asignado, el chat abre igual (currentLead lo busca en baseLeads)
                                // pero no aparece en Mis chats hasta que se tome formalmente
                                if(lead.assigned_to === me?.username) {
                                  setBotLeads(prev => prev.find(l=>l.id===lead.id) ? prev : [...prev, lead])
                                }
                                setVistaMode('mis_chats')
                                setTab('bandeja')
                                setSelectedPhone(lead.phone_number)
                              }}>
                              💬 Chat
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {baseLeads.length===0&&<tr><td colSpan={12} style={{textAlign:'center',padding:48,color:'#94A3B8'}}>Sin resultados</td></tr>}
                </tbody>
              </table>
            )}
          </div>

          <div style={{padding:'10px 16px',background:'white',borderTop:'1px solid #E2E8F0',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <button className="pb" onClick={()=>setBasePage(0)} disabled={basePage===0}>««</button>
            <button className="pb" onClick={()=>setBasePage(p=>Math.max(0,p-1))} disabled={basePage===0}>‹ Anterior</button>
            <span style={{fontSize:13,color:'#64748B'}}>Página <strong>{basePage+1}</strong> de <strong>{Math.max(1,Math.ceil(baseTotal/PAGE_SIZE))}</strong><span style={{color:'#94A3B8',marginLeft:8}}>({baseLeads.length} de {baseTotal.toLocaleString()})</span></span>
            <button className="pb" style={{marginLeft:'auto'}} onClick={()=>setBasePage(p=>p+1)} disabled={(basePage+1)*PAGE_SIZE>=baseTotal}>Siguiente ›</button>
            <button className="pb" onClick={()=>setBasePage(Math.ceil(baseTotal/PAGE_SIZE)-1)} disabled={(basePage+1)*PAGE_SIZE>=baseTotal}>»»</button>
          </div>
        </div>
      )}

      {/* ══ CONSULTAS ══ */}
      {tab==='consultas'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'10px 16px',background:'white',borderBottom:'1px solid #E2E8F0',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',flexShrink:0,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
            <div style={{position:'relative',flex:'1',minWidth:200}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94A3B8',fontSize:13,pointerEvents:'none'}}>🔍</span>
              <input className="si" placeholder="Nombre, DNI o teléfono..." value={cSearchInput}
                onChange={e=>{
                  setCSearchInput(e.target.value)
                  if(cSearchTimer.current) clearTimeout(cSearchTimer.current)
                  cSearchTimer.current=setTimeout(()=>{ setCSearch(e.target.value) },400)
                }}
              />
            </div>
            <select className="fsel" value={cFlujo} onChange={e=>setCFlujo(e.target.value)}>
              <option value="all">Todos los flujos</option>
              <option value="solicitud">Solicitud</option>
              <option value="cobranzas">Cobranzas</option>
            </select>
            <select className="fsel" value={cEstado} onChange={e=>setCEstado(e.target.value)}>
              <option value="all">Todos los estados</option>
              <option value="cola">Cola</option>
              <option value="pendiente">Pendiente</option>
              <option value="contactado">Contactado</option>
              <option value="cerrado">Sin respuesta</option>
              <option value="resuelto">Vendido</option>
              <option value="cerrado_rechazado">Rechazado</option>
              <option value="cerrado_no_interesado">No interesado</option>
              <option value="resuelto_cob">Resuelto (cobranzas)</option>
              <option value="cerrado_cob">No resuelto (cobranzas)</option>
            </select>
            <select className="fsel" value={cRep} onChange={e=>setCRep(e.target.value)}>
              <option value="all">Todas las reparticiones</option>
              {REPARTICIONES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>

            <select className="fsel" value={cOrden} onChange={e=>setCOrden(e.target.value as 'desc'|'asc')}>
              <option value="desc">📅 Más nuevas primero</option>
              <option value="asc">📅 Más viejas primero</option>
            </select>
            <button className="btn" onClick={()=>{setCSearch('');setCSearchInput('');setCFlujo('all');setCEstado('all');setCRep('all');setCOrden('desc')}}>✕ Limpiar</button>
            <button className="btn" style={{borderColor:'#BBF7D0',color:'#065F46',background:'#ECFDF5'}} onClick={exportVentas}>🎉 Exportar ventas</button>
            <span style={{fontSize:12,color:'#94A3B8',marginLeft:'auto',fontFamily:"'DM Mono',monospace"}}>{consultasTotal>consultas.length?`${consultas.length} de ${consultasTotal.toLocaleString('es-AR')}`:consultas.length} consultas</span>
          </div>

          <div style={{flex:1,overflow:'auto',background:'#F8FAFC'}}>
            {consultasLoading ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:10,color:'#94A3B8'}}>
                <div style={{fontSize:32}}>⏳</div><div>Cargando consultas...</div>
              </div>
            ) : consultas.length === 0 ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:10,color:'#94A3B8'}}>
                <div style={{fontSize:48}}>📥</div>
                <div style={{fontSize:15,fontWeight:600,color:'#64748B'}}>Sin consultas todavía</div>
                <div style={{fontSize:13,color:'#94A3B8'}}>Las consultas del bot aparecerán acá automáticamente</div>
              </div>
            ) : (
              <table className="tbl" style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  {['Fecha','Hora','Nombre','DNI','Teléfono','Repartición','Flujo','Prestación','Afiliado','Vendedor','Situación','Estado','Acciones'].map(h=>(
                    <th key={h}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {consultas.map(c=>{
                    const estadoColors: Record<string,{bg:string,text:string}> = {
                      // Estados de amat_consultas
                      cola:                {bg:'#FFFBEB',text:'#92400E'},
                      nuevo:               {bg:'#FFFBEB',text:'#92400E'},
                      pendiente:           {bg:'#EFF6FF',text:'#1D4ED8'},
                      en_proceso:          {bg:'#EFF6FF',text:'#1D4ED8'},
                      contactado:          {bg:'#DBEAFE',text:'#1E40AF'},
                      resuelto:            {bg:'#ECFDF5',text:'#065F46'},
                      cerrado:             {bg:'#F1F5F9',text:'#475569'},
                      cerrado_rechazado:   {bg:'#FEF2F2',text:'#DC2626'},
                      cerrado_no_interesado:{bg:'#F5F3FF',text:'#6D28D9'},
                      // Valores inglés por si vienen de amat_loan_leads
                      new:                 {bg:'#FFFBEB',text:'#92400E'},
                      contacted:           {bg:'#EFF6FF',text:'#1D4ED8'},
                      closed:              {bg:'#ECFDF5',text:'#065F46'},
                      resolved:            {bg:'#ECFDF5',text:'#065F46'},
                      rejected:            {bg:'#FEF2F2',text:'#991B1B'},
                      not_interested:      {bg:'#F9FAFB',text:'#374151'},
                      sin_respuesta:       {bg:'#F1F5F9',text:'#475569'},
                      unresolved:          {bg:'#FEF2F2',text:'#991B1B'},
                    }
                    const ec = estadoColors[c.estado] || estadoColors.pendiente
                    return (
                      <tr key={c.id} onClick={(e)=>{
                        if(window.getSelection()?.toString()) return
                        setConsultaSelected(c);setConsultaEdit({vendedor:c.vendedor||'',situacion:c.situacion||'',estado:c.estado||'pendiente'});setShowConsultaModal(true)
                      }}>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:'#64748B',whiteSpace:'nowrap'}}>
                          {new Date(c.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                        </td>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:'#94A3B8',whiteSpace:'nowrap'}}>
                          {new Date(c.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}
                        </td>
                        <td style={{fontWeight:600,color:'#0F172A',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre_apellido||'—'}</td>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:'#64748B'}}>{c.dni||'—'}</td>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{c.phone||'—'}</td>
                        <td style={{fontSize:12,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.reparticion_label?.toUpperCase()||'—'}</td>
                        <td>
                          <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,fontWeight:600,fontFamily:"'DM Mono',monospace",background:c.flujo==='cobranzas'?'#F5F3FF':'#EFF6FF',color:c.flujo==='cobranzas'?'#5B21B6':'#1D4ED8'}}>
                            {c.flujo==='cobranzas'?'Cobranzas':'Solicitud'}
                          </span>
                        </td>
                        <td style={{fontSize:12,color:'#64748B',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.prestacion||'—'}</td>
                        <td style={{fontSize:12}}>
                          {c.afiliado === 'SI' ? <span style={{color:'#10B981',fontWeight:600,fontSize:11}}>✓ Sí</span> : <span style={{color:'#94A3B8',fontSize:11}}>No</span>}
                        </td>
                        <td style={{fontSize:12,color:'#64748B'}}>{c.vendedor||<span style={{color:'#CBD5E1'}}>—</span>}</td>
                        <td style={{fontSize:12,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#64748B'}}>{c.situacion||'—'}</td>

                        <td>
                          <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,fontWeight:600,fontFamily:"'DM Mono',monospace",background:ec.bg,color:ec.text}}>
                            {({'nuevo':'Cola','new':'Cola','cola':'Cola','pendiente':'Pendiente','en_proceso':'Pendiente','contactado':'Contactado','contacted':'Pendiente','closed':'Vendido','resolved':'Resuelto','resuelto':'Vendido','cerrado':'Sin respuesta','cerrado_rechazado':'Rechazado','cerrado_no_interesado':'No interesado','rejected':'Rechazado','not_interested':'No interesado','no_interesado':'No interesado','no_resuelto':'No resuelto','unresolved':'No resuelto','sin_respuesta':'Sin respuesta'} as any)[c.estado]||c.estado}
                          </span>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                            <button className="btn" style={{padding:'4px 9px',fontSize:11}} onClick={e=>{e.stopPropagation();setConsultaSelected(c);setConsultaEdit({vendedor:c.vendedor||'',situacion:c.situacion||'',estado:c.estado||'pendiente'});setShowConsultaModal(true)}}>
                              ✏️ Gestionar
                            </button>
                            <button className="btn" style={{padding:'4px 9px',fontSize:11,borderColor:'#6EE7B7',color:'#065F46',background:'#ECFDF5'}} onClick={async e=>{
                              e.stopPropagation()
                              setTab('bandeja')
                              setSelectedPhone(c.phone)
                              setVistaMode('mis_chats')
                              // Cargar historial completo del chat
                              if(c.phone) {
                                const msgs = await fetchMensajesPhone(c.phone)
                                if(msgs.length) setMessages(prev=>[...prev.filter(m=>m.phone_number!==c.phone),...msgs])
                              }
                              // Si el lead no está en botLeads traerlo igual
                              if(!allLeads.find(l=>l.phone_number===c.phone)){
                                const {data:lead} = await supabase.from('amat_loan_leads')
                                  .select('*').eq('phone_number',c.phone).single()
                                if(lead) setBotLeads(prev=>prev.find(l=>l.phone_number===c.phone)?prev:[lead as any,...prev])
                              }
                            }}>
                              💬 Chat
                            </button>
                            <button className="btn war" style={{padding:'4px 9px',fontSize:11}} onClick={e=>{
                              e.stopPropagation()
                              const lead = baseLeads.find(l=>l.phone_number===c.phone)||allLeads.find(l=>l.phone_number===c.phone)
                              if(lead) openTemplate(lead)
                              else {
                                setEditTarget({id:0,phone_number:c.phone,full_name:c.nombre_apellido||c.phone,reparticion:c.reparticion||'',status:'new',archived:false} as any)
                                setSelectedTemplate(null); setTemplateVars({}); setShowTemplateModal(true)
                              }
                            }}>
                              📋 Plantilla
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══ PIPELINE ══ */}
      {/* ══ REPORTES ══ */}
      {tab==='reportes'&&(()=>{
        const getFlujo = (phone:string|null) => pipelineFlujoMap[phone||''] || flujoMap[phone||''] || 'solicitud'
        const rLeadsVentas = reporteLeads.filter(l=>getFlujo(l.phone_number)!=='cobranzas')
        const rLeadsCob    = reporteLeads.filter(l=>getFlujo(l.phone_number)==='cobranzas')
        const esAdminR     = me?.role==='Administrador'
        const modoR        = esAdminR ? reporteMode : (me?.role==='Cobranza' ? 'cobranzas' : 'ventas')
        const rLeadsFinal  = modoR==='cobranzas' ? rLeadsCob : rLeadsVentas
        return (
        <div style={{flex:1,overflow:'auto',padding:'20px 24px',background:'#F8FAFC'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap'}}>
            <span style={{fontWeight:700,fontSize:16,color:'#0F172A'}}>Reportes</span>
            {esAdminR && (
              <div style={{display:'flex',gap:4,background:'#F1F5F9',padding:3,borderRadius:8}}>
                {(['ventas','cobranzas'] as const).map(m=>(
                  <button key={m} onClick={()=>setReporteMode(m)}
                    style={{padding:'5px 16px',borderRadius:6,border:'none',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all .15s',
                      background:reporteMode===m?'white':'transparent',
                      color:reporteMode===m?'#0F172A':'#64748B',
                      boxShadow:reporteMode===m?'0 1px 3px rgba(0,0,0,.1)':'none'}}>
                    {m==='ventas'?'💼 Ventas':'🔔 Cobranzas'}
                  </button>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:8,alignItems:'center',marginLeft:'auto',flexWrap:'wrap'}}>
              <select value={reportePeriodo} onChange={e=>{
                setReportePeriodo(e.target.value)
                loadReportes(e.target.value)
              }} style={{padding:'6px 10px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:12,fontWeight:600,color:'#374151',cursor:'pointer',outline:'none'}}>
                <option value="mes_actual">📅 Este mes</option>
                <option value="mes_pasado">📅 Mes pasado</option>
              </select>
              <button onClick={()=>loadReportes(reportePeriodo,reporteDesde,reporteHasta)}
                style={{padding:'6px 12px',borderRadius:8,border:'1px solid #E2E8F0',background:'white',fontSize:12,fontWeight:600,cursor:'pointer',color:'#374151'}}>
                ↻ Actualizar
              </button>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
            {(modoR==='cobranzas' ? [
              {label:'Total casos',val:rLeadsFinal.length,color:'#7C3AED',icon:'◈',sub:'Histórico total'},
              {label:'Resueltos',val:rLeadsFinal.filter(l=>l.status==='resolved').length,color:'#10B981',icon:'✓',sub:'Casos resueltos'},
              {label:'No resueltos',val:rLeadsFinal.filter(l=>l.status==='unresolved').length,color:'#EF4444',icon:'✗',sub:'Sin resolución'},
              {label:'Contactados',val:rLeadsFinal.filter(l=>l.status==='contacted').length,color:'#06B6D4',icon:'◉',sub:'Conversaciones iniciadas'},
              {label:'Tasa resolución',val:rLeadsFinal.length>0?Math.round(rLeadsFinal.filter(l=>l.status==='resolved').length/rLeadsFinal.length*100)+'%':'0%',color:'#EC4899',icon:'%',sub:'Resueltos vs total'},
            ] : [
              {label:'Total leads',val:rLeadsFinal.length,color:'#F59E0B',icon:'◈',sub:reportePeriodo==='mes_actual'?'Este mes':reportePeriodo==='mes_pasado'?'Mes pasado':reportePeriodo==='historico'?'Histórico total':'Período seleccionado'},
              {label:'Cerrados',val:rLeadsFinal.filter(l=>l.status==='closed').length,color:'#10B981',icon:'✓',sub:'Operaciones concretadas'},
              {label:'Contactados',val:rLeadsFinal.filter(l=>l.status==='contacted').length,color:'#06B6D4',icon:'◉',sub:'Conversaciones iniciadas'},
              {label:'Sin contactar',val:rLeadsFinal.filter(l=>l.status==='new').length,color:'#F59E0B',icon:'·',sub:'Estado nuevo'},
              {label:'Tasa conversión',val:rLeadsFinal.length>0?Math.round(rLeadsFinal.filter(l=>l.status==='closed').length/rLeadsFinal.length*100)+'%':'0%',color:'#EC4899',icon:'%',sub:'Cerrados vs total'},
            ]).map(k=>(
              <div key={k.label} style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px 18px',borderTop:`3px solid ${k.color}`,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.07em',fontFamily:"'DM Mono',monospace"}}>{k.label}</span>
                  <span style={{fontSize:18,color:k.color,opacity:0.6}}>{k.icon}</span>
                </div>
                <div style={{fontSize:28,fontWeight:700,color:k.color,lineHeight:1}}>{k.val}</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:6,fontFamily:"'DM Mono',monospace"}}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:16,marginBottom:16}}>
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Distribución por estado</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Cantidad de leads en cada etapa del proceso</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={(modoR==='cobranzas'?Object.entries(COBRANZA_STATUS):Object.entries(LEAD_STATUS)).map(([k,v])=>({name:v.label,value:rLeadsFinal.filter(l=>l.status===k).length,color:v.color}))}
                  margin={{top:0,right:10,left:-10,bottom:40}}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:10,fill:'#94A3B8'}} angle={-35} textAnchor="end" interval={0} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontSize:11,fill:'#94A3B8'}} tickLine={false} axisLine={false} allowDecimals={false}/>
                  <Tooltip contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12}} cursor={{fill:'rgba(59,130,246,0.05)'}} formatter={(val:any)=>[`${val} leads`,'']}/>
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {Object.entries(LEAD_STATUS).map(([k,v],i)=>(<Cell key={i} fill={v.color}/>))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Por repartición</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Composición del segmento activo</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={REPARTICIONES.map(r=>({name:r.replace('MINISTERIO DE ','Min. ').replace('SERVICIO PENITENCIARIO BONAERENSE','SPB'),value:rLeadsFinal.filter(l=>l.reparticion===r).length})).filter(d=>d.value>0)}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                    {REPARTICIONES.map((_,i)=>(<Cell key={i} fill={['#F59E0B','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899'][i%7]}/>))}
                  </Pie>
                  <Tooltip contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12}} formatter={(val:any)=>[`${val} leads`,'']}/>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Embudo de conversión</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Leads que avanzan por cada etapa</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={modoR==='cobranzas' ? [
                    {etapa:'Nuevos',leads:rLeadsFinal.filter(l=>l.status==='new').length},
                    {etapa:'Contactados',leads:rLeadsFinal.filter(l=>l.status==='contacted').length},
                    {etapa:'Resueltos',leads:rLeadsFinal.filter(l=>l.status==='resolved').length},
                    {etapa:'No resueltos',leads:rLeadsFinal.filter(l=>l.status==='unresolved').length},
                  ] : [
                    {etapa:'Nuevos',leads:rLeadsFinal.filter(l=>l.status==='new').length},
                    {etapa:'Contactados',leads:rLeadsFinal.filter(l=>l.status==='contacted').length},
                    {etapa:'No interesados',leads:rLeadsFinal.filter(l=>l.status==='not_interested').length},
                    {etapa:'Rechazados',leads:rLeadsFinal.filter(l=>l.status==='rejected').length},
                    {etapa:'Cerrados',leads:rLeadsFinal.filter(l=>l.status==='closed').length},
                  ]}
                  margin={{top:5,right:20,left:-10,bottom:5}}>
                  <defs>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                  <XAxis dataKey="etapa" tick={{fontSize:11,fill:'#94A3B8'}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontSize:11,fill:'#94A3B8'}} tickLine={false} axisLine={false} allowDecimals={false}/>
                  <Tooltip contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12}} formatter={(val:any)=>[`${val} leads`,'']}/>
                  <Area type="monotone" dataKey="leads" stroke="#3B82F6" strokeWidth={2} fill="url(#colorLeads)" dot={{fill:'#F59E0B',strokeWidth:0,r:4}}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Rendimiento por asesor</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Leads asignados y cerrados por usuario</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart layout="vertical"
                  data={USERS.filter(u=>u.username!=='Nicolas'&&u.role!=='Administrador').map(u=>{
                    const leads = rLeadsFinal.filter(l=>l.assigned_to===u.username)
                    const cerrados = modoR==='cobranzas'
                      ? leads.filter(l=>l.status==='resolved').length
                      : leads.filter(l=>l.status==='closed').length
                    const montoCerrado = leads
                      .filter(l=>l.status==='closed')
                      .reduce((acc:number,l:any)=>(acc+(l.monto_solicitado||0)),0)
                    return {
                      name:u.username,
                      asignados:leads.length,
                      cerrados,
                      montoCerrado,
                      color:u.color,
                    }
                  }).filter(u=>u.asignados>0||u.cerrados>0)}
                  margin={{top:0,right:20,left:10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11,fill:'#94A3B8'}} tickLine={false} axisLine={false} allowDecimals={false}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#64748B'}} tickLine={false} axisLine={false} width={60}/>
                  <Tooltip contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12}}/>
                  <Legend iconType="square" iconSize={8} wrapperStyle={{fontSize:11}}/>
                  <Bar dataKey="asignados" name="Asignados" fill="#BFDBFE" radius={[0,4,4,0]}/>
                  <Bar dataKey="cerrados" name="Cerrados" fill="#2563EB" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #F1F5F9'}}>
              <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Resumen por repartición</div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                <thead>
                  <tr style={{background:'#F8FAFC'}}>
                    {(modoR==='cobranzas'
                      ? ['Repartición','Total','Nuevos','Contactados','Resueltos','No resueltos','% Resolución']
                      : ['Repartición','Total','Nuevos','Contactados','No interesados','Cerrados','Rechazados','% Cierre']
                    ).map(h=>(<th key={h} style={{textAlign:'left',padding:'10px 14px',fontSize:10.5,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',borderBottom:'1px solid #E2E8F0',whiteSpace:'nowrap'}}>{h}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {REPARTICIONES.map(r=>{
                    const leads_r=rLeadsFinal.filter(l=>l.reparticion===r)
                    if(leads_r.length===0) return null
                    const total=leads_r.length
                    const exito=modoR==='cobranzas'?leads_r.filter(l=>l.status==='resolved').length:leads_r.filter(l=>l.status==='closed').length
                    const pctCierre=total>0?Math.round(exito/total*100):0
                    return (
                      <tr key={r} style={{borderBottom:'1px solid #F8FAFC'}} onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')} onMouseLeave={e=>(e.currentTarget.style.background='white')}>
                        <td style={{padding:'10px 14px',fontWeight:600,color:'#0F172A'}}>{r.replace('MINISTERIO DE ','Min. ').replace('SERVICIO PENITENCIARIO BONAERENSE','SPB')}</td>
                        <td style={{padding:'10px 14px',fontWeight:700,color:modoR==='cobranzas'?'#7C3AED':'#F59E0B',fontFamily:"'DM Mono',monospace"}}>{total}</td>
                        <td style={{padding:'10px 14px',color:'#94A3B8',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='new').length}</td>
                        <td style={{padding:'10px 14px',color:'#06B6D4',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='contacted').length}</td>
                        {modoR==='cobranzas' ? <>
                          <td style={{padding:'10px 14px',color:'#10B981',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='resolved').length}</td>
                          <td style={{padding:'10px 14px',color:'#EF4444',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='unresolved').length}</td>
                        </> : <>
                          <td style={{padding:'10px 14px',color:'#6B7280',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='not_interested').length}</td>
                          <td style={{padding:'10px 14px',color:'#10B981',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{exito}</td>
                          <td style={{padding:'10px 14px',color:'#EF4444',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='rejected').length}</td>
                        </>}
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1,height:4,background:'#F1F5F9',borderRadius:99,overflow:'hidden',minWidth:40}}>
                              <div style={{height:'100%',width:`${pctCierre}%`,background:'#10B981',borderRadius:99}}/>
                            </div>
                            <span style={{fontSize:11,fontWeight:700,color:pctCierre>20?'#10B981':pctCierre>10?'#F59E0B':'#94A3B8',minWidth:30}}>{pctCierre}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{background:'#F8FAFC',borderTop:'2px solid #E2E8F0'}}>
                    <td style={{padding:'10px 14px',fontWeight:700,color:'#0F172A',fontSize:11,textTransform:'uppercase'}}>TOTAL</td>
                    <td style={{padding:'10px 14px',fontWeight:700,color:modoR==='cobranzas'?'#7C3AED':'#F59E0B',fontFamily:"'DM Mono',monospace"}}>{rLeadsFinal.length}</td>
                    <td style={{padding:'10px 14px',color:'#94A3B8',fontFamily:"'DM Mono',monospace"}}>{rLeadsFinal.filter(l=>l.status==='new').length}</td>
                    <td style={{padding:'10px 14px',color:'#06B6D4',fontFamily:"'DM Mono',monospace"}}>{rLeadsFinal.filter(l=>l.status==='contacted').length}</td>
                    {modoR==='cobranzas' ? <>
                      <td style={{padding:'10px 14px',color:'#10B981',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{rLeadsFinal.filter(l=>l.status==='resolved').length}</td>
                      <td style={{padding:'10px 14px',color:'#EF4444',fontFamily:"'DM Mono',monospace"}}>{rLeadsFinal.filter(l=>l.status==='unresolved').length}</td>
                    </> : <>
                      <td style={{padding:'10px 14px',color:'#6B7280',fontFamily:"'DM Mono',monospace"}}>{rLeadsFinal.filter(l=>l.status==='not_interested').length}</td>
                      <td style={{padding:'10px 14px',color:'#10B981',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{rLeadsFinal.filter(l=>l.status==='closed').length}</td>
                      <td style={{padding:'10px 14px',color:'#EF4444',fontFamily:"'DM Mono',monospace"}}>{rLeadsFinal.filter(l=>l.status==='rejected').length}</td>
                    </>}
                    <td style={{padding:'10px 14px'}}>
                      <span style={{fontSize:11,fontWeight:700,color:'#10B981',fontFamily:"'DM Mono',monospace"}}>
                        {rLeadsFinal.length>0?Math.round((modoR==='cobranzas'?rLeadsFinal.filter(l=>l.status==='resolved').length:rLeadsFinal.filter(l=>l.status==='closed').length)/rLeadsFinal.length*100):0}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:16,marginBottom:20}}>
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Salud de la operación</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Estados positivos vs negativos</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart innerRadius="25%" outerRadius="90%"
                  data={modoR==='cobranzas' ? [
                    {name:'Resueltos',value:rLeadsFinal.filter(l=>l.status==='resolved').length,fill:'#10B981'},
                    {name:'Contactados',value:rLeadsFinal.filter(l=>l.status==='contacted').length,fill:'#06B6D4'},
                    {name:'No resueltos',value:rLeadsFinal.filter(l=>l.status==='unresolved').length,fill:'#EF4444'},
                  ] : [
                    {name:'Cerrados',value:rLeadsFinal.filter(l=>l.status==='closed').length,fill:'#10B981'},
                    {name:'Contactados',value:rLeadsFinal.filter(l=>l.status==='contacted').length,fill:'#06B6D4'},
                    {name:'No interesados',value:rLeadsFinal.filter(l=>l.status==='not_interested').length,fill:'#6B7280'},
                    {name:'Rechazados',value:rLeadsFinal.filter(l=>l.status==='rejected').length,fill:'#EF4444'},
                  ]}
                  startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" cornerRadius={4} background={{fill:'#F8FAFC'}}/>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}}/>
                  <Tooltip contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12}}/>
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden'}}>
              <div style={{padding:'16px 20px',borderBottom:'1px solid #F1F5F9'}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Detalle por asesor</div>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                <thead>
                  <tr style={{background:'#F8FAFC'}}>
                    {['Asesor','Asignados','Contactados','Cerrados','% Cierre'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'9px 14px',fontSize:10.5,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',borderBottom:'1px solid #E2E8F0'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {USERS.filter(u=>u.username!=='Nicolas').map(u=>{
                    const asignados=rLeadsFinal.filter(l=>l.assigned_to===u.username).length
                    const exitoStatus=modoR==='cobranzas'?'resolved':'closed'
                    const contactados=rLeadsFinal.filter(l=>l.assigned_to===u.username&&['contacted',exitoStatus].includes(l.status)).length
                    const cerrados=rLeadsFinal.filter(l=>l.assigned_to===u.username&&l.status===exitoStatus).length
                    const pct=asignados>0?Math.round(cerrados/asignados*100):0
                    return (
                      <tr key={u.id} style={{borderBottom:'1px solid #F8FAFC'}} onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')} onMouseLeave={e=>(e.currentTarget.style.background='white')}>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{width:28,height:28,borderRadius:'50%',background:u.color,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:10,fontWeight:700,flexShrink:0}}>{u.initials}</div>
                            <div>
                              <div style={{fontWeight:600,color:'#0F172A',fontSize:12.5}}>{u.username}</div>
                              <div style={{fontSize:10.5,color:'#94A3B8'}}>{u.role}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'10px 14px',fontWeight:500,color:'#374151',fontFamily:"'DM Mono',monospace"}}>{asignados}</td>
                        <td style={{padding:'10px 14px',color:'#06B6D4',fontFamily:"'DM Mono',monospace"}}>{contactados}</td>
                        <td style={{padding:'10px 14px',color:'#10B981',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{cerrados}</td>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div style={{width:50,height:4,background:'#F1F5F9',borderRadius:99,overflow:'hidden'}}>
                              <div style={{height:'100%',width:`${pct}%`,background:u.color,borderRadius:99}}/>
                            </div>
                            <span style={{fontSize:11,fontWeight:700,color:u.color,fontFamily:"'DM Mono',monospace"}}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ══ MODAL: CAMBIAR ESTADO ══ */}
      {showStatusModal&&currentLead&&(
        <div className="movo" onClick={()=>setShowStatusModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()}>
            <h3>Cambiar estado</h3>
            {[...(flujoMap[currentLead.phone_number||'']==='cobranzas' ? OPCIONES_COBRANZAS : []), ...OPCIONES_VENTAS_INTERMEDIOS, ...(flujoMap[currentLead.phone_number||'']==='cobranzas' ? [] : OPCIONES_VENTAS)]
              .map(k => [k, LEAD_STATUS[k] || COBRANZA_STATUS[k]] as [string, typeof LEAD_STATUS[keyof typeof LEAD_STATUS]])
              .filter(([,v])=>v)
              .map(([k,v])=>{
                const esCobranza = flujoMap[currentLead.phone_number||'']==='cobranzas'
                return (
                <div key={k} className="mopt"
                  onClick={()=>{
                    if(!esCobranza&&k==='rejected'){
                      setShowStatusModal(false)
                      setEditTarget(currentLead)
                      setShowRejectModal(true)
                    } else if(!esCobranza&&k==='closed'){
                      setShowStatusModal(false)
                      setVentaForm({entidad:'',linea:'',reparticion:currentLead.reparticion||'',monto:'',cuotas:'',valor_cuota:'',notas:''})
                      setShowVentaModal(true)
                    } else {
                      updateStatus(currentLead.id,k)
                      setShowStatusModal(false)
                    }
                  }}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:v.color,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500,color:'#1E293B'}}>
                      {v.label}
                      {!esCobranza&&k==='rejected'&&<span style={{fontSize:11,color:'#94A3B8',marginLeft:6}}>→ elegí motivo</span>}
                      {!esCobranza&&k==='closed'&&<span style={{fontSize:11,color:'#065F46',marginLeft:6}}>→ registrá la venta</span>}
                    </div>
                    <div style={{fontSize:11,color:'#94A3B8'}}>{v.desc}</div>
                  </div>
                  {currentLead.status===k&&<span style={{color:'#F59E0B',fontSize:16}}>✓</span>}
                </div>
              )})}
            <button className="btn" style={{width:'100%',justifyContent:'center',marginTop:14}} onClick={()=>setShowStatusModal(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ══ MODAL: ASIGNAR ══ */}
      {showAssignModal&&currentLead&&(
        <div className="movo" onClick={()=>setShowAssignModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()}>
            <h3>Asignar a un asesor</h3>
            {USERS.map(u=>(
              <div key={u.id} className="mopt" onClick={async()=>{
                const res = await tomarLead({...currentLead, assigned_to: null}, u.username)
                if(!res.ok) { alert('❌ No se pudo asignar. Intentá de nuevo.'); return }
                setShowAssignModal(false)
              }}>
                <div className="av" style={{width:34,height:34,fontSize:11,background:u.color,color:'white'}}>{u.initials}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#1E293B'}}>{u.username}</div>
                  <div style={{fontSize:11,color:'#94A3B8'}}>{u.role}</div>
                </div>
                {currentLead.assigned_to===u.username&&<span style={{color:'#F59E0B',fontSize:18}}>✓</span>}
              </div>
            ))}
            <div className="mopt" style={{border:'1px solid #E2E8F0',borderRadius:10,marginTop:6}} onClick={async()=>{
              const { error } = await supabase.from('amat_loan_leads').update({assigned_to:null,updated_at:new Date().toISOString()}).eq('id',currentLead.id)
              if(error) { alert('❌ No se pudo quitar la asignación. Intentá de nuevo.'); return }
              setShowAssignModal(false)
            }}>
              <span style={{fontSize:13,color:'#EF4444'}}>Quitar asignación</span>
            </div>
            <button className="btn" style={{width:'100%',justifyContent:'center',marginTop:8}} onClick={()=>setShowAssignModal(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ══ MODAL: NOTA ══ */}
      {showNoteModal&&(
        <div className="movo" onClick={()=>setShowNoteModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()}>
            <h3>📝 Nota interna</h3>
            <p style={{fontSize:12,color:'#64748B',margin:'0 0 12px'}}>Solo visible para el equipo.</p>
            <textarea className="ta" placeholder="Ej: Cliente interesado, llamar lunes a las 10hs." value={noteText} onChange={e=>setNoteText(e.target.value)}/>
            <div style={{display:'flex',gap:8,marginTop:14}}>
              <button className="btn pri" style={{flex:1,justifyContent:'center'}} onClick={saveNote}>Guardar nota</button>
              <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowNoteModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: RECHAZAR ══ */}
      {showRejectModal&&editTarget&&(
        <div className="movo" onClick={()=>setShowRejectModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()}>
            <h3>✕ Motivo de rechazo</h3>
            {REJECTION_REASONS.map(r=>(
              <div key={r} className="mopt" style={{background:rejectReason===r?'#FEF2F2':'',borderColor:rejectReason===r?'#FECACA':''}} onClick={()=>setRejectReason(r)}>
                <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${rejectReason===r?'#EF4444':'#E2E8F0'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {rejectReason===r&&<div style={{width:8,height:8,borderRadius:'50%',background:'#EF4444'}}/>}
                </div>
                <span style={{fontSize:13,color:'#1E293B'}}>{r}</span>
              </div>
            ))}
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button className="btn dan" style={{flex:1,justifyContent:'center'}} onClick={handleReject} disabled={!rejectReason}>Confirmar rechazo</button>
              <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowRejectModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: EDITAR ══ */}
      {showEditModal&&editTarget&&(
        <div className="movo" onClick={()=>setShowEditModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()}>
            <h3>✏️ Editar contacto</h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{gridColumn:'1/-1'}}>
                <label className="fl">Nombre completo</label>
                <input className="fi" value={editForm.full_name||''} onChange={e=>setEditForm(f=>({...f,full_name:e.target.value}))}/>
              </div>
              <div>
                <label className="fl">DNI</label>
                <input className="fi mono" value={editForm.dni||''} onChange={e=>setEditForm(f=>({...f,dni:e.target.value}))}/>
              </div>
              <div>
                <label className="fl">Teléfono</label>
                <input className="fi mono" placeholder="5491112345678" value={editForm.phone_number||''} onChange={e=>setEditForm(f=>({...f,phone_number:e.target.value}))}/>
              </div>
              <div>
                <label className="fl">Email</label>
                <input className="fi" type="email" value={editForm.email||''} onChange={e=>setEditForm(f=>({...f,email:e.target.value}))}/>
              </div>
              <div>
                <label className="fl">Repartición</label>
                <select className="fs" value={editForm.reparticion||''} onChange={e=>setEditForm(f=>({...f,reparticion:e.target.value}))}>
                  <option value="">Sin repartición</option>
                  {REPARTICIONES.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Banco</label>
                <select className="fs" value={editForm.bank||''} onChange={e=>setEditForm(f=>({...f,bank:e.target.value}))}>
                  <option value="">Sin banco</option>
                  {BANCOS.map(b=><option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Monto solicitado</label>
                <input className="fi" type="number" value={editForm.amount||''} onChange={e=>setEditForm(f=>({...f,amount:Number(e.target.value)||undefined}))}/>
              </div>
              <div>
                <label className="fl">Cuotas</label>
                <input className="fi" type="number" value={editForm.installments||''} onChange={e=>setEditForm(f=>({...f,installments:Number(e.target.value)||undefined}))}/>
              </div>
              <div>
                <label className="fl">Estado</label>
                <select className="fs" value={editForm.status||'new'} onChange={e=>setEditForm(f=>({...f,status:e.target.value as any}))}>
                  <option value="new">Pendiente</option>
              <option value="contacted">En bandeja</option>
              <option value="contactado">Contactado</option>
              <option value="closed">Vendido</option>
              <option value="rejected">Rechazado</option>
              <option value="not_interested">No interesado</option>
                </select>
              </div>
              {me?.role==='Administrador'&&(
              <div>
                <label className="fl">Asignado a</label>
                <select className="fs" value={editForm.assigned_to||''} onChange={e=>setEditForm(f=>({...f,assigned_to:e.target.value}))}>
                  <option value="">Sin asignar</option>
                  {USERS.map(u=><option key={u.id} value={u.username}>{u.username} — {u.role}</option>)}
                </select>
              </div>
              )}
              <div style={{gridColumn:'1/-1'}}>
                <label className="fl">Nota interna</label>
                <textarea className="ta" style={{minHeight:60}} value={editForm.notes||''} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}/>
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:16,paddingTop:16,borderTop:'1px solid #F1F5F9'}}>
              <button className="btn pri" style={{flex:1,justifyContent:'center'}} onClick={saveEdit} disabled={editSaving}>{editSaving?'Guardando...':'💾 Guardar'}</button>
              <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowEditModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: PLANTILLAS ══ */}
      {showTemplateModal&&editTarget&&(
        <div className="movo" onClick={()=>setShowTemplateModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()}>
            <h3>💬 Plantillas de mensaje</h3>
            {!selectedTemplate?(
              <>
                <p style={{fontSize:13,color:'#64748B',marginBottom:14}}>Seleccioná una plantilla para contactar a <strong>{editTarget.full_name}</strong>:</p>
                {TEMPLATES.filter(t=>['ayuda_economica','recontacto'].includes(t.id)).map(tpl=>(
                  <div key={tpl.id} className="tcard" onClick={()=>applyTemplate(tpl,editTarget)}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{fontSize:12,fontWeight:600,color:'#1E293B'}}>{tpl.name}</span>
                      <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#EFF6FF',color:'#1D4ED8',fontWeight:600}}>{tpl.category}</span>
                    </div>
                    <div style={{fontSize:12,color:'#64748B',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{tpl.body.substring(0,120)}...</div>
                  </div>
                ))}
              </>
            ):(
              <>
                <div style={{marginBottom:14}}>
                  <button className="btn" onClick={()=>setSelectedTemplate(null)} style={{marginBottom:14}}>← Volver</button>
                  <div style={{fontWeight:600,fontSize:14,color:'#0F172A',marginBottom:8}}>{selectedTemplate.name}</div>
                  {selectedTemplate.variables.map(v=>(
                    <div key={v} style={{marginBottom:10}}>
                      <label className="fl">Variable: {`{{${v}}}`}</label>
                      <input className="fi" value={templateVars[v]||''} onChange={e=>setTemplateVars(tv=>({...tv,[v]:e.target.value}))}/>
                    </div>
                  ))}
                  <label className="fl" style={{marginTop:12}}>Vista previa</label>
                  <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'12px 14px',fontSize:13,lineHeight:1.6,color:'#1E293B',whiteSpace:'pre-wrap'}}>
                    {selectedTemplate.body.replace(/\{\{(\w+)\}\}/g,(_,k)=>templateVars[k]||`[${k}]`)}
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn pri" style={{flex:1,justifyContent:'center'}} onClick={async()=>{
                    if(!editTarget?.phone_number||!me) return
                    try {
                      const controller = new AbortController()
                      const timeout = setTimeout(()=>controller.abort(), 8000)
                      await fetch('/api/send-message',{
                        method:'POST',headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({
                          phone: editTarget.phone_number,
                          template: selectedTemplate.id,
                          senderName: me.username
                        }),
                        signal: controller.signal,
                      })
                      clearTimeout(timeout)
                    } catch(e) {
                      console.error('[plantilla modal] timeout o error:', e)
                    } finally {
                      await registrarCampana({
                        phone:     editTarget.phone_number!,
                        dni:       editTarget.dni,
                        plantilla: selectedTemplate.id,
                        operador:  me.username,
                      })
                      await updateStatus(editTarget.id,'contacted')
                      setShowTemplateModal(false)
                      alert(`✅ Plantilla enviada a ${editTarget.full_name}`)
                    }
                  }}>
                    ✈️ Enviar plantilla
                  </button>
                  <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowTemplateModal(false)}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL: FINALIZAR CONVERSACIÓN ══ */}
      {showFinalizarModal&&currentLead&&(()=>{
        const flujo = flujoMap[currentLead.phone_number||'']||'solicitud'
        const estadosFinales = flujo==='cobranzas' ? ['resolved','unresolved'] : ['not_interested','rejected','closed']
        const yaFinalizado = estadosFinales.includes(currentLead.status||'')
        const statusOpts = flujo==='cobranzas'
          ? Object.entries(COBRANZA_STATUS).filter(([k])=>['resolved','unresolved'].includes(k))
          : [
              ['rejected',      {label:'Rechazado',     bg:'#FEF2F2', text:'#991B1B'}],
              ['not_interested', {label:'No interesado', bg:'#F9FAFB', text:'#374151'}],
            ] as [string, {label:string;bg:string;text:string}][]
        const puedeConfirmar = yaFinalizado || !!finalizarEstado
        const estadoLabel = (flujo==='cobranzas'?COBRANZA_STATUS:LEAD_STATUS)[currentLead.status||'']?.label || currentLead.status
        return (
          <div className="movo" onClick={()=>{ setShowFinalizarModal(false); setFinalizarEstado('') }}>
            <div className="mod" onClick={e=>e.stopPropagation()} style={{width:420}}>
              <h3>✓ Finalizar conversación</h3>
              <p style={{fontSize:13,color:'#64748B',marginBottom:16,lineHeight:1.6}}>
                Al finalizar, la conversación con <strong>{currentLead.full_name||currentLead.phone_number}</strong> se cerrará y saldrá de tu bandeja.
              </p>
              {yaFinalizado ? (
                <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:10,padding:'12px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:18}}>✅</span>
                  <div>
                    <div style={{fontSize:11,color:'#166534',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:2}}>Estado registrado</div>
                    <div style={{fontSize:14,fontWeight:600,color:'#166534'}}>{estadoLabel}</div>
                  </div>
                </div>
              ) : (
                <div style={{background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:10,padding:'12px 14px',marginBottom:16}}>
                  <div style={{fontSize:12,color:'#C2410C',fontWeight:600,marginBottom:8}}>⚠️ Debés elegir un estado final antes de cerrar</div>
                  <label className="fl">Estado final</label>
                  <select className="fs" value={finalizarEstado} onChange={e=>setFinalizarEstado(e.target.value)}>
                    <option value="">— Seleccioná un estado —</option>
                    {statusOpts.map(([k,v])=>(<option key={k} value={k}>{v.label}</option>))}
                  </select>
                </div>
              )}
              {!yaFinalizado && (
                <div style={{marginBottom:12}}>
                  <label className="fl">Anotación <span style={{color:'#94A3B8',fontWeight:400}}>(opcional)</span></label>
                  <textarea className="ta" style={{minHeight:64}} placeholder="Describí qué se resolvió, motivo de cierre..." value={finalizarNota} onChange={e=>setFinalizarNota(e.target.value)}/>
                </div>
              )}
              <div style={{display:'flex',gap:8}}>
                <button className="btn pri" style={{flex:1,justifyContent:'center',opacity:puedeConfirmar?1:0.4}} disabled={!puedeConfirmar}
                  onClick={async()=>{
                    if(!yaFinalizado&&finalizarEstado) await updateStatus(currentLead.id,finalizarEstado)
                    await finalizarConversacion(yaFinalizado?undefined:finalizarNota)
                  }}>
                  ✓ {yaFinalizado ? 'Sí, cerrar conversación' : 'Confirmar y finalizar'}
                </button>
                <button className="btn" onClick={()=>{ setShowFinalizarModal(false); setFinalizarEstado(''); setFinalizarNota('') }}>Cancelar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ MODAL: VENTA CERRADA ══ */}
      {showVentaModal&&currentLead&&(()=>{
        const montoNum = parseInt(ventaForm.monto)||0
        const cuotasNum = parseInt(ventaForm.cuotas)||0
        const calcCuota = ventaForm.entidad&&ventaForm.linea&&ventaForm.reparticion&&montoNum&&cuotasNum
          ? calcularCuotaAMAT(ventaForm.entidad,ventaForm.linea,ventaForm.reparticion,montoNum,cuotasNum) : 0
        const fmtP = (n:number) => n>0 ? '$ '+n.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.') : '—'
        return (
        <div className="movo" onClick={()=>setShowVentaModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()} style={{width:540}}>
            <h3>🎉 Registrar venta cerrada</h3>
            <p style={{fontSize:12,color:'#64748B',marginBottom:14}}>El valor de cuota se calcula automáticamente con la grilla AMAT.</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label className="fl">Entidad</label>
                <div style={{display:'flex',gap:6}}>
                  {['AMAT','DOS DE AGOSTO'].map(e=>(
                    <button key={e} style={{flex:1,padding:'8px 4px',borderRadius:7,borderWidth:1,borderStyle:'solid',borderColor:ventaForm.entidad===e?'#B45309':'#E2E8F0',background:ventaForm.entidad===e?'#FFFBEB':'white',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',color:ventaForm.entidad===e?'#B45309':'#374151'}}
                      onClick={()=>setVentaForm(f=>({...f,entidad:e}))}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="fl">Línea</label>
                <div style={{display:'flex',gap:5}}>
                  {['Haberes','Ayuda','BAPRO'].map(l=>(
                    <button key={l} style={{flex:1,padding:'8px 4px',borderRadius:7,borderWidth:1,borderStyle:'solid',borderColor:ventaForm.linea===l?'#B45309':'#E2E8F0',background:ventaForm.linea===l?'#FFFBEB':'white',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',color:ventaForm.linea===l?'#B45309':'#374151'}}
                      onClick={()=>setVentaForm(f=>({...f,linea:l}))}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="fl">Repartición</label>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {REPARTICIONES.map(r=>(
                    <button key={r} style={{padding:'6px 10px',borderRadius:7,borderWidth:1,borderStyle:'solid',borderColor:ventaForm.reparticion===r?'#B45309':'#E2E8F0',background:ventaForm.reparticion===r?'#FFFBEB':'white',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',color:ventaForm.reparticion===r?'#B45309':'#374151'}}
                      onClick={()=>setVentaForm(f=>({...f,reparticion:r}))}>
                      {r.replace('MINISTERIO DE ','Min. ').replace('SERVICIO PENITENCIARIO BONAERENSE','SPB')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="fl">Monto</label>
                <select className="fs" value={ventaForm.monto||''} onChange={e=>setVentaForm(f=>({...f,monto:e.target.value}))}>
                  <option value="">— Seleccioná un monto —</option>
                  {Object.keys(TABLAS_CUOTA[parseInt(ventaForm.cuotas)||12]||TABLAS_CUOTA[12]).map(Number).sort((a,b)=>a-b).map(m=>(
                    <option key={m} value={m}>
                      {'$' + m.toLocaleString('es-AR') + (ventaForm.cuotas && TABLAS_CUOTA[parseInt(ventaForm.cuotas)]?.[m] ? ' → $' + TABLAS_CUOTA[parseInt(ventaForm.cuotas)][m].toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="fl">Cuotas</label>
                <div style={{display:'flex',gap:5}}>
                  {[6,12,18,24].map(n=>(
                    <button key={n} style={{flex:1,padding:'8px 4px',borderRadius:7,borderWidth:1,borderStyle:'solid',borderColor:parseInt(ventaForm.cuotas)===n?'#F59E0B':'#E2E8F0',background:parseInt(ventaForm.cuotas)===n?'#FFFBEB':'white',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Mono',monospace",color:parseInt(ventaForm.cuotas)===n?'#B45309':'#374151'}}
                      onClick={()=>setVentaForm(f=>({...f,cuotas:String(n)}))}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {calcCuota>0&&(
              <div style={{background:'#ECFDF5',border:'1px solid #BBF7D0',borderRadius:10,padding:'12px 16px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:11,color:'#065F46',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:2}}>Total por cuota</div>
                  <div style={{fontSize:26,fontWeight:700,color:'#065F46'}}>{fmtP(calcCuota)}</div>
                </div>
                <div style={{textAlign:'right',fontSize:12,color:'#047857'}}>
                  <div>{ventaForm.entidad} · {ventaForm.linea}</div>
                  <div>${parseInt(ventaForm.monto).toLocaleString('es-AR')} · {ventaForm.cuotas} cuotas</div>
                </div>
              </div>
            )}
            <div style={{marginBottom:12}}>
              <label className="fl">Notas (opcional)</label>
              <textarea className="ta" style={{minHeight:56}} value={ventaForm.notas} onChange={e=>setVentaForm(f=>({...f,notas:e.target.value}))}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button style={{flex:2,padding:'10px',background:'linear-gradient(135deg,#059669,#10B981)',color:'white',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:(!ventaForm.entidad||!ventaForm.linea||!ventaForm.reparticion||!ventaForm.monto||!ventaForm.cuotas)?0.4:1}}
                disabled={!ventaForm.entidad||!ventaForm.linea||!ventaForm.reparticion||!ventaForm.monto||!ventaForm.cuotas}
                onClick={()=>{ setVentaForm(f=>({...f,valor_cuota:String(calcCuota)})); setTimeout(guardarVenta,50) }}>
                💾 Guardar venta
              </button>
              <button className="btn" style={{flex:1}} onClick={()=>setShowVentaModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ══ MODAL: GESTIONAR CONSULTA ══ */}
      {showConsultaModal&&consultaSelected&&(
        <div className="movo" onClick={()=>setShowConsultaModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()} style={{width:560}}>
            <h3>📥 Gestionar consulta</h3>
            <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {[
                  ['Nombre',       consultaSelected.nombre_apellido],
                  ['DNI',          consultaSelected.dni],
                  ['Teléfono',     consultaSelected.phone],
                  ['Email',        consultaSelected.email],
                  ['Repartición',  consultaSelected.reparticion_label],
                  ['Flujo',        consultaSelected.flujo==='cobranzas'?'Cobranzas':'Solicitud'],
                  ['Prestación',   consultaSelected.prestacion||'—'],
                  ['Afiliado',     consultaSelected.afiliado?'Sí':'No'],
                  ['Fecha',        new Date(consultaSelected.created_at).toLocaleString('es-AR')],
                  ['Message ID',   consultaSelected.message_id||'—'],
                ].map(([l,v])=>(
                  <div key={l as string}>
                    <div style={{fontSize:10,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:2}}>{l}</div>
                    <div style={{fontSize:13,color:'#0F172A',fontWeight:500}}>{v as string}</div>
                  </div>
                ))}
              </div>
              {consultaSelected.consulta_texto&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #E2E8F0'}}>
                  <div style={{fontSize:10,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>Detalle consulta</div>
                  <div style={{fontSize:13,color:'#374151',lineHeight:1.6}}>{consultaSelected.consulta_texto}</div>
                </div>
              )}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label className="fl">Vendedor asignado</label>
                <select className="fs" value={consultaEdit.vendedor} onChange={e=>setConsultaEdit(f=>({...f,vendedor:e.target.value}))}>
                  <option value="">Sin asignar</option>
                  {USERS.map(u=><option key={u.id} value={u.username}>{u.username} — {u.role}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Estado</label>
                <select className="fs" value={consultaEdit.estado} onChange={e=>setConsultaEdit(f=>({...f,estado:e.target.value}))}>
                  <option value="pendiente">Pendiente</option>
                  <option value="contactado">Contactado</option>
                  {consultaSelected.flujo==='cobranzas' ? (<>
                    <option value="resuelto">Resuelto</option>
                    <option value="cerrado">No resuelto</option>
                  </>) : (<>
                    <option value="resuelto">Vendido</option>
                    <option value="cerrado_rechazado">Rechazado</option>
                    <option value="cerrado_no_interesado">No interesado</option>
                    <option value="cerrado">Sin respuesta</option>
                  </>)}
                </select>
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <label className="fl">Situación / Resolución</label>
              <textarea className="ta" placeholder="Describí qué pasó con esta consulta..." value={consultaEdit.situacion} onChange={e=>setConsultaEdit(f=>({...f,situacion:e.target.value}))}/>
            </div>
            <div style={{display:'flex',gap:8,paddingTop:14,borderTop:'1px solid #F1F5F9'}}>
              <button className="btn pri" style={{flex:1,justifyContent:'center'}} onClick={async()=>{
                // 1. Guardar consulta — INSERT o UPDATE según corresponda
                let resConsulta
                if(String(consultaSelected.id).startsWith('lead_')) {
                  resConsulta = await insertConsulta({
                    phone:            consultaSelected.phone,
                    nombre_apellido:  consultaSelected.nombre_apellido,
                    dni:              consultaSelected.dni,
                    reparticion_label:consultaSelected.reparticion_label,
                    flujo:            consultaSelected.flujo||'solicitud',
                    vendedor:         consultaEdit.vendedor,
                    situacion:        consultaEdit.situacion,
                    estado:           consultaEdit.estado,
                  })
                } else {
                  resConsulta = await updateConsulta(consultaSelected.id, {
                    vendedor:  consultaEdit.vendedor,
                    situacion: consultaEdit.situacion,
                    estado:    consultaEdit.estado,
                  })
                }
                if(!resConsulta.ok) {
                  alert('❌ No se pudo guardar la consulta. Intentá de nuevo.')
                  return
                }

                // 2. Sincronizar amat_loan_leads con el estado elegido
                if(consultaSelected.phone) {
                  const esCob = consultaSelected.flujo === 'cobranzas'
                  const nuevoStatus = consultaStatusToLeadStatus(consultaEdit.estado, consultaSelected.flujo || 'solicitud')
                  const esFinal = ESTADOS_FINALES.includes(nuevoStatus)

                  const { data: _ld } = await supabase.from('amat_loan_leads')
                    .select('id,archived,assigned_to,status')
                    .eq('phone_number', consultaSelected.phone)
                    .single()
                  const resLead = { ok: !!_ld, data: _ld }

                  if(resLead.ok && resLead.data) {
                    const existingLead = resLead.data as any
                    const updateData: any = {
                      status:      nuevoStatus,
                      updated_at:  new Date().toISOString(),
                    }
                    if(esFinal) {
                      updateData.archived = true
                    } else {
                      updateData.archived = false
                      if(consultaEdit.vendedor) updateData.assigned_to = consultaEdit.vendedor
                    }

                    const resUpdate = await (async () => {
                      const { error } = await supabase.from('amat_loan_leads').update(updateData).eq('id', existingLead.id)
                      return { ok: !error }
                    })()

                    if(resUpdate.ok) {
                      // UI solo después de confirmar todas las ops en DB
                      if(esFinal) {
                        setBotLeads(prev => prev.filter(l => l.id !== existingLead.id))
                        if(selectedPhone === consultaSelected.phone) setSelectedPhone(null)
                      } else if(consultaEdit.vendedor) {
                        setBotLeads(prev => {
                          const exists = prev.find(l=>l.id===existingLead.id)
                          if(exists) return prev.map(l=>l.id===existingLead.id?{...l,...updateData}:l)
                          supabase.from('amat_loan_leads').select('*').eq('id',existingLead.id).single()
                            .then(({data})=>{ if(data) setBotLeads(p=>p.find(x=>x.id===(data as any).id)?p:[data as any,...p]) })
                          return prev
                        })
                      }
                    } else {
                      console.warn('[gestionar] Consulta guardada pero lead no sincronizado:', consultaSelected.phone)
                    }
                  }
                }

                setShowConsultaModal(false)
                loadConsultas()
              }}>💾 Guardar</button>
              <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowConsultaModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: CAMPAÑA WHATSAPP ══ */}
      {showCampana&&(
        <CampanaModal onClose={()=>setShowCampana(false)}/>
      )}

      {/* ══ MODAL: IMPORTAR / EXPORTAR ══ */}
      {showImportExport&&(
        <ImportExport
          onClose={()=>setShowImportExport(false)}
          onImportDone={()=>{ loadBase(); setShowImportExport(false) }}
          currentFilters={{
            search: baseSearch,
            rep: baseRep,
            banco: baseBanco,
            status: baseStatus,
            tel: baseTel,
            assigned: baseAssigned,
            limit: '0',
          }}
        />
      )}
    </div>
  )
}
