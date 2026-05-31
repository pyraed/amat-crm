'use client'

import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart, RadialBarChart, RadialBar
} from 'recharts'
import ImportExport from '@/components/ImportExport'
import CampanaModal from '@/components/CampanaModal'
import CalculadorOferta from '@/components/CalculadorOferta'
import { supabase } from '@/lib/supabase'
import { LoanLead, Message } from '@/lib/types'

// ─────────────────────────────────────────────
//  USUARIOS
// ─────────────────────────────────────────────
type Role = 'Administrador' | 'Vendedor' | 'Cobranza'
type SysUser = { id:string; username:string; password:string; displayName:string; role:Role; initials:string; color:string }

const USERS: SysUser[] = [
  { id:'1', username:'AMAT1', password:'Amat2024#1', displayName:'Admin AMAT',    role:'Administrador', initials:'AD', color:'#B45309' },
  { id:'2', username:'AMAT2', password:'Amat2024#2', displayName:'Vendedor 1',    role:'Vendedor',      initials:'V1', color:'#D97706' },
  { id:'3', username:'AMAT3', password:'Amat2024#3', displayName:'Vendedor 2',    role:'Vendedor',      initials:'V2', color:'#F59E0B' },
  { id:'4', username:'AMAT4', password:'Amat2024#4', displayName:'Cobranzas 1',   role:'Cobranza',      initials:'C1', color:'#7C3AED' },
  { id:'5', username:'AMAT5', password:'Amat2024#5', displayName:'Cobranzas 2',   role:'Cobranza',      initials:'C2', color:'#6D28D9' },
]

// ─────────────────────────────────────────────
//  CONFIGURACIÓN DE ESTADOS Y ETIQUETAS
// ─────────────────────────────────────────────
const LEAD_STATUS: Record<string,{label:string;color:string;bg:string;text:string;desc:string}> = {
  new:           { label:'Nuevo',          color:'#94A3B8', bg:'#F8FAFC', text:'#475569', desc:'Sin contactar' },
  contacted:     { label:'Contactado',     color:'#06B6D4', bg:'#ECFEFF', text:'#164E63', desc:'Conversación iniciada' },
  not_interested:{ label:'No interesado',  color:'#6B7280', bg:'#F9FAFB', text:'#374151', desc:'No quiere ser contactado' },
  rejected:      { label:'Rechazado',      color:'#EF4444', bg:'#FEF2F2', text:'#991B1B', desc:'No cumple requisitos' },
  closed:        { label:'Cerrado',        color:'#10B981', bg:'#ECFDF5', text:'#065F46', desc:'Operación concretada' },
  finalizado:    { label:'Finalizado',     color:'#6B7280', bg:'#F3F4F6', text:'#374151', desc:'Conversación finalizada' },
}

// Estados exclusivos para flujo COBRANZA
const COBRANZA_STATUS: Record<string,{label:string;color:string;bg:string;text:string;desc:string}> = {
  new:       { label:'Nuevo',       color:'#94A3B8', bg:'#F8FAFC', text:'#475569', desc:'Sin contactar' },
  contacted: { label:'Contactado',  color:'#06B6D4', bg:'#ECFEFF', text:'#164E63', desc:'Conversación iniciada' },
  resolved:  { label:'Resuelto',    color:'#10B981', bg:'#ECFDF5', text:'#065F46', desc:'Caso resuelto exitosamente' },
  unresolved:{ label:'No resuelto', color:'#EF4444', bg:'#FEF2F2', text:'#991B1B', desc:'No se pudo resolver' },
  finalizado:{ label:'Finalizado',  color:'#6B7280', bg:'#F3F4F6', text:'#374151', desc:'Conversación finalizada' },
}

// Motivos de rechazo / no interés
const REJECTION_REASONS = [
  'No cumple requisitos',
  'No quiere ser contactado',
  'Número incorrecto / no existe',
  'Ya tiene préstamo activo',
  'Otro',
]

const REPARTICIONES = [
  'MINISTERIO DE SEGURIDAD',
  'MINISTERIO DE EDUCACION',
  'SERVICIO PENITENCIARIO BONAERENSE',
  'MINISTERIO DE SALUD',
]

const BANCOS = [
  'BANCO PROVINCIA','BANCO NACION','BANCO GALICIA',
  'BANCO SANTANDER','BANCO ICBC','BANCO MACRO','BANCO PATAGONIA','OTRO',
]

// Plantillas de mensaje (estructura lista para Meta)
const TEMPLATES = [
  {
    id:'ayuda_economica',
    name:'Ayuda Económica — Primer contacto',
    category:'MARKETING',
    body:`Hola {{nombre}} 👋 Te contactamos desde *AMAT* (Asociación Mutual Amarilla de Trabajadores).\n\nComo empleado/a de {{reparticion}}, podés acceder a una *Ayuda Económica* con descuento directo en tu recibo de sueldo.\n\n¿Te interesa que te contemos más? Respondé *SI* para continuar.`,
    variables:['nombre','reparticion'],
  },
  {
    id:'recontacto',
    name:'Recontacto — Sin respuesta previa',
    category:'MARKETING',
    body:`Hola {{nombre}}, te escribimos nuevamente desde *AMAT*.\n\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Es sin garante y con descuento por recibo. ¿Podemos ayudarte?`,
    variables:['nombre'],
  },
  {
    id:'info_general',
    name:'Información general',
    category:'UTILITY',
    body:`Hola {{nombre}} 👋 Desde *AMAT* te informamos que contamos con Ayudas Económicas para empleados públicos de la Provincia de Buenos Aires.\n\n✅ Sin garante\n✅ Descuento por recibo\n✅ Aprobación rápida\n\nEscribinos al *[número]* para más info.`,
    variables:['nombre'],
  },
]

const PAGE_SIZE = 50

type Props = { initialLeads: LoanLead[]; initialMessages: Message[] }
type Tab = 'bandeja' | 'consultas' | 'base' | 'pipeline' | 'reportes'

