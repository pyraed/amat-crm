'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import ImportExport from '@/components/ImportExport'
import CampanaModal from '@/components/CampanaModal'
import CalculadorOferta from '@/components/CalculadorOferta'
import LoginScreen from '@/components/LoginScreen'
import TopBar from '@/components/TopBar'
import TabReportes from '@/components/tabs/TabReportes'
import TabFormularios from '@/components/tabs/TabFormularios'
import {
  ModalCambiarEstado, ModalAsignar, ModalNota, ModalRechazar,
  ModalEditar, ModalPlantillas, ModalFinalizar, ModalVenta, ModalGestionarConsulta,
} from '@/components/modals/Modals'
import { supabase } from '@/lib/supabase'
import { LoanLead, Message } from '@/lib/types'
import { USERS } from '@/domain/entities/users'
import {
  LEAD_STATUS, COBRANZA_STATUS, ESTADOS_FINALES,
  getStatusMeta, getEstadosFinalesPorFlujo, getFlujoLabel,
} from '@/domain/entities/leadStatus'
import { REPARTICIONES, BANCOS, TEMPLATES } from '@/domain/entities/catalogs'
import { fetchFlujoMap } from '@/services/consulta.service'
import { fetchMensajesPhone } from '@/services/chat.service'
import { exportarVentas } from '@/services/export.service'
import { sincronizarEstados } from '@/services/consulta.service'
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
  const cargarMensajesInline = (phone: string) => {
    fetchMensajesPhone(phone).then(msgs => {
      setCurrentChatMsgs(msgs)
      setMessages(prev => [...prev.filter(m => m.phone_number !== phone), ...msgs])
    })
  }

  const bandeja = useBandeja(
    me, tab, messages, initialMessages,
    setSelectedPhone, setVistaMode,
    cargarMensajesInline,
  )

  // ── Base ──────────────────────────────────────────────────────────────────
  const base = useBase(tab, {
    setFlujoMap: bandeja.setFlujoMap,
    setBotLeads: bandeja.setBotLeads,
  })

  // ── Consultas ─────────────────────────────────────────────────────────────
  const consultas$ = useConsultas(tab, bandeja.flujoMap)

  // ── Reportes ──────────────────────────────────────────────────────────────
  const reportes = useReportes(tab, bandeja.setCerradosMesCount)

  // ── Realtime ──────────────────────────────────────────────────────────────
  // Debe ir después de consultas$ para poder pasar setConsultas
  const { meRef } = useRealtime(me, {
    setMessages,
    setCurrentChatMsgs,
    setBotLeads:        bandeja.setBotLeads,
    setColaLeadsState:  bandeja.setColaLeadsState,
    setColaTotal:       bandeja.setColaTotal,
    setFlujoMap:        bandeja.setFlujoMap,
    setConsultas:       consultas$.setConsultas,
    setBaseLeads:       base.setBaseLeads,
  }, {
    onCerradosMesChange: bandeja.setCerradosMesCount,
    onInboundMesChange:  bandeja.setInboundMesCount,
  })

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
    cerradosMesCount, setCerradosMesCount,
    inboundMesCount, setInboundMesCount,
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
    setBaseSearchDebounced, commitBaseSearch,
    baseRep, setBaseRep, baseBanco, setBaseBanco,
    baseStatus, setBaseStatus, baseTel, setBaseTel,
    baseAssigned, setBaseAssigned, baseFlujo, setBaseFlujo,
    baseOrdenCol, setBaseOrdenCol, baseOrdenDir, setBaseOrdenDir,
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
    reporteLeads, pipelineFlujoMap: reporteFlujoMap,
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
    fetchMensajesPhone(phone).then(msgs => {
      setCurrentChatMsgs(msgs)
      setMessages(prev => [...prev.filter(m => m.phone_number !== phone), ...msgs])
    })
  }

  const abrirChat = (lead: LoanLead) => {
    setCurrentChatMsgs([])
    setReplyText('')
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

  // Upsert de lead en botLeads tras autoasignación.
  // Si el lead ya existe en botLeads lo actualiza; si no, lo agrega.
  // Mismo patrón que tomarConversacion. Usado por sendReply y sendTemplate.
  const upsertLeadAsignado = (lead: LoanLead, username: string) => {
    bandeja.setBotLeads(prev => {
      const existe = prev.find(l => l.id === lead.id)
      if(existe) return prev.map(l => l.id === lead.id
        ? {...l, assigned_to: username, status: 'contacted'} : l)
      return [...prev, {...lead, assigned_to: username, status: 'contacted'}]
    })
    bandeja.setColaLeadsState(prev => prev.filter(l => l.id !== lead.id))
    bandeja.setColaTotal(t => Math.max(0, t - 1))
  }

  const sendReply = async () => {
    if(!replyText.trim() || !selectedPhone || !me) return
    const text = replyText
    setReplyText('')
    setSending(true)
    if(currentLead && !currentLead.assigned_to) {
      const { autoAsignarLead } = await import('@/services/lead.service')
      const res = await autoAsignarLead(currentLead.id, selectedPhone, me.username)
      if(res.ok) {
        upsertLeadAsignado(currentLead, me.username)
      } else if(res.tomadoPor) {
        alert(`Este lead ya fue tomado por ${res.tomadoPor}.`)
        setSending(false)
        return
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
        upsertLeadAsignado(currentLead, me.username)
      } else if(res.tomadoPor) {
        alert(`Este lead ya fue tomado por ${res.tomadoPor}.`)
        return
      }
    }
    setSending(true)
    const lead = bandeja.bandejaLeads.find(l=>l.phone_number===selectedPhone) || base.baseLeads.find(l=>l.phone_number===selectedPhone)
    const tplRes = await chatSendTemplate({ phone: selectedPhone, template, senderName: me.username, dni: lead?.dni })
    setSending(false)
    if(!tplRes.ok) {
      alert(`❌ No se pudo enviar la plantilla.\n\n${tplRes.error || 'Intentá de nuevo.'}`)
    }
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
    const notaFinal = lead.notes ? lead.notes + '\n' + note : note
    await bandeja.cambiarEstado(lead, 'rejected', { notes: notaFinal })
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
    // Capturamos el phone antes de que cambiarEstado limpie el estado
    const phone = currentLead.phone_number
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
    // Cerramos el modal y limpiamos el chat después de que cambiarEstado terminó
    setShowVentaModal(false)
    setVentaForm({entidad:'',linea:'',reparticion:'',monto:'',cuotas:'',valor_cuota:'',notas:''})
    if(phone) setSelectedPhone(null)
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  // useMemo evita buscar en los arrays en cada render del componente
  const currentLead = useMemo(() => {
    if(!selectedPhone) return undefined
    return allLeads.find(l=>l.phone_number===selectedPhone)
      || colaLeadsState.find(l=>l.phone_number===selectedPhone)
      || baseLeads.find(l=>l.phone_number===selectedPhone)
  }, [allLeads, colaLeadsState, baseLeads, selectedPhone])

  // currentMsgs: usa el cache local si está disponible para el phone activo,
  // sino filtra del array global. El useMemo evita recomputar en cada render.
  const currentMsgs = useMemo(() => {
    if(!selectedPhone) return []
    if(currentChatMsgs.length > 0 && currentChatMsgs[0]?.phone_number === selectedPhone) {
      return currentChatMsgs
    }
    return messages
      .filter(m=>m.phone_number===selectedPhone)
      .sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
  }, [currentChatMsgs, messages, selectedPhone])

  const stats = useMemo(()=>({
    // Leads creados este mes (global). Fuente: DB via re-fetch en Realtime INSERT.
    inbound: inboundMesCount,

    // Conversaciones asignadas al operador actual que no están en estado final.
    // Usa botLeads (no bandejaLeads) para no variar con el filtro de búsqueda activo.
    activos: botLeads.filter(l =>
      l.assigned_to === me?.username &&
      !ESTADOS_FINALES.includes(l.status || '')
    ).length,

    // Conversaciones del operador actual donde el último mensaje es del cliente.
    // Evalúa el último mensaje de cada phone, no el historial completo.
    pendientes: (() => {
      const misPhones = botLeads
        .filter(l =>
          l.assigned_to === me?.username &&
          !ESTADOS_FINALES.includes(l.status || '')
        )
        .map(l => l.phone_number)
        .filter(Boolean) as string[]

      return misPhones.filter(phone => {
        const ultimo = messages
          .filter(m => m.phone_number === phone)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        return ultimo?.direction === 'in'
      }).length
    })(),

    // closed + resolved este mes (global). Fuente: DB via re-fetch en Realtime UPDATE.
    cerrados: cerradosMesCount,
  }),[botLeads, me, messages, inboundMesCount, cerradosMesCount])

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

  if(!me) return (
    <LoginScreen
      userRef={userRef}
      loginUser={loginUser} setLoginUser={setLoginUser}
      loginPass={loginPass} setLoginPass={setLoginPass}
      loginErr={loginErr}
      showPass={showPass} setShowPass={setShowPass}
      locked={locked} countdown={countdown}
      rememberMe={rememberMe} handleRememberMe={handleRememberMe}
      handleLogin={handleLogin}
    />
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
      <TopBar
        me={me} tab={tab} setTab={setTab} setTabLoading={setTabLoading}
        stats={stats} handleLogout={handleLogout}
        onSync={me.role==='Administrador' ? async()=>{
          const resultado = await sincronizarEstados()
          if(resultado.error) alert(`❌ Error al sincronizar: ${resultado.error}`)
          else if(resultado.corregidos===0) alert('✅ Todo sincronizado.')
          else {
            alert(`✅ Se corrigieron ${resultado.corregidos} registros desincronizados.`)
            if(tab==='consultas') loadConsultas()
          }
        } : undefined}
      />



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
                    const n = colaLeadsState.length
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
                let leads = [...colaLeadsState]
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
                          // Vista previa: solo carga mensajes y abre el chat
                          // NO agrega el lead a botLeads ni toca la DB
                          // Si Nicolas escribe, sendReply lo auto-asignará en ese momento
                          setCurrentChatMsgs([])
                          setSelectedPhone(colaMenu.phone_number)
                          if(colaMenu.phone_number) cargarMensajes(colaMenu.phone_number)
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
                          const nuevos = (mas as LoanLead[]).filter(l=>!idsEnMemoria.has(l.id) && l.phone_number)
                          if(nuevos.length) {
                            // Filtrar solo los que tienen mensajes entrantes
                            const phones = nuevos.map(l=>l.phone_number).filter(Boolean) as string[]
                            const { data: msgsIn } = await supabase
                              .from('amat_messages').select('phone_number')
                              .in('phone_number', phones).eq('direction','in').limit(500)
                            const phonesConRespuesta = new Set((msgsIn||[]).map((m:any)=>m.phone_number))
                            const filtrados = nuevos.filter(l=>phonesConRespuesta.has(l.phone_number))
                            if(filtrados.length) setColaLeadsState(prev => [...prev, ...filtrados])
                          }
                        }
                        setColaPage(p => p + 50)
                      }} style={{padding:'8px 20px',borderRadius:8,border:'1px solid #FCD34D',background:'#FFFBEB',color:'#B45309',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                        Ver más ({Math.max(0, colaTotal - colaLeadsState.length).toLocaleString('es-AR')} sin mostrar)
                      </button>
                    </div>
                  )}
                </>)
              })()}

              {vistaMode==='mis_chats'&&(()=>{
                let leads = bandejaLeads.filter(l=>{
                  if(l.assigned_to!==me?.username||l.status==='finalizado') return false
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
                  const s=scFor(lead.status,lead.phone_number)
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

                {(()=>{
                  const ahora = Date.now()
                  const ultimoEntrante = currentMsgs
                    .filter(m=>m.direction==='in')
                    .sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]
                  // 22hs — margen de 2hs antes del límite real de Meta (24hs)
                  // para evitar enviar mensajes que Meta rechaza por ventana vencida
                  const VENTANA_HS = 22
                  const ventanaAbierta = ultimoEntrante
                    ? (ahora - new Date(ultimoEntrante.created_at).getTime()) < VENTANA_HS*60*60*1000
                    : false
                  const horasRestantes = ventanaAbierta && ultimoEntrante
                    ? Math.round((VENTANA_HS*60*60*1000 - (ahora - new Date(ultimoEntrante.created_at).getTime())) / (60*60*1000))
                    : null

                  return (
                    <div style={{padding:'12px 18px',background:'white',borderTop:'1px solid #E2E8F0',flexShrink:0}}>

                      {/* Aviso ventana cerrada */}
                      {!ventanaAbierta&&(
                        <div style={{background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:8,padding:'8px 12px',marginBottom:10,display:'flex',alignItems:'flex-start',gap:8}}>
                          <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
                          <div>
                            <div style={{fontSize:12,fontWeight:700,color:'#C2410C',marginBottom:2}}>
                              {ultimoEntrante ? 'Ventana de 22hs cerrada' : 'Sin mensajes entrantes'}
                            </div>
                            <div style={{fontSize:11,color:'#9A3412',lineHeight:1.5}}>
                              {ultimoEntrante
                                ? 'El cliente no escribió en las últimas 22hs. Los mensajes de texto libre no llegan. Usá una plantilla para retomar el contacto.'
                                : 'Este cliente nunca escribió. Para iniciar la conversación usá una plantilla de Meta.'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Aviso ventana por cerrarse pronto */}
                      {ventanaAbierta&&horasRestantes!==null&&horasRestantes<=6&&(
                        <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:8,padding:'6px 12px',marginBottom:8,fontSize:11,color:'#92400E',display:'flex',alignItems:'center',gap:6}}>
                          ⏱️ Ventana de 22hs: quedan <strong style={{marginLeft:3,marginRight:3}}>{horasRestantes}hs</strong> para responder libremente.
                        </div>
                      )}

                      {/* Plantillas — deshabilitadas hasta que Meta apruebe las plantillas del nuevo WABA */}
                      {/* Para reactivar: quitar disabled={true} y el title de cada botón */}
                      <div style={{display:'flex',gap:6,marginBottom:8}}>
                        <button disabled={true}
                          title="Plantilla pendiente de aprobación en Meta. Disponible próximamente."
                          style={{flex:1,padding:'7px 8px',borderRadius:7,fontSize:11,fontWeight:700,cursor:'not-allowed',fontFamily:'inherit',
                            border:'1px solid #E2E8F0',
                            background:'#F1F5F9',
                            color:'#94A3B8',
                            opacity:0.6,
                          }}>
                          👋 Primer contacto
                        </button>
                        <button disabled={true}
                          title="Plantilla pendiente de aprobación en Meta. Disponible próximamente."
                          style={{flex:1,padding:'7px 8px',borderRadius:7,fontSize:11,fontWeight:700,cursor:'not-allowed',fontFamily:'inherit',
                            border:'1px solid #E2E8F0',
                            background:'#F1F5F9',
                            color:'#94A3B8',
                            opacity:0.6,
                          }}>
                          🔄 Recontacto
                        </button>
                      </div>

                      {/* Input — deshabilitado si ventana cerrada */}
                      <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                        <textarea value={replyText} onChange={e=>setReplyText(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&ventanaAbierta){e.preventDefault();sendReply()}}}
                          disabled={!ventanaAbierta}
                          placeholder={ventanaAbierta
                            ? `Respondé como ${me.username}... (Enter envía, Shift+Enter nueva línea)`
                            : 'Ventana cerrada — usá una plantilla para contactar al cliente'}
                          style={{flex:1,border:`1px solid ${ventanaAbierta?'#E2E8F0':'#FED7AA'}`,borderRadius:10,padding:'10px 14px',
                            fontSize:13,resize:'none',fontFamily:'inherit',
                            color:ventanaAbierta?'#1E293B':'#9A3412',
                            background:ventanaAbierta?'#F8FAFC':'#FFF7ED',
                            opacity:ventanaAbierta?1:0.7,
                            cursor:ventanaAbierta?'text':'not-allowed',
                          }} rows={2}/>
                        <button onClick={sendReply} disabled={sending||!replyText.trim()||!ventanaAbierta}
                          className="btn pri" style={{padding:'10px 20px',fontSize:13,fontWeight:600,alignSelf:'stretch',opacity:ventanaAbierta?1:0.4}}>
                          {sending?'...':'↑ Enviar'}
                        </button>
                      </div>
                    </div>
                  )
                })()}
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
                onChange={e=>setBaseSearchDebounced(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') commitBaseSearch(baseSearchInput) }}
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
                  {baseLeads.map(lead=>{
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
                              onClick={async()=>{
                                if(lead.phone_number) cargarMensajes(lead.phone_number)
                                setVistaMode('mis_chats')
                                setTab('bandeja')
                                setSelectedPhone(lead.phone_number)
                                if(lead.assigned_to !== me?.username) {
                                  const esAdmin = me?.role === 'Administrador'
                                  const confirmar = !esAdmin || window.confirm('¿Querés tomar este caso y asignártelo?')
                                  if(confirmar && me) {
                                    await tomarConversacion({...lead, assigned_to: null})
                                  } else {
                                    setBotLeads(prev => prev.find(l=>l.id===lead.id) ? prev : [...prev, lead])
                                  }
                                } else {
                                  setBotLeads(prev => prev.find(l=>l.id===lead.id) ? prev : [...prev, lead])
                                }
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
                  setCSearch(e.target.value)
                }}
              />
            </div>
            <select className="fsel" value={cFlujo} onChange={e=>{
              const nuevoFlujo = e.target.value
              setCFlujo(nuevoFlujo)
              // Si el estado actual no aplica al nuevo flujo, resetearlo
              const soloVentas = ['vendido','rechazado','no_interesado','sin_respuesta']
              const soloCobranzas = ['resuelto_cob','no_resuelto_cob']
              if(nuevoFlujo === 'cobranzas' && soloVentas.includes(cEstado)) setCEstado('all')
              if(nuevoFlujo === 'solicitud' && soloCobranzas.includes(cEstado)) setCEstado('all')
            }}>
              <option value="all">Todos los flujos</option>
              <option value="solicitud">Solicitud</option>
              <option value="cobranzas">Cobranzas</option>
            </select>
            <select className="fsel" value={cEstado} onChange={e=>{ setCEstado(e.target.value) }}>
              <option value="all">Todos los estados</option>
              <option value="cola">🟡 Cola</option>
              <option value="pendiente">🔵 Pendiente</option>
              <option value="contactado">🔵 Contactado</option>
              {/* Opciones ventas — solo cuando el flujo no es cobranzas */}
              {cFlujo !== 'cobranzas' && (<>
                <option value="vendido">✅ Vendido</option>
                <option value="rechazado">❌ Rechazado</option>
                <option value="no_interesado">⚫ No interesado</option>
                <option value="sin_respuesta">⚫ Sin respuesta</option>
              </>)}
              {/* Opciones cobranzas — solo cuando el flujo no es solicitud */}
              {cFlujo !== 'solicitud' && (<>
                <option value="resuelto_cob">✅ Resuelto (cobranzas)</option>
                <option value="no_resuelto_cob">❌ No resuelto (cobranzas)</option>
              </>)}
            </select>
            <select className="fsel" value={cRep} onChange={e=>setCRep(e.target.value)}>
              <option value="all">Todas las reparticiones</option>
              {REPARTICIONES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>

            <select className="fsel" value={cOrden} onChange={e=>setCOrden(e.target.value as 'desc'|'asc')}>
              <option value="desc">📅 Más nuevas primero</option>
              <option value="asc">📅 Más viejas primero</option>
            </select>
            <button className="btn" onClick={()=>{
              setCSearch(''); setCSearchInput('')
              setCFlujo('all'); setCEstado('all')
              setCRep('all'); setCOrden('desc')
              // Forzar recarga con filtros limpios
              setTimeout(()=>loadConsultas('all','all','all',''), 50)
            }}>✕ Limpiar</button>
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
                              if(c.phone) {
                                const msgs = await fetchMensajesPhone(c.phone)
                                if(msgs.length) setMessages(prev=>[...prev.filter(m=>m.phone_number!==c.phone),...msgs])
                              }
                              const {data:lead} = await supabase.from('amat_loan_leads')
                                .select('*').eq('phone_number',c.phone).single()
                              if(lead) {
                                if(lead.assigned_to !== me?.username) {
                                  const esAdmin = me?.role === 'Administrador'
                                  const confirmar = !esAdmin || window.confirm('¿Querés tomar este caso y asignártelo?')
                                  if(confirmar && me) {
                                    await tomarConversacion({...lead, assigned_to: null})
                                  } else {
                                    setBotLeads(prev=>prev.find(l=>l.phone_number===c.phone)?prev:[lead as any,...prev])
                                  }
                                } else {
                                  setBotLeads(prev=>prev.find(l=>l.phone_number===c.phone)?prev:[lead as any,...prev])
                                }
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
      {/* ══ FORMULARIOS ══ */}
      {tab==='formularios'&&(
        <TabFormularios />
      )}

      {/* ══ REPORTES ══ */}
      {tab==='reportes'&&(
        <TabReportes
          reporteLeads={reporteLeads}
          pipelineFlujoMap={reporteFlujoMap}
          reporteMode={reporteMode}
          setReporteMode={setReporteMode}
          reportePeriodo={reportePeriodo}
          setReportePeriodo={setReportePeriodo}
          reporteDesde={reporteDesde}
          setReporteDesde={setReporteDesde}
          reporteHasta={reporteHasta}
          setReporteHasta={setReporteHasta}
          loadReportes={loadReportes}
        />
      )}

      {/* ══ MODALES ══ */}
      {showStatusModal&&currentLead&&(
        <ModalCambiarEstado
          currentLead={currentLead}
          flujoMap={flujoMap}
          updateStatus={updateStatus}
          setShowStatusModal={setShowStatusModal}
          setEditTarget={setEditTarget}
          setShowRejectModal={setShowRejectModal}
          setVentaForm={setVentaForm}
          setShowVentaModal={setShowVentaModal}
        />
      )}

      {showAssignModal&&currentLead&&(
        <ModalAsignar
          currentLead={currentLead}
          setBotLeads={setBotLeads}
          setShowAssignModal={setShowAssignModal}
        />
      )}

      {showNoteModal&&(
        <ModalNota
          noteText={noteText}
          setNoteText={setNoteText}
          saveNote={saveNote}
          setShowNoteModal={setShowNoteModal}
        />
      )}

      {showRejectModal&&editTarget&&(
        <ModalRechazar
          editTarget={editTarget}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          handleReject={handleReject}
          setShowRejectModal={setShowRejectModal}
        />
      )}

      {showEditModal&&editTarget&&(
        <ModalEditar
          editTarget={editTarget}
          editForm={editForm}
          setEditForm={setEditForm}
          editSaving={editSaving}
          saveEdit={saveEdit}
          setShowEditModal={setShowEditModal}
          isAdmin={me.role==='Administrador'}
        />
      )}

      {showTemplateModal&&editTarget&&(
        <ModalPlantillas
          editTarget={editTarget}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          templateVars={templateVars}
          setTemplateVars={setTemplateVars}
          applyTemplate={applyTemplate}
          updateStatus={updateStatus}
          setShowTemplateModal={setShowTemplateModal}
          operadorName={me.username}
        />
      )}

      {showFinalizarModal&&currentLead&&(
        <ModalFinalizar
          currentLead={currentLead}
          flujoMap={flujoMap}
          finalizarEstado={finalizarEstado}
          setFinalizarEstado={setFinalizarEstado}
          finalizarNota={finalizarNota}
          setFinalizarNota={setFinalizarNota}
          updateStatus={updateStatus}
          finalizarConversacion={finalizarConversacion}
          setShowFinalizarModal={setShowFinalizarModal}
        />
      )}

      {showVentaModal&&currentLead&&(
        <ModalVenta
          currentLead={currentLead}
          ventaForm={ventaForm}
          setVentaForm={setVentaForm}
          guardarVenta={guardarVenta}
          setShowVentaModal={setShowVentaModal}
        />
      )}

      {showConsultaModal&&consultaSelected&&(
        <ModalGestionarConsulta
          consultaSelected={consultaSelected}
          consultaEdit={consultaEdit}
          setConsultaEdit={setConsultaEdit}
          setShowConsultaModal={setShowConsultaModal}
          setBotLeads={setBotLeads}
          setSelectedPhone={setSelectedPhone}
          selectedPhone={selectedPhone}
          loadConsultas={loadConsultas}
        />
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