// ─────────────────────────────────────────────
//  MENSAJES DE EJEMPLO (simulados del bot)
// ─────────────────────────────────────────────
const BOT_CONVERSATIONS = [
  {
    phone:'5492214001001', name:'RODRIGUEZ CARLOS ALBERTO', dni:'28441902',
    reparticion:'MINISTERIO DE SEGURIDAD', bank:'BANCO PROVINCIA',
    status:'interested' as const,
    msgs:[
      {dir:'in',body:'Hola buenas tardes',time:-90},
      {dir:'out',body:'Hola! Soy Arturito el Asistente Virtual de Asociación Mutual Amarilla de Trabajadores. Ofrecemos Ayudas Economicas por recibo de sueldo y debito automatico a Empleados Publicos de la Provincia de Buenos Aires.\n\nEn que podemos ayudarte hoy?\n\n1- Solicitar una Ayuda Economica\n2- Informacion sobre descuentos en mi recibo y/o movimientos bancarios, estados de cuentas y cancelaciones',sender:'bot',time:-89},
      {dir:'in',body:'1',time:-88},
      {dir:'out',body:'Perfecto. Trabaja en alguna de las siguientes reparticiones?\n\n1- Ministerio de Seguridad\n2- Ministerio de Salud\n3- Ministerio de Educacion\n4- Servicio Penitenciario bonaerense\n5- Otra Repartición',sender:'bot',time:-87},
      {dir:'in',body:'1',time:-86},
      {dir:'out',body:'Perfecto. Ahora decime tu DNI (sin puntos).',sender:'bot',time:-85},
      {dir:'in',body:'28441902',time:-84},
      {dir:'out',body:'Gracias. Ahora pasame tu APELLIDO Y NOMBRE completo.',sender:'bot',time:-83},
      {dir:'in',body:'Rodriguez Carlos Alberto',time:-82},
      {dir:'out',body:'Perfecto. Ahora ingresa tu CORREO ELECTRONICO.',sender:'bot',time:-81},
      {dir:'in',body:'carlos.rodriguez@gmail.com',time:-80},
      {dir:'out',body:'Revisa tus datos antes de confirmar:\n\nSolicitud: Ayuda Economica\nReparticion: Ministerio de Seguridad\nDNI: 28441902\nNombre: Rodriguez Carlos Alberto\nEmail: carlos.rodriguez@gmail.com\n\nLos datos son correctos?\n1- Confirmar\n2- Cancelar',sender:'bot',time:-79},
      {dir:'in',body:'1',time:-78},
      {dir:'out',body:'Solicitud registrada exitosamente! En breve un asesor se pondra en contacto con vos. Muchas gracias!',sender:'bot',time:-77},
    ]
  },
  {
    phone:'5492214001002', name:'LOPEZ ANA MARIA', dni:'32115778',
    reparticion:'MINISTERIO DE SALUD', bank:'BANCO NACION',
    status:'evaluation' as const,
    msgs:[
      {dir:'in',body:'Buenas quiero info',time:-200},
      {dir:'out',body:'Hola! Soy Arturito el Asistente Virtual de AMAT...\n\n1- Solicitar una Ayuda Economica\n2- Informacion sobre descuentos',sender:'bot',time:-199},
      {dir:'in',body:'1',time:-198},
      {dir:'out',body:'Perfecto. ¿En qué repartición trabajás?',sender:'bot',time:-197},
      {dir:'in',body:'2',time:-196},
      {dir:'out',body:'Perfecto. Ahora decime tu DNI.',sender:'bot',time:-195},
      {dir:'in',body:'32115778',time:-194},
      {dir:'out',body:'Gracias. Tu APELLIDO Y NOMBRE completo.',sender:'bot',time:-193},
      {dir:'in',body:'Lopez Ana Maria',time:-192},
      {dir:'out',body:'Perfecto. Tu CORREO ELECTRONICO.',sender:'bot',time:-191},
      {dir:'in',body:'ana.lopez@hotmail.com',time:-190},
      {dir:'out',body:'Solicitud registrada! En breve un asesor te contactará. ¡Gracias!',sender:'bot',time:-189},
      {dir:'out',body:'Hola Ana, soy AMAT2. Vi tu solicitud. ¿Podemos hablar para avanzar con tu ayuda económica?',sender:'AMAT2',time:-60},
      {dir:'in',body:'Sí, disponible hoy a las 16hs',time:-58},
      {dir:'out',body:'Perfecto Ana, te llamo a las 16hs. Gracias!',sender:'AMAT2',time:-57},
    ]
  },
  {
    phone:'5492214001003', name:'FERNANDEZ MIGUEL', dni:'25882341',
    reparticion:'SERVICIO PENITENCIARIO BONAERENSE', bank:'BANCO GALICIA',
    status:'contacted' as const,
    msgs:[
      {dir:'in',body:'quiero sacar un prestamo',time:-300},
      {dir:'out',body:'Hola! Soy Arturito de AMAT. ¿En qué podemos ayudarte?\n\n1- Solicitar una Ayuda Economica\n2- Consultas sobre descuentos',sender:'bot',time:-299},
      {dir:'in',body:'1',time:-298},
      {dir:'out',body:'¿En qué repartición trabajás?',sender:'bot',time:-297},
      {dir:'in',body:'4',time:-296},
      {dir:'out',body:'Tu DNI sin puntos.',sender:'bot',time:-295},
      {dir:'in',body:'25882341',time:-294},
      {dir:'out',body:'Tu nombre completo.',sender:'bot',time:-293},
      {dir:'in',body:'Fernandez Miguel',time:-292},
      {dir:'out',body:'Tu email.',sender:'bot',time:-291},
      {dir:'in',body:'mfernandez@yahoo.com',time:-290},
      {dir:'out',body:'Solicitud registrada! En breve te contactamos.',sender:'bot',time:-289},
    ]
  },
  {
    phone:'5492214001004', name:'GARCIA SOFIA', dni:'35220145',
    reparticion:'IPS', bank:'BANCO PROVINCIA',
    status:'new' as const,
    msgs:[
      {dir:'in',body:'Buen día, quiero consultar sobre ayuda económica',time:-15},
      {dir:'out',body:'Hola! Soy Arturito de AMAT. ¿En qué podemos ayudarte?\n\n1- Solicitar una Ayuda Economica\n2- Consultas sobre descuentos',sender:'bot',time:-14},
      {dir:'in',body:'1',time:-13},
      {dir:'out',body:'¿En qué repartición trabajás?',sender:'bot',time:-12},
      {dir:'in',body:'5',time:-11},
    ]
  },
  {
    phone:'5492214001005', name:'GOMEZ PATRICIA', dni:'31098765',
    reparticion:'MINISTERIO DE EDUCACION', bank:'BANCO PROVINCIA',
    status:'contacted' as const,
    msgs:[
      {dir:'in',body:'Hola buen dia',time:-480},
      {dir:'out',body:'Hola! Soy Arturito de AMAT...',sender:'bot',time:-479},
      {dir:'in',body:'2',time:-478},
      {dir:'out',body:'Entendido. ¿En qué repartición trabajás?',sender:'bot',time:-477},
      {dir:'in',body:'3',time:-476},
      {dir:'out',body:'Tu DNI.',sender:'bot',time:-475},
      {dir:'in',body:'31098765',time:-474},
      {dir:'out',body:'Tu nombre.',sender:'bot',time:-473},
      {dir:'in',body:'Gomez Patricia',time:-472},
      {dir:'out',body:'Tu email.',sender:'bot',time:-471},
      {dir:'in',body:'pgomez@gmail.com',time:-470},
      {dir:'out',body:'Consulta: Descuentos / Estado de cuenta\nReparticion: Ministerio de Educacion\n...\n¿Los datos son correctos?\n1- Confirmar\n2- Cancelar',sender:'bot',time:-469},
      {dir:'in',body:'1',time:-468},
      {dir:'out',body:'Tu consulta fue registrada! En breve un asesor te contactará.',sender:'bot',time:-467},
    ]
  },
  {
    phone:'5492214001006', name:'SOSA ROBERTO', dni:'27330991',
    reparticion:'MINISTERIO DE SEGURIDAD', bank:'BANCO NACION',
    status:'interested' as const,
    msgs:[
      {dir:'in',body:'buenos dias',time:-720},
      {dir:'out',body:'Hola! Soy Arturito de AMAT...',sender:'bot',time:-719},
      {dir:'in',body:'1',time:-718},
      {dir:'out',body:'¿Repartición?',sender:'bot',time:-717},
      {dir:'in',body:'1',time:-716},
      {dir:'out',body:'Tu DNI.',sender:'bot',time:-715},
      {dir:'in',body:'27330991',time:-714},
      {dir:'out',body:'Tu nombre.',sender:'bot',time:-713},
      {dir:'in',body:'Sosa Roberto',time:-712},
      {dir:'out',body:'Tu email.',sender:'bot',time:-711},
      {dir:'in',body:'rsosa@gmail.com',time:-710},
      {dir:'out',body:'Solicitud registrada! En breve te contactamos.',sender:'bot',time:-709},
      {dir:'out',body:'Hola Roberto! Soy AMAT3. Recibí tu solicitud. ¿Cuánto necesitás y en cuántas cuotas pensabas pagarlo?',sender:'AMAT3',time:-300},
      {dir:'in',body:'Necesito unos 200 mil, en 24 cuotas si se puede',time:-295},
      {dir:'out',body:'Perfecto Roberto, lo proceso y te confirmo en breve.',sender:'AMAT3',time:-290},
    ]
  },
  {
    phone:'5492214001007', name:'TORRES LAURA', dni:'30441220',
    reparticion:'MINISTERIO DE EDUCACION', bank:'BANCO PROVINCIA',
    status:'closed' as const,
    msgs:[
      {dir:'in',body:'Hola, quiero la ayuda económica',time:-2880},
      {dir:'out',body:'Hola! Soy Arturito de AMAT...',sender:'bot',time:-2879},
      {dir:'in',body:'1',time:-2878},
      {dir:'out',body:'Solicitud registrada!',sender:'bot',time:-2800},
      {dir:'out',body:'Hola Laura, te llamo para confirmar los datos de tu ayuda económica.',sender:'AMAT2',time:-1440},
      {dir:'in',body:'Perfecto, ya firmé todo. Gracias!',time:-1438},
      {dir:'out',body:'Excelente Laura! Ya fue procesada. En 48hs tenés el dinero en tu cuenta. Cualquier consulta estamos acá 😊',sender:'AMAT2',time:-1436},
    ]
  },
  {
    phone:'5492214001008', name:'DIAZ FERNANDO', dni:'28765432',
    reparticion:'MINISTERIO DE SEGURIDAD', bank:'BANCO PROVINCIA',
    status:'no_answer' as const,
    msgs:[
      {dir:'in',body:'info prestamos',time:-4320},
      {dir:'out',body:'Hola! Soy Arturito de AMAT...',sender:'bot',time:-4319},
      {dir:'in',body:'1',time:-4318},
      {dir:'out',body:'Solicitud registrada!',sender:'bot',time:-4200},
      {dir:'out',body:'Hola Fernando, te contacto de AMAT por tu solicitud.',sender:'AMAT2',time:-2880},
      {dir:'out',body:'Fernando, te llamo nuevamente. Avisame cuando puedas hablar.',sender:'AMAT2',time:-1440},
      {dir:'out',body:'Fernando, último intento de contacto. Si necesitás la ayuda económica escribinos.',sender:'AMAT2',time:-720},
    ]
  },
  {
    phone:'5492214001009', name:'HERRERA MARCELO', dni:'26543210',
    reparticion:'IPS', bank:'BANCO NACION',
    status:'new' as const,
    msgs:[
      {dir:'in',body:'Necesito info de préstamos',time:-5},
      {dir:'out',body:'Hola! Soy Arturito de AMAT. ¿En qué podemos ayudarte?',sender:'bot',time:-4},
    ]
  },
  {
    phone:'5492214001010', name:'ROMERO CLAUDIA', dni:'34321098',
    reparticion:'MINISTERIO DE SALUD', bank:'BANCO NACION',
    status:'evaluation' as const,
    msgs:[
      {dir:'in',body:'buenos dias quiero el prestamo',time:-1440},
      {dir:'out',body:'Solicitud registrada!',sender:'bot',time:-1430},
      {dir:'out',body:'Hola Claudia! Estoy revisando tu solicitud. ¿Podés mandarme una foto de tu último recibo de sueldo?',sender:'AMAT3',time:-720},
      {dir:'in',body:'Sí ahora te mando',time:-718},
      {dir:'out',body:'Perfecto, lo reviso y te confirmo en el día.',sender:'AMAT3',time:-717},
      {dir:'in',body:'Ya lo mandé por acá, lo recibiste?',time:-360},
      {dir:'out',body:'Sí Claudia, lo recibí. Estamos procesando tu solicitud.',sender:'AMAT3',time:-358},
    ]
  },
]

// ── Grilla AMAT para calcular valor de cuota ──────────────
const TABLAS_CUOTA: Record<number, Record<number,number>> = {
  6:  {100000:20833.58,110000:22916.94,150000:31250.37,200000:41667.16,250000:52083.95,300000:62500.74,350000:72917.53,400000:83334.32,450000:93751.11,500000:104167.9},
  12: {50000:6090.01,100000:12180.02,150000:18270.03,200000:24360.04,250000:30450.05,300000:36540.06,350000:42630.07,400000:48720.08,450000:54810.09,500000:60900.1,600000:73080.12,700000:85260.14,800000:97440.16,900000:109620.18,1000000:121800.2,1200000:146160.24,1500000:182700.3},
  18: {50000:4701.65,100000:9403.3,150000:14104.95,200000:18809.3,250000:23511.63,300000:28213.96,350000:32916.28,400000:37618.61,450000:42320.94,500000:47023.26,600000:56427.91,700000:65832.57,800000:75237.22,900000:84641.88,1000000:94046.53,1200000:112855.84,1500000:141069.8},
  24: {50000:4047.14,100000:8094.27,150000:12141.41,200000:16188.54,250000:20235.68,300000:24282.82,350000:28329.95,400000:32377.09,450000:36424.23,500000:40471.36,600000:48565.63,700000:56659.9,800000:64754.18,900000:72848.45,1000000:80942.72,1200000:97131.27,1500000:121414.08},
}

function calcularCuotaAMAT(entidad: string, linea: string, reparticion: string, monto: number, cuotas: number): number {
  const vc = TABLAS_CUOTA[cuotas]?.[monto] || 0
  if(linea === 'Ayuda') {
    if(reparticion.includes('EDUCACION')) return 28996
    if(reparticion.includes('SALUD')) return 15464
    return vc
  }
  const memb: Record<string,number> = {
    'MINISTERIO DE SEGURIDAD': 4300, 'SERVICIO PENITENCIARIO BONAERENSE': 4300,
    'MINISTERIO DE EDUCACION': 9900, 'MINISTERIO DE SALUD': 5172,
  }
  const cs = memb[reparticion] || 4300
  const med = monto<=200000?3850:monto<=300000?6150:monto<=400000?8150:monto<=600000?11850:14850
  return vc + cs + med
}

const MONTOS_DISP = [50000,100000,150000,200000,250000,300000,350000,400000,450000,500000,600000,700000,800000,900000,1000000,1200000,1500000]

export default function BandejaClient({ initialLeads, initialMessages }: Props) {
  // AUTH
  const [me, setMe]                       = useState<SysUser|null>(null)
  const [loginUser, setLoginUser]         = useState('')
  const [loginPass, setLoginPass]         = useState('')
  const [loginErr, setLoginErr]           = useState('')
  const [showPass, setShowPass]           = useState(false)
  const [attempts, setAttempts]           = useState(0)
  const [locked, setLocked]               = useState(false)
  const [countdown, setCountdown]         = useState(0)
  const [showCreds, setShowCreds]         = useState(false)

  // DATA — consultas (llegadas del bot)
  const [consultas, setConsultas]           = useState<any[]>([])
  const [consultasLoading, setConsultasLoading] = useState(false)
  const [consultaSelected, setConsultaSelected] = useState<any|null>(null)
  const [showConsultaModal, setShowConsultaModal] = useState(false)
  const [consultaEdit, setConsultaEdit]     = useState<any>({})

  // Filtros consultas
  const [cFlujo, setCFlujo]     = useState('all')
  const [cEstado, setCEstado]   = useState('all')
  const [cRep, setCRep]         = useState('all')
  const [cSearch, setCSearch]   = useState('')
  const [cSearchInput, setCSearchInput] = useState('')

  // DATA — bandeja (solo leads que tienen conversación activa con el bot)
  const [botLeads, setBotLeads]           = useState<LoanLead[]>([])
  const [messages, setMessages]           = useState<Message[]>(initialMessages)

  // DATA — base de contactos (server-side paginado)
  const [baseLeads, setBaseLeads]         = useState<LoanLead[]>([])
  const [baseTotal, setBaseTotal]         = useState(0)
  const [baseLoading, setBaseLoading]     = useState(false)

  // UI
  const [tab, setTab]                     = useState<Tab>('bandeja')
  const [selectedPhone, setSelectedPhone] = useState<string|null>(null)
  const [replyText, setReplyText]         = useState('')
  const [sending, setSending]             = useState(false)

  // Filtros bandeja
  const [bandejaSearch, setBandejaSearch] = useState('')
  const [bandejaStatus, setBandejaStatus] = useState('all')
  const [vistaMode, setVistaMode]         = useState<'cola'|'mis_chats'>('cola')
  // Mapa phone → flujo (solicitud|cobranzas) cargado de amat_consultas
  const [flujoMap, setFlujoMap]           = useState<Record<string,string>>({})
  const [cola, setCola]                   = useState<LoanLead[]>([])
  const [showFinalizarModal, setShowFinalizarModal] = useState(false)
  const [finalizarEstado, setFinalizarEstado]       = useState('')
  const [finalizarNota, setFinalizarNota]           = useState('')
  const [pipelineMode, setPipelineMode]             = useState<'ventas'|'cobranzas'>('ventas')
  const [showVentaModal, setShowVentaModal]         = useState(false)
  const [ventaForm, setVentaForm]         = useState<any>({entidad:'',linea:'',reparticion:'',monto:'',cuotas:'',valor_cuota:'',notas:''})

  // Filtros base
  const [basePage, setBasePage]           = useState(0)
  const [baseSearch, setBaseSearch]       = useState('')
  const [baseSearchInput, setBaseSearchInput] = useState('')
  const [baseRep, setBaseRep]             = useState('all')
  const [baseBanco, setBaseBanco]         = useState('all')
  const [baseStatus, setBaseStatus]       = useState('all')
  const [baseTel, setBaseTel]             = useState<'all'|'con'|'sin'>('all')
  const [baseAssigned, setBaseAssigned]   = useState('all')

  // Modales
  const [showStatusModal, setShowStatusModal]     = useState(false)
  const [showAssignModal, setShowAssignModal]     = useState(false)
  const [showNoteModal, setShowNoteModal]         = useState(false)
  const [showEditModal, setShowEditModal]         = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showImportExport, setShowImportExport]   = useState(false)
  const [showCampana, setShowCampana]             = useState(false)
  const [showCalculador, setShowCalculador]       = useState(false)
  const [showRejectModal, setShowRejectModal]     = useState(false)
  const [editTarget, setEditTarget]               = useState<LoanLead|null>(null)
  const [editForm, setEditForm]                   = useState<Partial<LoanLead>>({})
  const [editSaving, setEditSaving]               = useState(false)
  const [noteText, setNoteText]                   = useState('')
  const [rejectReason, setRejectReason]           = useState('')
  const [selectedTemplate, setSelectedTemplate]   = useState<typeof TEMPLATES[0]|null>(null)
  const [templateVars, setTemplateVars]           = useState<Record<string,string>>({})

  const msgEndRef  = useRef<HTMLDivElement>(null)
  const userRef    = useRef<HTMLInputElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(()=>{ setMounted(true) },[])
  useEffect(()=>{ msgEndRef.current?.scrollIntoView({behavior:'smooth'}) },[messages,selectedPhone])
  useEffect(()=>{ if(!me) setTimeout(()=>userRef.current?.focus(),100) },[me])

  // Bloqueo
  useEffect(()=>{
    if(countdown<=0) return
    const t=setTimeout(()=>{ setCountdown(c=>c-1); if(countdown===1){setLocked(false);setAttempts(0)} },1000)
    return ()=>clearTimeout(t)
  },[countdown])

  // Realtime mensajes
  useEffect(()=>{
    const ch=supabase.channel('rt-msgs')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'amat_messages'},p=>{
        const msg = p.new as Message
        setMessages(prev=>prev.find(m=>m.id===msg.id)?prev:[...prev,msg])
        // Si el lead no está en la bandeja, cargarlo
        setBotLeads(prev=>{
          if(!prev.find(l=>l.phone_number===msg.phone_number)){
            supabase.from('amat_loan_leads').select('*').eq('phone_number',msg.phone_number).single()
              .then(({data})=>{ if(data) setBotLeads(p2=>[data as LoanLead,...p2]) })
          }
          return prev
        })
      }).subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[])

  // Realtime leads
  useEffect(()=>{
    const ch=supabase.channel('rt-leads')
      .on('postgres_changes',{event:'*',schema:'public',table:'amat_loan_leads'},p=>{
        const updated = p.new as LoanLead
        if(p.eventType==='UPDATE'){
          setBotLeads(prev=>prev.map(l=>l.id===updated.id?updated:l))
          setBaseLeads(prev=>prev.map(l=>l.id===updated.id?updated:l))
        } else if(p.eventType==='INSERT'){
          setBotLeads(prev=>[updated,...prev])
        }
      }).subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[])

  // Realtime consultas
  useEffect(()=>{
    const ch=supabase.channel('rt-consultas')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'amat_consultas'},p=>{
        setConsultas(prev=>[p.new as any,...prev])
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'amat_consultas'},p=>{
        setConsultas(prev=>prev.map(c=>c.id===(p.new as any).id?p.new as any:c))
      })
      .subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[])

  // Cargar leads de la bandeja (solo los que tienen mensajes)
  useEffect(()=>{
    const phones=[...new Set(initialMessages.map(m=>m.phone_number))]
    if(phones.length===0){ setBotLeads([]); return }
    supabase.from('amat_loan_leads')
      .select('*')
      .in('phone_number', phones.slice(0,500))
      .not('status', 'in', '("finalizado","rejected","not_interested","resolved","unresolved")')
      .then(({data})=>{ if(data) setBotLeads(data as LoanLead[]) })
    // Cargar flujos de consultas para saber si cada phone es ventas o cobranzas
    supabase.from('amat_consultas')
      .select('phone,flujo')
      .in('phone', phones.slice(0,500))
      .then(({data})=>{
        if(data){
          const map: Record<string,string> = {}
          data.forEach((r:any)=>{ if(r.phone) map[r.phone]=r.flujo||'solicitud' })
          setFlujoMap(map)
        }
      })
  },[initialMessages])

  // Cargar cola según rol del usuario logueado
  const loadCola = (user: typeof me, leads: LoanLead[]) => {
    if(!user) return
    // Sin asignar = cola disponible
    let disponibles = leads.filter(l => !l.assigned_to && l.status !== 'finalizado')
    // Filtrar por rol
    if(user.role === 'Vendedor') {
      // Solo flujo solicitud — filtramos por consultas con flujo=solicitud
      // Como no tenemos flujo en loan_leads, mostramos todos los sin asignar al Vendedor
      // Los de cobranzas los filtra el sistema de consultas
      disponibles = disponibles
    } else if(user.role === 'Cobranza') {
      disponibles = disponibles
    }
    // Admin ve todo
    setCola(disponibles)
  }

  // ─────────────────────────────────────────────
  //  CARGAR CONSULTAS desde amat_consultas
  // ─────────────────────────────────────────────

  // Refs para siempre leer valores frescos (mismo patrón que loadBase)
  const cSearchRef = useRef(cSearch)
  const cFlujoRef  = useRef(cFlujo)
  const cEstadoRef = useRef(cEstado)
  const cRepRef    = useRef(cRep)

  useEffect(()=>{ cSearchRef.current = cSearch },[cSearch])
  useEffect(()=>{ cFlujoRef.current  = cFlujo  },[cFlujo])
  useEffect(()=>{ cEstadoRef.current = cEstado },[cEstado])
  useEffect(()=>{ cRepRef.current    = cRep    },[cRep])

  const loadConsultas = async () => {
    setConsultasLoading(true)
    const search = cSearchRef.current
    const flujo  = cFlujoRef.current
    const estado = cEstadoRef.current
    const rep    = cRepRef.current

    let q = supabase.from('amat_consultas').select('*').order('created_at', { ascending: false })
    if (search)          q = q.or(`nombre_apellido.ilike.%${search}%,dni.ilike.%${search}%,phone.ilike.%${search}%`)
    if (flujo !== 'all')  q = q.eq('flujo', flujo)
    if (estado !== 'all') q = q.eq('estado', estado)
    if (rep !== 'all')    q = q.eq('reparticion_label', rep)
    const { data, error } = await q
    if (error) console.error('[CONSULTAS] Error Supabase:', error)
    setConsultas((data as any[]) || [])
    setConsultasLoading(false)
  }

  // Cargar consultas al entrar al tab
  useEffect(()=>{
    if(tab==='consultas'){
      console.log('[CONSULTAS] Ejecutando loadConsultas, tab cambió a consultas')
      loadConsultas()
    }
  },[tab]) // eslint-disable-line

  // Recargar cuando cambian filtros (solo si estamos en consultas)
  useEffect(()=>{
    if(tab==='consultas') loadConsultas()
  },[cSearch, cFlujo, cEstado, cRep]) // eslint-disable-line

  // Cargar base paginada — usando refs para siempre tener valores frescos
  const baseSearchRef   = useRef(baseSearch)
  const baseRepRef      = useRef(baseRep)
  const baseBancoRef    = useRef(baseBanco)
  const baseStatusRef   = useRef(baseStatus)
  const baseTelRef      = useRef(baseTel)
  const baseAssignedRef = useRef(baseAssigned)
  const basePageRef     = useRef(basePage)

  useEffect(()=>{ baseSearchRef.current   = baseSearch   },[baseSearch])
  useEffect(()=>{ baseRepRef.current      = baseRep      },[baseRep])
  useEffect(()=>{ baseBancoRef.current    = baseBanco    },[baseBanco])
  useEffect(()=>{ baseStatusRef.current   = baseStatus   },[baseStatus])
  useEffect(()=>{ baseTelRef.current      = baseTel      },[baseTel])
  useEffect(()=>{ baseAssignedRef.current = baseAssigned },[baseAssigned])
  useEffect(()=>{ basePageRef.current     = basePage     },[basePage])

  const loadBase = async()=>{
    setBaseLoading(true)
    const search   = baseSearchRef.current
    const rep      = baseRepRef.current
    const banco    = baseBancoRef.current
    const status   = baseStatusRef.current
    const tel      = baseTelRef.current
    const assigned = baseAssignedRef.current
    const page     = basePageRef.current

    let q=supabase.from('amat_loan_leads').select('*',{count:'exact'})
    if(search)           q=q.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%,phone_number.ilike.%${search}%`)
    if(rep!=='all')      q=q.eq('reparticion',rep)
    if(banco!=='all')    q=q.eq('bank',banco)
    if(status!=='all')   q=q.eq('status',status)
    if(tel==='con')      q=q.not('phone_number','is',null)
    if(tel==='sin')      q=q.is('phone_number',null)
    if(assigned==='sin') q=q.is('assigned_to',null)
    else if(assigned!=='all') q=q.eq('assigned_to',assigned)
    q=q.order('full_name',{ascending:true}).range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1)
    const {data,count,error}=await q
    console.log('[BASE] data:', data?.length, 'count:', count, 'error:', error)
    if(error) console.error('[BASE] Error Supabase:', error)
    setBaseLeads((data as LoanLead[])||[])
    setBaseTotal(count||0)
    setBaseLoading(false)
  }

  // Log cuando se ejecuta loadBase
  useEffect(()=>{
    if(tab==='base'){
      console.log('[BASE] Ejecutando loadBase, tab cambió a base')
      loadBase()
    }
  },[tab]) // eslint-disable-line

  // Recargar cuando cambian filtros o página (solo si estamos en base)
  useEffect(()=>{ if(tab==='base') loadBase() },[baseSearch,baseRep,baseBanco,baseStatus,baseTel,baseAssigned,basePage]) // eslint-disable-line
  
  // Recargar bandeja cuando se cambia a esa pestaña
  useEffect(()=>{
    if(tab==='bandeja'){
      supabase.from('amat_messages').select('*').order('created_at',{ascending:false}).limit(500)
        .then(({data})=>{
          if(data) setMessages(data as Message[])
        })
    }
  },[tab]) // eslint-disable-line

  // ── AUTH ──────────────────────────────────
  const handleLogin=()=>{
    if(locked) return
    const u=USERS.find(u=>u.username===loginUser.trim().toUpperCase()&&u.password===loginPass)
    if(u){ setMe(u); setLoginErr(''); setAttempts(0) }
    else{
      const a=attempts+1; setAttempts(a)
      if(a>=5){ setLocked(true); setCountdown(30); setLoginErr('Demasiados intentos. Bloqueado 30s.') }
      else setLoginErr(`Incorrecto. Intentos restantes: ${5-a}`)
    }
  }

  // ── ACCIONES ──────────────────────────────
  const sendReply=async()=>{
    if(!replyText.trim()||!selectedPhone||!me) return
    setSending(true)
    await fetch('/api/send-message',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({phone:selectedPhone,text:replyText,senderName:me.username})
    })
    setReplyText(''); setSending(false)
  }

  const updateStatus=async(id:number,status:string,notes?:string)=>{
    const upd:any={status,updated_at:new Date().toISOString()}
    if(notes!==undefined) upd.notes=notes
    await supabase.from('amat_loan_leads').update(upd).eq('id',id)
    // Sincronizar estado en amat_consultas también
    const lead = bandejaLeads.find(l=>l.id===id)||baseLeads.find(l=>l.id===id)
    if(lead?.phone_number) {
      await supabase.from('amat_consultas')
        .update({estado: status==='closed'?'resuelto':status==='rejected'?'cerrado':status==='finalizado'?'cerrado':status==='contacted'?'en_proceso':'pendiente', updated_at:new Date().toISOString()})
        .eq('phone', lead.phone_number)
    }
  }

  // Tomar una conversación de la cola — auto contactado
  const tomarConversacion = async (lead: LoanLead) => {
    if(!me) return
    await supabase.from('amat_loan_leads')
      .update({assigned_to: me.username, status:'contacted', updated_at:new Date().toISOString()})
      .eq('id', lead.id)
    if(lead.phone_number) {
      await supabase.from('amat_consultas')
        .update({vendedor: me.username, estado:'en_proceso', updated_at:new Date().toISOString()})
        .eq('phone', lead.phone_number)
    }
    setSelectedPhone(lead.phone_number)
    setVistaMode('mis_chats')
  }

  // Al seleccionar un chat en Mis chats → auto contactado si estaba nuevo
  const abrirChat = async (lead: LoanLead) => {
    setSelectedPhone(lead.phone_number)
    if(lead.status === 'new') {
      await supabase.from('amat_loan_leads')
        .update({status:'contacted', updated_at:new Date().toISOString()})
        .eq('id', lead.id)
    }
  }

  // Finalizar conversación — elimina de bandeja + guarda situacion en consultas
  const finalizarConversacion = async (nota?: string) => {
    if(!currentLead) return
    const estadosFinales = ['not_interested','rejected','closed','resolved','unresolved']
    if(!estadosFinales.includes(currentLead.status||'')) {
      await updateStatus(currentLead.id, 'finalizado')
    }
    // Eliminar de botLeads para que desaparezca de la bandeja
    setBotLeads(prev => prev.filter(l => l.id !== currentLead.id))
    setSelectedPhone(null)
    setShowFinalizarModal(false)
    setFinalizarEstado('')
    setFinalizarNota('')
    if(currentLead.phone_number) {
      const upd: any = { estado:'cerrado', updated_at: new Date().toISOString() }
      if(nota?.trim()) upd.situacion = nota.trim()
      await supabase.from('amat_consultas').update(upd).eq('phone', currentLead.phone_number)
    }
  }

  // Guardar cierre de venta
  const guardarVenta = async () => {
    if(!currentLead||!me) return
    const venta = {
      ...ventaForm,
      status:'closed',
      updated_at:new Date().toISOString(),
      notes: `VENTA CERRADA - Entidad:${ventaForm.entidad} Línea:${ventaForm.linea} Repartición:${ventaForm.reparticion} Monto:$${ventaForm.monto} Cuotas:${ventaForm.cuotas} Valor cuota:$${ventaForm.valor_cuota}${ventaForm.notas?' Notas:'+ventaForm.notas:''}`
    }
    await supabase.from('amat_loan_leads').update(venta).eq('id',currentLead.id)
    await supabase.from('amat_consultas')
      .update({estado:'resuelto', situacion:`Venta cerrada - ${ventaForm.entidad} ${ventaForm.linea} $${ventaForm.monto} en ${ventaForm.cuotas} cuotas`, updated_at:new Date().toISOString()})
      .eq('phone', currentLead.phone_number||'')
    // Actualizar botLeads en memoria para que currentLead refleje el nuevo status
    setBotLeads(prev => prev.map(l => l.id===currentLead.id ? {...l, ...venta, status:'closed'} : l))
    setShowVentaModal(false)
    setVentaForm({entidad:'',linea:'',reparticion:'',monto:'',cuotas:'',valor_cuota:'',notas:''})
    // NO cerramos el chat — el operador debe presionar Finalizar explícitamente
  }

  const openEdit=(lead:LoanLead)=>{
    setEditTarget(lead)
    setEditForm({full_name:lead.full_name,dni:lead.dni,phone_number:lead.phone_number,reparticion:lead.reparticion,bank:lead.bank,amount:lead.amount,installments:lead.installments,status:lead.status,assigned_to:lead.assigned_to,notes:lead.notes})
    setShowEditModal(true)
  }

  const saveEdit=async()=>{
    if(!editTarget) return
    setEditSaving(true)
    const upd = {
      ...editForm,
      full_name:    editForm.full_name?.toUpperCase()||editForm.full_name,
      reparticion:  editForm.reparticion?.toUpperCase()||editForm.reparticion,
      bank:         editForm.bank?.toUpperCase()||editForm.bank,
      updated_at:   new Date().toISOString()
    }
    await supabase.from('amat_loan_leads').update(upd).eq('id',editTarget.id)
    setEditSaving(false); setShowEditModal(false); setEditTarget(null)
    if(tab==='base') loadBase()
  }

  const saveNote=async()=>{
    const lead=currentLead||editTarget
    if(!lead) return
    await supabase.from('amat_loan_leads').update({notes:noteText,updated_at:new Date().toISOString()}).eq('id',lead.id)
    setShowNoteModal(false)
  }

  const handleReject=async()=>{
    const lead=currentLead||editTarget
    if(!lead||!rejectReason) return
    const note=`Rechazado: ${rejectReason}`
    await updateStatus(lead.id,'rejected',lead.notes?lead.notes+'\n'+note:note)
    setShowRejectModal(false); setRejectReason('')
  }

  // Exportar ventas cerradas con todos los datos
  const exportVentas = async () => {
    const {data} = await supabase.from('amat_loan_leads')
      .select('*').eq('status','closed').order('updated_at',{ascending:false})
    if(!data||data.length===0){ alert('No hay ventas cerradas para exportar'); return }
    const XLSX = await import('xlsx')
    const rows = data.map((l:any)=>{
      const nota = l.notes||''
      // Parsear campos del formato "VENTA CERRADA - Entidad:X Línea:Y Repartición:Z Monto:$N Cuotas:N Valor cuota:$N"
      const getField = (key:string) => {
        const pattern = new RegExp(key + ':([^\s][^A-Z\n]*?)(?=\s+[A-ZÁÉÍÓÚ][a-záéíóúñ]+:|$)')
        const m = nota.match(pattern)
        return m ? m[1].replace(/\$/g,'').trim() : ''
      }
      return {
        'DNI':           l.dni||'',
        'Nombre':        l.full_name||'',
        'Teléfono':      l.phone_number||'',
        'Email':         l.email||'',
        'Repartición':   l.reparticion||getField('Repartición'),
        'Entidad':       getField('Entidad'),
        'Línea':         getField('Línea'),
        'Monto ($)':     getField('Monto'),
        'Cuotas':        getField('Cuotas'),
        'Valor cuota ($)': getField('Valor cuota'),
        'Asignado a':    l.assigned_to||'',
        'Fecha cierre':  new Date(l.updated_at).toLocaleDateString('es-AR'),
        'Notas raw':     nota,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Ventas')
    XLSX.writeFile(wb, 'AMAT_ventas_' + new Date().toISOString().slice(0,10) + '.xlsx')
  }

  const openTemplate=(lead:LoanLead)=>{
    setEditTarget(lead)
    setSelectedTemplate(null)
    setTemplateVars({})
    setShowTemplateModal(true)
  }

  const applyTemplate=(tpl:typeof TEMPLATES[0],lead:LoanLead)=>{
    setSelectedTemplate(tpl)
    const vars:Record<string,string>={}
    tpl.variables.forEach(v=>{
      if(v==='nombre') vars[v]=(lead.full_name||'').split(' ')[0]||''
      if(v==='reparticion') vars[v]=lead.reparticion||''
    })
    setTemplateVars(vars)
  }

  // ── DATOS DERIVADOS ───────────────────────
  const allLeads=[...botLeads]

  // Bandeja: solo leads con conversación (mensajes)
  const phonesConMensajes=[...new Set(messages.map(m=>m.phone_number))]
  const ESTADOS_FINALES_BANDEJA = ['finalizado','rejected','not_interested','resolved','unresolved']
  const bandejaLeads=allLeads.filter(l=>{
    if(!l.phone_number||!phonesConMensajes.includes(l.phone_number)) return false
    if(ESTADOS_FINALES_BANDEJA.includes(l.status||'')) return false
    const q=bandejaSearch.toLowerCase()
    const m=!q||(l.full_name||'').toLowerCase().includes(q)||(l.phone_number||'').includes(q)||(l.dni||'').includes(q)
    const s=bandejaStatus==='all'||l.status===bandejaStatus
    return m&&s
  })

  const currentLead=allLeads.find(l=>l.phone_number===selectedPhone)
  const currentMsgs=messages.filter(m=>m.phone_number===selectedPhone).sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())

  const stats={
    inbound:  bandejaLeads.length,
    activos:  bandejaLeads.filter(l=>['contacted','new'].includes(l.status||'')).length,
    sinResp:  [...new Set(messages.filter(m=>m.direction==='in').map(m=>m.phone_number))]
      .filter(p=>bandejaLeads.find(l=>l.phone_number===p))
      .filter(p=>!messages.find(m=>m.phone_number===p&&m.direction==='out'&&m.sender!=='bot')).length,
    cerrados: botLeads.filter(l=>l.status==='closed'&&new Date(l.updated_at).toDateString()===new Date().toDateString()).length,
  }

  if(!mounted) return null

  const sc=(status:string)=>LEAD_STATUS[status]||LEAD_STATUS.new
  const scCob=(status:string)=>COBRANZA_STATUS[status]||COBRANZA_STATUS.new
  // Obtener el status display según el flujo del lead actual
  const scFor=(status:string,phone:string|null)=>{
    const flujo = phone ? flujoMap[phone] : 'solicitud'
    return flujo==='cobranzas' ? scCob(status) : sc(status)
  }
  // Estados disponibles según flujo
  const getEstadosFor=(phone:string|null)=>{
    const flujo = phone ? flujoMap[phone] : 'solicitud'
    return flujo==='cobranzas' ? COBRANZA_STATUS : LEAD_STATUS
  }
  // Estados finales (que permiten finalizar) según flujo
  const getEstadosFinalesFor=(phone:string|null)=>{
    const flujo = phone ? flujoMap[phone] : 'solicitud'
    return flujo==='cobranzas'
      ? ['resolved','unresolved']
      : ['not_interested','rejected','closed']
  }
  // Label de flujo
  const getFlujoLabel=(phone:string|null)=>
    phone && flujoMap[phone]==='cobranzas' ? 'Cobranzas' : 'Ventas'

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
          <input ref={userRef} className="li mono" placeholder="AMAT1" value={loginUser} onChange={e=>setLoginUser(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&handleLogin()} disabled={locked}/>
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
        <button onClick={handleLogin} disabled={locked} style={{width:'100%',background:'linear-gradient(135deg,#B45309,#F59E0B)',border:'none',borderRadius:12,padding:14,color:'white',fontSize:14,fontWeight:600,cursor:locked?'not-allowed':'pointer',fontFamily:'inherit',opacity:locked?.5:1}}>
          {locked?'🔒 Bloqueado':'Iniciar sesión'}
        </button>
        <div style={{marginTop:22,paddingTop:18,borderTop:'1px solid rgba(255,255,255,.06)'}}>
          <button onClick={()=>setShowCreds(p=>!p)} style={{display:'block',width:'100%',background:'none',border:'none',cursor:'pointer',color:'#334155',fontSize:11,fontFamily:'inherit',textTransform:'uppercase',letterSpacing:'.07em',textAlign:'center'}}>
            {showCreds?'▲ Ocultar':'▼ Ver credenciales'}
          </button>
          {showCreds&&(
            <div style={{marginTop:12}}>
              {USERS.map(u=>(
                <div key={u.id} onClick={()=>{setLoginUser(u.username);setLoginPass(u.password)}} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,padding:'8px 10px',borderRadius:8,cursor:'pointer',marginBottom:4,border:'1px solid transparent'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <span className="mono" style={{fontSize:12,color:'#93C5FD',fontWeight:500}}>{u.username}</span>
                  <span className="mono" style={{fontSize:12,color:'#6EE7B7'}}>{u.password}</span>
                  <span style={{fontSize:11,color:'#94A3B8'}}>{u.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
        .tbl td{padding:9px 14px;border-bottom:1px solid #F8FAFC;font-size:13px;color:#374151;vertical-align:middle}
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
          {([['bandeja','💬','Bandeja'],['consultas','📥','Consultas'],['base','👥','Base'],['pipeline','📋','Pipeline'],['reportes','📊','Reportes']] as const).map(([t,i,l])=>(
            <button key={t} className={`tabbtn ${tab===t?'on':''}`} onClick={()=>setTab(t)}>{i} {l}
  
            </button>
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
      {tab==='bandeja'&&(
        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          {/* Sidebar */}
          <div style={{width:292,borderRight:'1px solid #E2E8F0',background:'white',display:'flex',flexDirection:'column',flexShrink:0}}>
            {/* Toggle Cola / Mis Chats */}
            <div style={{padding:'10px 12px',borderBottom:'1px solid #F1F5F9',display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'flex',gap:4,background:'#F1F5F9',padding:3,borderRadius:8}}>
                <button style={{flex:1,padding:'6px 4px',borderRadius:6,border:'none',fontSize:11.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all .15s',background:vistaMode==='cola'?'white':'transparent',color:vistaMode==='cola'?'#0F172A':'#64748B',boxShadow:vistaMode==='cola'?'0 1px 3px rgba(0,0,0,.1)':'none'}}
                  onClick={()=>{setVistaMode('cola');setSelectedPhone(null)}}>
                  📥 Cola {(()=>{
                    const disponibles = bandejaLeads.filter(l=>{
                      if(l.assigned_to||l.status==='finalizado') return false
                      if(me?.role==='Vendedor') return (flujoMap[l.phone_number||'']||'solicitud')!=='cobranzas'
                      if(me?.role==='Cobranza') return (flujoMap[l.phone_number||'']||'solicitud')==='cobranzas'
                      return true
                    })
                    const n = disponibles.length
                    return n>0?<span style={{background:'#F59E0B',color:'white',borderRadius:99,padding:'1px 6px',fontSize:10,fontWeight:700,marginLeft:3}}>{n}</span>:null
                  })()}
                </button>
                <button style={{flex:1,padding:'6px 4px',borderRadius:6,border:'none',fontSize:11.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all .15s',background:vistaMode==='mis_chats'?'white':'transparent',color:vistaMode==='mis_chats'?'#0F172A':'#64748B',boxShadow:vistaMode==='mis_chats'?'0 1px 3px rgba(0,0,0,.1)':'none'}}
                  onClick={()=>setVistaMode('mis_chats')}>
                  💬 Mis chats {(()=>{
                    const n = bandejaLeads.filter(l=>l.assigned_to===me?.username&&l.status!=='finalizado').length
                    return n>0?<span style={{background:'#3B82F6',color:'white',borderRadius:99,padding:'1px 6px',fontSize:10,fontWeight:700,marginLeft:3}}>{n}</span>:null
                  })()}
                </button>
              </div>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94A3B8',fontSize:13,pointerEvents:'none'}}>🔍</span>
                <input className="si" placeholder="Buscar..." value={bandejaSearch} onChange={e=>setBandejaSearch(e.target.value)}/>
              </div>
            </div>

            {/* Lista */}
            <div style={{flex:1,overflowY:'auto'}}>
              {vistaMode==='cola'&&(()=>{
                // Cola: leads sin asignar, filtrados por rol
                let leads = bandejaLeads.filter(l=>{
                  if(l.assigned_to||l.status==='finalizado') return false
                  // Filtrar por rol: Vendedor→solicitud, Cobranza→cobranzas, Admin→todo
                  if(me?.role==='Vendedor'){
                    const fl=flujoMap[l.phone_number||'']||'solicitud'
                    return fl!=='cobranzas'
                  }
                  if(me?.role==='Cobranza'){
                    const fl=flujoMap[l.phone_number||'']||'solicitud'
                    return fl==='cobranzas'
                  }
                  return true // Admin ve todo
                })
                if(bandejaSearch) leads=leads.filter(l=>(l.full_name||'').toLowerCase().includes(bandejaSearch.toLowerCase())||(l.phone_number||'').includes(bandejaSearch)||(l.dni||'').includes(bandejaSearch))
                if(leads.length===0) return (
                  <div style={{padding:32,textAlign:'center',color:'#94A3B8',fontSize:13}}>
                    <div style={{fontSize:36,marginBottom:8}}>✅</div>
                    <div style={{fontWeight:600,marginBottom:4}}>Cola vacía</div>
                    No hay conversaciones nuevas pendientes
                  </div>
                )
                return leads.map(lead=>{
                  const lastMsg=messages.filter(m=>m.phone_number===lead.phone_number).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]
                  return (
                    <div key={lead.phone_number??lead.id} style={{display:'flex',gap:10,padding:'12px 14px',borderBottom:'1px solid #F1F5F9',cursor:'pointer',alignItems:'flex-start',background:'#FFFBEB',borderLeft:'3px solid #F59E0B'}}
                      onClick={()=>tomarConversacion(lead)}>
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
                        <div style={{fontSize:11,color:'#94A3B8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lastMsg?lastMsg.body:lead.reparticion||'Sin mensajes'}</div>
                        <div style={{marginTop:4,fontSize:10.5,color:'#B45309',fontWeight:600}}>👆 Click para tomar</div>
                      </div>
                    </div>
                  )
                })
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
                {/* Header */}
                <div style={{padding:'10px 18px',background:'white',borderBottom:'1px solid #E2E8F0',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                  <div className="av" style={{width:40,height:40,fontSize:13,background:'#EFF6FF',color:'#1D4ED8'}}>{(currentLead.full_name||selectedPhone).slice(0,2).toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,color:'#0F172A'}}>{currentLead.full_name||selectedPhone}</div>
                    <div style={{fontSize:12,color:'#64748B',display:'flex',gap:8,flexWrap:'wrap'}}>
                      <span className="mono">📱 {selectedPhone}</span>
                      {currentLead.reparticion&&<span>· {currentLead.reparticion}</span>}
                      <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,fontWeight:700,background:flujoMap[currentLead.phone_number||'']==='cobranzas'?'#F5F3FF':'#EFF6FF',color:flujoMap[currentLead.phone_number||'']==='cobranzas'?'#6D28D9':'#1D4ED8'}}>
                        {getFlujoLabel(currentLead.phone_number)}
                      </span>
                      {currentLead.assigned_to&&<span>· 👤 {currentLead.assigned_to}</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0,flexWrap:'wrap'}}>
                    <button className="btn" onClick={()=>setShowStatusModal(true)}>
                      <span className="pill" style={{background:scFor(currentLead.status,currentLead.phone_number).bg,color:scFor(currentLead.status,currentLead.phone_number).text}}>{scFor(currentLead.status,currentLead.phone_number).label}</span>▾
                    </button>
                    <button className="btn" onClick={()=>setShowAssignModal(true)}>👤 Asignar</button>
                    <button className="btn" onClick={()=>{setNoteText(currentLead.notes||'');setEditTarget(currentLead);setShowNoteModal(true)}}>📝 Nota</button>
                    <button className="btn" onClick={()=>openEdit(currentLead)}>✏️ Editar</button>
                    <button style={{padding:'6px 12px',borderRadius:8,border:'1px solid #E2E8F0',background:'#F8FAFC',color:'#64748B',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5,transition:'all .15s',whiteSpace:'nowrap'}}
                      onClick={()=>setShowFinalizarModal(true)}>
                      ✓ Finalizar
                    </button>
                  </div>
                </div>

                {/* Mensajes */}
                <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:10,background:'#F8FAFC'}}>
                  {currentMsgs.length===0&&<div style={{textAlign:'center',color:'#94A3B8',fontSize:13,marginTop:60}}>💬 Sin mensajes</div>}
                  {currentMsgs.map(msg=>(
                    <div key={msg.id} style={{display:'flex',justifyContent:msg.direction==='out'?'flex-end':'flex-start'}}>
                      <div>
                        <div style={{fontSize:10,color:'#94A3B8',marginBottom:3,padding:msg.direction==='out'?'0 4px 0 0':'0 0 0 4px',textAlign:msg.direction==='out'?'right':'left'}}>
                          {msg.direction==='out'?msg.sender:msg.sender==='bot'?'🤖 Arturito':'Cliente'}
                        </div>
                        <div className={msg.direction==='out'?'mo':msg.sender==='bot'?'mb':'mi'}>
                          <div style={{fontSize:13,lineHeight:1.55,whiteSpace:'pre-wrap'}}>{msg.body}</div>
                          <div style={{fontSize:10,marginTop:4,color:msg.direction==='out'?'rgba(255,255,255,.6)':'#94A3B8'}}>{new Date(msg.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={msgEndRef}/>
                </div>

                {/* Input */}
                <div style={{padding:'12px 18px',background:'white',borderTop:'1px solid #E2E8F0',display:'flex',gap:8,alignItems:'flex-end',flexShrink:0}}>
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
          {/* Barra filtros */}
          <div style={{padding:'10px 16px',background:'white',borderBottom:'1px solid #E2E8F0',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
            <div style={{position:'relative',flex:'1',minWidth:200}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94A3B8',fontSize:13,pointerEvents:'none'}}>🔍</span>
              <input className="si" placeholder="Nombre, DNI o teléfono..." value={baseSearchInput}
                onChange={e=>{
                  const v=e.target.value
                  setBaseSearchInput(v)
                  clearTimeout((window as any).__st)
                  ;(window as any).__st=setTimeout(()=>{ setBaseSearch(v); setBasePage(0) },400)
                }}
                onKeyDown={e=>{ if(e.key==='Enter'){ clearTimeout((window as any).__st); setBaseSearch(baseSearchInput); setBasePage(0) } }}
              />
            </div>
            <button className="btn pri" onClick={()=>{setBaseSearch(baseSearchInput);setBasePage(0)}}>Buscar</button>
            <button className="btn suc" onClick={()=>setShowImportExport(true)}>📊 Imp/Exp</button>
            <button className="btn" style={{borderColor:'#BBF7D0',color:'#065F46',background:'#ECFDF5'}} onClick={exportVentas}>🎉 Exportar ventas</button>
            <button style={{padding:'7px 14px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#18181B,#3F3F46)',color:'white',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5,boxShadow:'0 2px 8px rgba(24,24,27,0.3)',transition:'all .15s',whiteSpace:'nowrap'}} onClick={()=>setShowCampana(true)}>
              📣 Campaña WhatsApp
            </button>
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
              {Object.entries(LEAD_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
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
            {(baseSearch||baseRep!=='all'||baseBanco!=='all'||baseStatus!=='all'||baseTel!=='all'||baseAssigned!=='all')&&(
              <button className="btn" onClick={()=>{setBaseSearch('');setBaseSearchInput('');setBaseRep('all');setBaseBanco('all');setBaseStatus('all');setBaseTel('all');setBaseAssigned('all');setBasePage(0)}}>✕ Limpiar</button>
            )}
            <span style={{fontSize:12,color:'#94A3B8',marginLeft:'auto',whiteSpace:'nowrap'}}>{baseTotal.toLocaleString()} contacto{baseTotal!==1?'s':''}</span>
          </div>

          {/* Tabla */}
          <div style={{flex:1,overflow:'auto'}}>
            {baseLoading?(
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#94A3B8',flexDirection:'column',gap:10}}>
                <div style={{fontSize:32}}>⏳</div><div style={{fontSize:14}}>Cargando...</div>
              </div>
            ):(
              <table className="tbl" style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th>DNI</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Repartición</th><th>Banco</th><th>Estado</th><th>Asignado</th><th>Acciones</th>
                </tr></thead>
                <tbody>
                  {baseLeads.map(lead=>{
                    const s=sc(lead.status)
                    return (
                      <tr key={lead.id}>
                        <td className="mono" style={{color:'#64748B',fontSize:12}}>{lead.dni||'—'}</td>
                        <td style={{fontWeight:600,color:'#0F172A',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.full_name||'—'}</td>
                        <td style={{fontSize:12}}>
                          {lead.phone_number
                            ? <span className="mono">{lead.phone_number}</span>
                            : <span style={{color:'#CBD5E1',fontSize:11}}>Sin teléfono</span>}
                        </td>
                        <td style={{fontSize:12,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#64748B'}}>{lead.email||<span style={{color:'#CBD5E1'}}>—</span>}</td>
                        <td style={{fontSize:12,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.reparticion||'—'}</td>
                        <td style={{fontSize:12}}>{lead.bank||'—'}</td>
                        <td><span className="pill" style={{background:s.bg,color:s.text}}>{s.label}</span></td>
                        <td style={{fontSize:12,color:'#64748B'}}>{lead.assigned_to||<span style={{color:'#CBD5E1'}}>—</span>}</td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            <button className="btn" style={{padding:'4px 9px',fontSize:11}} onClick={()=>openEdit(lead)}>✏️</button>
                            <button className="btn suc" style={{padding:'4px 9px',fontSize:11}} onClick={()=>updateStatus(lead.id,'contacted')}>📞</button>
                            <button className="btn war" style={{padding:'4px 9px',fontSize:11}} onClick={()=>openTemplate(lead)}>💬 Plantilla</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {baseLeads.length===0&&<tr><td colSpan={8} style={{textAlign:'center',padding:48,color:'#94A3B8'}}>Sin resultados</td></tr>}
                </tbody>
              </table>
            )}
          </div>

          {/* Paginación */}
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
          {/* Barra filtros */}
          <div style={{padding:'10px 16px',background:'white',borderBottom:'1px solid #E2E8F0',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',flexShrink:0,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
            <div style={{position:'relative',flex:'1',minWidth:200}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94A3B8',fontSize:13,pointerEvents:'none'}}>🔍</span>
              <input className="si" placeholder="Nombre, DNI o teléfono..." value={cSearchInput}
                onChange={e=>{
                  setCSearchInput(e.target.value)
                  clearTimeout((window as any).__ct)
                  ;(window as any).__ct=setTimeout(()=>{ setCSearch(e.target.value) },400)
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
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="resuelto">Resuelto</option>
              <option value="cerrado">Cerrado</option>
            </select>
            <select className="fsel" value={cRep} onChange={e=>setCRep(e.target.value)}>
              <option value="all">Todas las reparticiones</option>
              {REPARTICIONES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <button className="btn" onClick={()=>{setCSearch('');setCSearchInput('');setCFlujo('all');setCEstado('all');setCRep('all')}}>✕ Limpiar</button>
            <span style={{fontSize:12,color:'#94A3B8',marginLeft:'auto',fontFamily:"'DM Mono',monospace"}}>{consultas.length} consultas</span>
          </div>

          {/* Tabla */}
          <div style={{flex:1,overflow:'auto',background:'#F8FAFC'}}>
            {consultasLoading ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:10,color:'#94A3B8'}}>
                <div style={{fontSize:32}}>⏳</div><div>Cargando consultas...</div>
              </div>
            ) : consultas.length === 0 ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:10,color:'#94A3B8'}}>
                <div style={{fontSize:48}}>📥</div>
                <div style={{fontSize:15,fontWeight:600,color:'#64748B',fontFamily:"'Playfair Display',serif"}}>Sin consultas todavía</div>
                <div style={{fontSize:13,color:'#94A3B8'}}>Las consultas del bot aparecerán acá automáticamente</div>
              </div>
            ) : (
              <table className="tbl" style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  {['Fecha','Nombre','DNI','Teléfono','Repartición','Flujo','Prestación','Afiliado','Vendedor','Situación','Estado','Acciones'].map(h=>(
                    <th key={h}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {consultas.map(c=>{
                    const estadoColors: Record<string,{bg:string,text:string}> = {
                      pendiente:  {bg:'#FFFBEB',text:'#92400E'},
                      en_proceso: {bg:'#EFF6FF',text:'#1D4ED8'},
                      resuelto:   {bg:'#ECFDF5',text:'#065F46'},
                      cerrado:    {bg:'#F8FAFC',text:'#475569'},
                    }
                    const ec = estadoColors[c.estado] || estadoColors.pendiente
                    return (
                      <tr key={c.id} onClick={()=>{setConsultaSelected(c);setConsultaEdit({vendedor:c.vendedor||'',situacion:c.situacion||'',estado:c.estado||'pendiente'});setShowConsultaModal(true)}}>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:'#64748B',whiteSpace:'nowrap'}}>{new Date(c.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                        <td style={{fontWeight:600,color:'#0F172A',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre_apellido||'—'}</td>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:'#64748B'}}>{c.dni||'—'}</td>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{c.phone||'—'}</td>
                        <td style={{fontSize:12,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.reparticion_label||'—'}</td>
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
                            {({'pendiente':'Pendiente','en_proceso':'En proceso','resuelto':'Resuelto','cerrado':'Cerrado'} as any)[c.estado]||c.estado}
                          </span>
                        </td>
                        <td>
                          <button className="btn" style={{padding:'4px 9px',fontSize:11}} onClick={e=>{e.stopPropagation();setConsultaSelected(c);setConsultaEdit({vendedor:c.vendedor||'',situacion:c.situacion||'',estado:c.estado||'pendiente'});setShowConsultaModal(true)}}>
                            ✏️ Gestionar
                          </button>
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
      {tab==='pipeline'&&(()=>{
        // Determinar modo pipeline según rol
        const esAdmin = me?.role==='Administrador'
        const rolPipe = me?.role==='Cobranza' ? 'cobranzas' : 'ventas'
        // Admin puede togglear — usamos pipelineMode state
        const modoActivo = esAdmin ? pipelineMode : rolPipe

        // Columnas según modo
        const colsVentas  = Object.entries(LEAD_STATUS)  as [string, typeof LEAD_STATUS[keyof typeof LEAD_STATUS]][]
        const colsCob     = Object.entries(COBRANZA_STATUS) as [string, typeof COBRANZA_STATUS[keyof typeof COBRANZA_STATUS]][]
        const cols        = modoActivo==='cobranzas' ? colsCob : colsVentas

        // Leads filtrados por modo
        const leadsParaPipe = bandejaLeads.filter(l=>{
          const fl = flujoMap[l.phone_number||'']||'solicitud'
          return modoActivo==='cobranzas' ? fl==='cobranzas' : fl!=='cobranzas'
        })

        return (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#F8FAFC'}}>
            {/* Header con toggle para Admin */}
            <div style={{padding:'12px 20px',background:'white',borderBottom:'1px solid #E2E8F0',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
              <span style={{fontWeight:700,fontSize:14,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>Pipeline</span>
              {esAdmin && (
                <div style={{display:'flex',gap:4,background:'#F1F5F9',padding:3,borderRadius:8,marginLeft:8}}>
                  {(['ventas','cobranzas'] as const).map(m=>(
                    <button key={m} onClick={()=>setPipelineMode(m)}
                      style={{padding:'5px 16px',borderRadius:6,border:'none',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all .15s',
                        background:pipelineMode===m?'white':'transparent',
                        color:pipelineMode===m?'#0F172A':'#64748B',
                        boxShadow:pipelineMode===m?'0 1px 3px rgba(0,0,0,.1)':'none'}}>
                      {m==='ventas'?'💼 Ventas':'🔔 Cobranzas'}
                    </button>
                  ))}
                </div>
              )}
              {!esAdmin && (
                <span style={{fontSize:12,padding:'3px 12px',borderRadius:99,fontWeight:600,
                  background:modoActivo==='cobranzas'?'#F5F3FF':'#EFF6FF',
                  color:modoActivo==='cobranzas'?'#6D28D9':'#1D4ED8'}}>
                  {modoActivo==='cobranzas'?'🔔 Cobranzas':'💼 Ventas'}
                </span>
              )}
              <span style={{fontSize:12,color:'#94A3B8',marginLeft:'auto',fontFamily:"'DM Mono',monospace"}}>{leadsParaPipe.length} contactos</span>
            </div>

            {/* Columnas kanban */}
            <div style={{flex:1,overflowX:'auto',padding:20}}>
              <div style={{display:'flex',gap:12,minWidth:'max-content',height:'100%'}}>
                {cols.map(([status,s])=>{
                  const col = leadsParaPipe.filter(l=>l.status===status)
                  const isCob = modoActivo==='cobranzas'
                  return (
                    <div key={status} style={{background:'#F1F5F9',borderRadius:14,padding:12,width:220,flexShrink:0,minHeight:200,
                      borderTop:`3px solid ${s.color}`}}>
                      <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:12}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                        <span style={{fontSize:12,fontWeight:700,color:'#374151'}}>{s.label}</span>
                        <span style={{fontSize:11,color:'#94A3B8',marginLeft:'auto',background:'white',padding:'1px 8px',borderRadius:99,border:'1px solid #E2E8F0',fontWeight:600}}>{col.length}</span>
                      </div>
                      {col.map(lead=>(
                        <div key={lead.id}
                          style={{background:'white',border:'1px solid #E2E8F0',borderRadius:10,padding:'12px 14px',marginBottom:8,cursor:'pointer',transition:'all .15s',borderLeft:`3px solid ${s.color}`}}
                          onClick={()=>{setSelectedPhone(lead.phone_number);setTab('bandeja')}}
                          onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='0 4px 14px rgba(0,0,0,.08)';(e.currentTarget as HTMLDivElement).style.transform='translateY(-1px)'}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='none';(e.currentTarget as HTMLDivElement).style.transform='none'}}>
                          <div style={{fontWeight:600,fontSize:13,color:'#0F172A',marginBottom:3}}>{lead.full_name||lead.phone_number||'Sin datos'}</div>
                          <div style={{fontSize:11,color:'#64748B'}}>{lead.reparticion||'—'}</div>
                          {!isCob && lead.amount&&<div style={{fontSize:11,color:'#374151',fontWeight:500,marginTop:4}}>${lead.amount.toLocaleString('es-AR')} · {lead.installments}c</div>}
                          {lead.assigned_to&&<div style={{fontSize:10,color:'#94A3B8',marginTop:5}}>👤 {lead.assigned_to}</div>}
                          <div style={{fontSize:10,color:'#CBD5E1',marginTop:4,fontFamily:"'DM Mono',monospace"}}>{new Date(lead.updated_at).toLocaleDateString('es-AR')}</div>
                        </div>
                      ))}
                      {col.length===0&&<div style={{textAlign:'center',color:'#CBD5E1',fontSize:12,padding:'24px 0'}}>Sin contactos</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ REPORTES ══ */}
      {tab==='reportes'&&(
        <div style={{flex:1,overflow:'auto',padding:'20px 24px',background:'#F8FAFC'}}>

          {/* KPI cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
            {[
              {label:'Total leads',val:bandejaLeads.length,color:'#F59E0B',icon:'◈',sub:'En bandeja activa'},
              {label:'Cerrados',val:bandejaLeads.filter(l=>l.status==='closed').length,color:'#10B981',icon:'✓',sub:'Operaciones concretadas'},
              {label:'Contactados',val:bandejaLeads.filter(l=>l.status==='contacted').length,color:'#06B6D4',icon:'◉',sub:'Conversaciones iniciadas'},
              {label:'Sin contactar',val:bandejaLeads.filter(l=>l.status==='new').length,color:'#F59E0B',icon:'·',sub:'Estado nuevo'},
              {label:'Tasa conversión',val:bandejaLeads.length>0?Math.round(bandejaLeads.filter(l=>l.status==='closed').length/bandejaLeads.length*100)+'%':'0%',color:'#EC4899',icon:'%',sub:'Cerrados vs total'},
            ].map(k=>(
              <div key={k.label} style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px 18px',borderTop:`3px solid ${k.color}`,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.07em',fontFamily:"'DM Mono',monospace"}}>{k.label}</span>
                  <span style={{fontSize:18,color:k.color,opacity:0.6}}>{k.icon}</span>
                </div>
                <div style={{fontSize:28,fontWeight:700,color:k.color,fontFamily:"'Playfair Display',serif",lineHeight:1}}>{k.val}</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:6,fontFamily:"'DM Mono',monospace"}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Fila 1: Barras de estado + Pie repartición */}
          <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:16,marginBottom:16}}>

            {/* Gráfico de barras — distribución por estado */}
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>Distribución por estado</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Cantidad de leads en cada etapa del proceso</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={Object.entries(LEAD_STATUS).map(([k,v])=>({name:v.label,value:bandejaLeads.filter(l=>l.status===k).length,color:v.color}))}
                  margin={{top:0,right:10,left:-10,bottom:40}}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:10,fill:'#94A3B8',fontFamily:"'DM Mono',monospace"}} angle={-35} textAnchor="end" interval={0} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontSize:11,fill:'#94A3B8'}} tickLine={false} axisLine={false} allowDecimals={false}/>
                  <Tooltip
                    contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12,boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}
                    cursor={{fill:'rgba(59,130,246,0.05)'}}
                    formatter={(val:any)=>[`${val} leads`,'']}
                  />
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {Object.entries(LEAD_STATUS).map(([k,v],i)=>(
                      <Cell key={i} fill={v.color}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie chart — repartición */}
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>Por repartición</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Composición del segmento activo</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={REPARTICIONES.map(r=>({name:r.replace('MINISTERIO DE ','Min. ').replace('SERVICIO PENITENCIARIO BONAERENSE','SPB'),value:bandejaLeads.filter(l=>l.reparticion===r).length})).filter(d=>d.value>0)}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    paddingAngle={2} dataKey="value"
                  >
                    {REPARTICIONES.map((_,i)=>(
                      <Cell key={i} fill={['#F59E0B','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899'][i%7]}/>
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12,boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}
                    formatter={(val:any)=>[`${val} leads`,'']}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,fontFamily:"'DM Mono',monospace"}}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fila 2: Area chart progreso + Barras asesores */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>

            {/* Area chart — embudo de conversión */}
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>Embudo de conversión</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Leads que avanzan por cada etapa</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={[
                    {etapa:'Nuevos',leads:bandejaLeads.filter(l=>l.status==='new').length},
                    {etapa:'Contactados',leads:bandejaLeads.filter(l=>l.status==='contacted').length},
                    {etapa:'No interesados',leads:bandejaLeads.filter(l=>l.status==='not_interested').length},
                    {etapa:'Rechazados',leads:bandejaLeads.filter(l=>l.status==='rejected').length},
                    {etapa:'Cerrados',leads:bandejaLeads.filter(l=>l.status==='closed').length},
                  ]}
                  margin={{top:5,right:20,left:-10,bottom:5}}
                >
                  <defs>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                  <XAxis dataKey="etapa" tick={{fontSize:11,fill:'#94A3B8',fontFamily:"'DM Mono',monospace"}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fontSize:11,fill:'#94A3B8'}} tickLine={false} axisLine={false} allowDecimals={false}/>
                  <Tooltip
                    contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12,boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}
                    formatter={(val:any)=>[`${val} leads`,'']}
                  />
                  <Area type="monotone" dataKey="leads" stroke="#3B82F6" strokeWidth={2} fill="url(#colorLeads)" dot={{fill:'#F59E0B',strokeWidth:0,r:4}}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Barras horizontales — asesores */}
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>Rendimiento por asesor</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Leads asignados y cerrados por usuario</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  layout="vertical"
                  data={USERS.map(u=>({
                    name:u.username,
                    asignados:bandejaLeads.filter(l=>l.assigned_to===u.username).length,
                    cerrados:bandejaLeads.filter(l=>l.assigned_to===u.username&&l.status==='closed').length,
                    color:u.color,
                  }))}
                  margin={{top:0,right:20,left:10,bottom:0}}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11,fill:'#94A3B8'}} tickLine={false} axisLine={false} allowDecimals={false}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#64748B',fontFamily:"'DM Mono',monospace"}} tickLine={false} axisLine={false} width={60}/>
                  <Tooltip
                    contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12,boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}
                  />
                  <Legend iconType="square" iconSize={8} wrapperStyle={{fontSize:11,fontFamily:"'DM Mono',monospace"}}/>
                  <Bar dataKey="asignados" name="Asignados" fill="#BFDBFE" radius={[0,4,4,0]}/>
                  <Bar dataKey="cerrados" name="Cerrados" fill="#2563EB" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fila 3: Tabla resumen detallada */}
          <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>Resumen por repartición</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Desglose completo de estados por organismo</div>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                <thead>
                  <tr style={{background:'#F8FAFC'}}>
                    {['Repartición','Total','Nuevos','Contactados','No interesados','Cerrados','Rechazados','% Cierre'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'10px 14px',fontSize:10.5,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',borderBottom:'1px solid #E2E8F0',fontFamily:"'DM Mono',monospace",whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {REPARTICIONES.map(r=>{
                    const leads_r=bandejaLeads.filter(l=>l.reparticion===r)
                    if(leads_r.length===0) return null
                    const total=leads_r.length
                    const cerrados=leads_r.filter(l=>l.status==='closed').length
                    const pctCierre=total>0?Math.round(cerrados/total*100):0
                    return (
                      <tr key={r} style={{borderBottom:'1px solid #F8FAFC'}} onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')} onMouseLeave={e=>(e.currentTarget.style.background='white')}>
                        <td style={{padding:'10px 14px',fontWeight:600,color:'#0F172A',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.replace('MINISTERIO DE ','Min. ').replace('SERVICIO PENITENCIARIO BONAERENSE','SPB')}</td>
                        <td style={{padding:'10px 14px',fontWeight:700,color:'#F59E0B',fontFamily:"'DM Mono',monospace"}}>{total}</td>
                        <td style={{padding:'10px 14px',color:'#94A3B8',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='new').length}</td>
                        <td style={{padding:'10px 14px',color:'#06B6D4',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='contacted').length}</td>
                        <td style={{padding:'10px 14px',color:'#6B7280',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='not_interested').length}</td>
                        <td style={{padding:'10px 14px',color:'#10B981',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{cerrados}</td>
                        <td style={{padding:'10px 14px',color:'#EF4444',fontFamily:"'DM Mono',monospace"}}>{leads_r.filter(l=>l.status==='rejected').length}</td>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1,height:4,background:'#F1F5F9',borderRadius:99,overflow:'hidden',minWidth:40}}>
                              <div style={{height:'100%',width:`${pctCierre}%`,background:'#10B981',borderRadius:99}}/>
                            </div>
                            <span style={{fontSize:11,fontWeight:700,color:pctCierre>20?'#10B981':pctCierre>10?'#F59E0B':'#94A3B8',fontFamily:"'DM Mono',monospace",minWidth:30}}>{pctCierre}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Fila total */}
                  <tr style={{background:'#F8FAFC',borderTop:'2px solid #E2E8F0'}}>
                    <td style={{padding:'10px 14px',fontWeight:700,color:'#0F172A',fontFamily:"'DM Mono',monospace",fontSize:11,textTransform:'uppercase',letterSpacing:'0.05em'}}>TOTAL</td>
                    <td style={{padding:'10px 14px',fontWeight:700,color:'#F59E0B',fontFamily:"'DM Mono',monospace"}}>{bandejaLeads.length}</td>
                    <td style={{padding:'10px 14px',color:'#94A3B8',fontFamily:"'DM Mono',monospace"}}>{bandejaLeads.filter(l=>l.status==='new').length}</td>
                    <td style={{padding:'10px 14px',color:'#06B6D4',fontFamily:"'DM Mono',monospace"}}>{bandejaLeads.filter(l=>l.status==='contacted').length}</td>
                    <td style={{padding:'10px 14px',color:'#F59E0B',fontFamily:"'DM Mono',monospace"}}>{bandejaLeads.filter(l=>l.status==='interested').length}</td>
                    <td style={{padding:'10px 14px',color:'#10B981',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{bandejaLeads.filter(l=>l.status==='closed').length}</td>
                    <td style={{padding:'10px 14px',color:'#EF4444',fontFamily:"'DM Mono',monospace"}}>{bandejaLeads.filter(l=>l.status==='rejected').length}</td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{fontSize:11,fontWeight:700,color:'#10B981',fontFamily:"'DM Mono',monospace"}}>
                        {bandejaLeads.length>0?Math.round(bandejaLeads.filter(l=>l.status==='closed').length/bandejaLeads.length*100):0}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Fila 4: RadialBar campañas + tabla asesores detallada */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:16,marginBottom:20}}>

            {/* RadialBar — estados positivos vs negativos */}
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>Salud del pipeline</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Estados positivos vs negativos</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart
                  innerRadius="25%" outerRadius="90%"
                  data={[
                    {name:'Cerrados',value:bandejaLeads.filter(l=>l.status==='closed').length,fill:'#10B981'},
                    {name:'Contactados',value:bandejaLeads.filter(l=>l.status==='contacted').length,fill:'#06B6D4'},
                    {name:'No interesados',value:bandejaLeads.filter(l=>l.status==='not_interested').length,fill:'#6B7280'},
                    {name:'Rechazados',value:bandejaLeads.filter(l=>l.status==='rejected').length,fill:'#EF4444'},
                  ]}
                  startAngle={90} endAngle={-270}
                >
                  <RadialBar dataKey="value" cornerRadius={4} background={{fill:'#F8FAFC'}}/>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,fontFamily:"'DM Mono',monospace"}}/>
                  <Tooltip
                    contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12,boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabla detallada asesores */}
            <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden'}}>
              <div style={{padding:'16px 20px',borderBottom:'1px solid #F1F5F9'}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>Detalle por asesor</div>
                <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Gestión individual del equipo</div>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                <thead>
                  <tr style={{background:'#F8FAFC'}}>
                    {['Asesor','Asignados','Contactados','Cerrados','% Cierre'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'9px 14px',fontSize:10.5,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',borderBottom:'1px solid #E2E8F0',fontFamily:"'DM Mono',monospace"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {USERS.map(u=>{
                    const asignados=bandejaLeads.filter(l=>l.assigned_to===u.username).length
                    const contactados=bandejaLeads.filter(l=>l.assigned_to===u.username&&['contacted','closed'].includes(l.status)).length
                    const cerrados=bandejaLeads.filter(l=>l.assigned_to===u.username&&l.status==='closed').length
                    const pct=asignados>0?Math.round(cerrados/asignados*100):0
                    return (
                      <tr key={u.id} style={{borderBottom:'1px solid #F8FAFC'}} onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')} onMouseLeave={e=>(e.currentTarget.style.background='white')}>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{width:28,height:28,borderRadius:'50%',background:u.color,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:10,fontWeight:700,flexShrink:0}}>{u.initials}</div>
                            <div>
                              <div style={{fontWeight:600,color:'#0F172A',fontSize:12.5,fontFamily:"'DM Mono',monospace"}}>{u.username}</div>
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
      )}

      {/* ══ MODAL: CAMBIAR ESTADO ══ */}
      {showStatusModal&&currentLead&&(
        <div className="movo" onClick={()=>setShowStatusModal(false)}>
          <div className="mod" onClick={e=>e.stopPropagation()}>
            <h3>Cambiar estado</h3>
            {Object.entries(getEstadosFor(currentLead.phone_number))
              .filter(([k])=>k!=='finalizado')
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
                await supabase.from('amat_loan_leads').update({assigned_to:u.username,updated_at:new Date().toISOString()}).eq('id',currentLead.id)
                // Si cambia de rol (ventas↔cobranzas), actualizar consulta
                await supabase.from('amat_consultas').update({vendedor:u.username,updated_at:new Date().toISOString()}).eq('phone',currentLead.phone_number||'')
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
            <div className="mopt" style={{border:'1px solid #E2E8F0',borderRadius:10,marginTop:6}} onClick={async()=>{await supabase.from('amat_loan_leads').update({assigned_to:null,updated_at:new Date().toISOString()}).eq('id',currentLead.id);setShowAssignModal(false)}}>
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
            <p style={{fontSize:12,color:'#64748B',margin:'0 0 12px'}}>Solo visible para el equipo. Quedará registrada con fecha y usuario.</p>
            <textarea className="ta" placeholder="Ej: Cliente interesado, llamar lunes a las 10hs. Pidió info de 24 cuotas." value={noteText} onChange={e=>setNoteText(e.target.value)}/>
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
            <p style={{fontSize:12,color:'#64748B',margin:'0 0 14px'}}>Seleccioná el motivo para clasificar correctamente este contacto.</p>
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
                <input className="fi" type="email" placeholder="nombre@gmail.com" value={editForm.email||''} onChange={e=>setEditForm(f=>({...f,email:e.target.value}))}/>
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
                <input className="fi" type="number" placeholder="150000" value={editForm.amount||''} onChange={e=>setEditForm(f=>({...f,amount:Number(e.target.value)||null as any}))}/>
              </div>
              <div>
                <label className="fl">Cuotas</label>
                <input className="fi" type="number" placeholder="12" value={editForm.installments||''} onChange={e=>setEditForm(f=>({...f,installments:Number(e.target.value)||null as any}))}/>
              </div>
              <div>
                <label className="fl">Estado</label>
                <select className="fs" value={editForm.status||'new'} onChange={e=>setEditForm(f=>({...f,status:e.target.value as any}))}>
                  {Object.entries(LEAD_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Asignado a</label>
                <select className="fs" value={editForm.assigned_to||''} onChange={e=>setEditForm(f=>({...f,assigned_to:e.target.value}))}>
                  <option value="">Sin asignar</option>
                  {USERS.map(u=><option key={u.id} value={u.username}>{u.username} — {u.role}</option>)}
                </select>
              </div>
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
            <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:12,color:'#92400E'}}>
              ⚠️ <strong>Próximamente:</strong> Una vez que el número de AMAT esté verificado en Meta Business, estas plantillas se enviarán directamente desde el CRM como mensajes de WhatsApp. Por ahora podés previsualizar y preparar el contenido.
            </div>
            {!selectedTemplate?(
              <>
                <p style={{fontSize:13,color:'#64748B',marginBottom:14}}>Seleccioná una plantilla para contactar a <strong>{editTarget.full_name}</strong>:</p>
                {TEMPLATES.map(tpl=>(
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
                  <label className="fl" style={{marginTop:12}}>Vista previa del mensaje</label>
                  <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'12px 14px',fontSize:13,lineHeight:1.6,color:'#1E293B',whiteSpace:'pre-wrap'}}>
                    {selectedTemplate.body.replace(/\{\{(\w+)\}\}/g,(_,k)=>templateVars[k]||`[${k}]`)}
                  </div>
                </div>
                <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:10,padding:'10px 14px',fontSize:12,color:'#1D4ED8',marginBottom:14}}>
                  📋 Cuando Meta esté conectado, este mensaje se enviará automáticamente al número <strong>{editTarget.phone_number}</strong>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn pri" style={{flex:1,justifyContent:'center'}} onClick={()=>{updateStatus(editTarget.id,'attempted');setShowTemplateModal(false)}}>
                    ✓ Marcar como intentado
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
        const estadosFinales = flujo==='cobranzas'
          ? ['resolved','unresolved']
          : ['not_interested','rejected','closed']
        const yaFinalizado = estadosFinales.includes(currentLead.status||'')
        const statusOpts = flujo==='cobranzas'
          ? Object.entries(COBRANZA_STATUS).filter(([k])=>['resolved','unresolved'].includes(k))
          : Object.entries(LEAD_STATUS).filter(([k])=>['not_interested','rejected','closed'].includes(k))
        const puedeConfirmar = yaFinalizado || !!finalizarEstado
        const estadoLabel = (flujo==='cobranzas'?COBRANZA_STATUS:LEAD_STATUS)[currentLead.status||'']?.label || currentLead.status
        return (
          <div className="movo" onClick={()=>{ setShowFinalizarModal(false); setFinalizarEstado('') }}>
            <div className="mod" onClick={e=>e.stopPropagation()} style={{width:420}}>
              <h3 style={{fontFamily:"'Playfair Display',serif"}}>✓ Finalizar conversación</h3>
              <p style={{fontSize:13,color:'#64748B',marginBottom:16,lineHeight:1.6}}>
                Al finalizar, la conversación con <strong>{currentLead.full_name||currentLead.phone_number}</strong> se cerrará
                y saldrá de tu bandeja. Podrás verla en la pestaña <strong>Consultas</strong> y <strong>Pipeline</strong>.
              </p>

              {yaFinalizado ? (
                <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:10,padding:'12px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:18}}>✅</span>
                  <div>
                    <div style={{fontSize:11,color:'#166534',textTransform:'uppercase',letterSpacing:'.07em',fontFamily:"'DM Mono',monospace",marginBottom:2}}>Estado registrado</div>
                    <div style={{fontSize:14,fontWeight:600,color:'#166534'}}>{estadoLabel}</div>
                    <div style={{fontSize:12,color:'#166534',opacity:.7,marginTop:2}}>La conversación se cerrará y quedará guardada en Consultas.</div>
                  </div>
                </div>
              ) : (
                <div style={{background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:10,padding:'12px 14px',marginBottom:16}}>
                  <div style={{fontSize:12,color:'#C2410C',fontWeight:600,marginBottom:8}}>
                    ⚠️ Debés elegir un estado final antes de cerrar
                  </div>
                  <label className="fl">Estado final</label>
                  <select className="fs" value={finalizarEstado} onChange={e=>setFinalizarEstado(e.target.value)}>
                    <option value="">— Seleccioná un estado —</option>
                    {statusOpts.map(([k,v])=>(
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {!yaFinalizado && (
                <div style={{marginBottom:12}}>
                  <label className="fl">Anotación / Resolución <span style={{color:'#94A3B8',fontWeight:400}}>(opcional)</span></label>
                  <textarea className="ta" style={{minHeight:64}} placeholder="Describí qué se resolvió, qué se acordó, motivo de cierre..." value={finalizarNota} onChange={e=>setFinalizarNota(e.target.value)}/>
                </div>
              )}
              <div style={{display:'flex',gap:8}}>
                <button
                  className="btn pri"
                  style={{flex:1,justifyContent:'center',opacity:puedeConfirmar?1:0.4}}
                  disabled={!puedeConfirmar}
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
            <h3 style={{fontFamily:"'Playfair Display',serif"}}>🎉 Registrar venta cerrada</h3>
            <p style={{fontSize:12,color:'#64748B',marginBottom:14}}>El valor de cuota se calcula automáticamente con la grilla AMAT.</p>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label className="fl">Entidad</label>
                <div style={{display:'flex',gap:6}}>
                  {['AMAT','DOS DE AGOSTO'].map(e=>(
                    <button key={e} style={{flex:1,padding:'8px 4px',borderRadius:7,borderWidth:1,borderStyle:'solid',borderColor:ventaForm.entidad===e?'#B45309':'#E2E8F0',background:ventaForm.entidad===e?'#FFFBEB':'white',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',color:ventaForm.entidad===e?'#B45309':'#374151'}}
                      onClick={()=>setVentaForm((f:any)=>({...f,entidad:e}))}>
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
                      onClick={()=>setVentaForm((f:any)=>({...f,linea:l}))}>
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
                      onClick={()=>setVentaForm((f:any)=>({...f,reparticion:r}))}>
                      {r.replace('MINISTERIO DE ','Min. ').replace('SERVICIO PENITENCIARIO BONAERENSE','SPB')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="fl">Monto</label>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
                  {[50000,100000,150000,200000,250000,300000,350000,400000,450000,500000,600000,800000,1000000,1500000].map(m=>(
                    <button key={m} style={{padding:'5px 2px',borderRadius:5,borderWidth:1,borderStyle:'solid',borderColor:parseInt(ventaForm.monto)===m?'#B45309':'#E2E8F0',background:parseInt(ventaForm.monto)===m?'#FFFBEB':'white',fontSize:10.5,fontWeight:600,cursor:'pointer',fontFamily:"'DM Mono',monospace",color:parseInt(ventaForm.monto)===m?'#B45309':'#374151'}}
                      onClick={()=>setVentaForm((f:any)=>({...f,monto:String(m)}))}>
                      ${m>=1000000?(m/1000000).toFixed(1)+'M':(m/1000).toFixed(0)+'k'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="fl">Cuotas</label>
                <div style={{display:'flex',gap:5}}>
                  {[6,12,18,24].map(n=>(
                    <button key={n} style={{flex:1,padding:'8px 4px',borderRadius:7,borderWidth:1,borderStyle:'solid',borderColor:parseInt(ventaForm.cuotas)===n?'#F59E0B':'#E2E8F0',background:parseInt(ventaForm.cuotas)===n?'#FFFBEB':'white',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Mono',monospace",color:parseInt(ventaForm.cuotas)===n?'#B45309':'#374151'}}
                      onClick={()=>setVentaForm((f:any)=>({...f,cuotas:String(n)}))}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {calcCuota>0&&(
              <div style={{background:'#ECFDF5',border:'1px solid #BBF7D0',borderRadius:10,padding:'12px 16px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:11,color:'#065F46',fontFamily:"'DM Mono',monospace",textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:2}}>Total por cuota</div>
                  <div style={{fontSize:26,fontWeight:700,color:'#065F46',fontFamily:"'Playfair Display',serif"}}>{fmtP(calcCuota)}</div>
                </div>
                <div style={{textAlign:'right',fontSize:12,color:'#047857'}}>
                  <div>{ventaForm.entidad} · {ventaForm.linea}</div>
                  <div>${parseInt(ventaForm.monto).toLocaleString('es-AR')} · {ventaForm.cuotas} cuotas</div>
                </div>
              </div>
            )}

            <div style={{marginBottom:12}}>
              <label className="fl">Notas (opcional)</label>
              <textarea className="ta" style={{minHeight:56}} placeholder="Observaciones..." value={ventaForm.notas} onChange={e=>setVentaForm((f:any)=>({...f,notas:e.target.value}))}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button style={{flex:2,padding:'10px',background:'linear-gradient(135deg,#059669,#10B981)',color:'white',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:(!ventaForm.entidad||!ventaForm.linea||!ventaForm.reparticion||!ventaForm.monto||!ventaForm.cuotas)?0.4:1}}
                disabled={!ventaForm.entidad||!ventaForm.linea||!ventaForm.reparticion||!ventaForm.monto||!ventaForm.cuotas}
                onClick={()=>{ setVentaForm((f:any)=>({...f,valor_cuota:String(calcCuota)})); setTimeout(guardarVenta,50) }}>
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
            <h3 style={{fontFamily:"'Playfair Display',serif"}}>📥 Gestionar consulta</h3>

            {/* Datos del cliente */}
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
                    <div style={{fontSize:10,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.07em',fontFamily:"'DM Mono',monospace",marginBottom:2}}>{l}</div>
                    <div style={{fontSize:13,color:'#0F172A',fontWeight:500}}>{v as string}</div>
                  </div>
                ))}
              </div>
              {consultaSelected.consulta_texto&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #E2E8F0'}}>
                  <div style={{fontSize:10,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.07em',fontFamily:"'DM Mono',monospace",marginBottom:4}}>Detalle consulta</div>
                  <div style={{fontSize:13,color:'#374151',lineHeight:1.6}}>{consultaSelected.consulta_texto}</div>
                </div>
              )}
            </div>

            {/* Gestión */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label className="fl">Vendedor asignado</label>
                <select className="fs" value={consultaEdit.vendedor} onChange={e=>setConsultaEdit((f:any)=>({...f,vendedor:e.target.value}))}>
                  <option value="">Sin asignar</option>
                  {USERS.map(u=><option key={u.id} value={u.username}>{u.username} — {u.role}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Estado</label>
                <select className="fs" value={consultaEdit.estado} onChange={e=>setConsultaEdit((f:any)=>({...f,estado:e.target.value}))}>
                  <option value="pendiente">Pendiente</option>
                  <option value="en_proceso">En proceso</option>
                  <option value="resuelto">Resuelto</option>
                  <option value="cerrado">Cerrado</option>
                </select>
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <label className="fl">Situación / Resolución</label>
              <textarea className="ta" placeholder="Describí qué pasó con esta consulta, cómo se resolvió, qué se acordó..." value={consultaEdit.situacion} onChange={e=>setConsultaEdit((f:any)=>({...f,situacion:e.target.value}))}/>
            </div>

            <div style={{display:'flex',gap:8,paddingTop:14,borderTop:'1px solid #F1F5F9'}}>
              <button className="btn pri" style={{flex:1,justifyContent:'center'}} onClick={async()=>{
                await supabase.from('amat_consultas').update({
                  vendedor:  consultaEdit.vendedor,
                  situacion: consultaEdit.situacion,
                  estado:    consultaEdit.estado,
                  updated_at:new Date().toISOString()
                }).eq('id',consultaSelected.id)
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
        <CampanaModal
          onClose={()=>setShowCampana(false)}
        />
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
