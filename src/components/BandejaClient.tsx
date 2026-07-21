'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
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

// LeadEstado: valores válidos de status en amat_loan_leads
type LeadEstado = 'new' | 'contacted' | 'contactado' | 'closed' | 'rejected' | 'not_interested' | 'sin_respuesta' | 'resolved' | 'unresolved' | 'finalizado'

const USERS: SysUser[] = [
  { id:'1',  username:'Walter',   password:'Walter#2026',  displayName:'Walter',   role:'Administrador', initials:'WA', color:'#B45309' },
  { id:'2',  username:'Muse',     password:'Muse#2026',    displayName:'Muse',     role:'Administrador', initials:'MU', color:'#92400E' },
  { id:'9',  username:'Nicolas',  password:'Nicolas2026',  displayName:'Nicolas',  role:'Administrador', initials:'NI', color:'#1D4ED8' },
  { id:'3',  username:'Valentin', password:'Mutual2026',   displayName:'Valentin', role:'Vendedor',      initials:'VA', color:'#D97706' },
  { id:'4',  username:'Juan',     password:'Mutual2026',   displayName:'Juan',     role:'Vendedor',      initials:'JU', color:'#F59E0B' },
  { id:'5',  username:'Eliseo',   password:'Mutual2026',   displayName:'Eliseo',   role:'Vendedor',      initials:'EL', color:'#10B981' },
  { id:'6',  username:'Maxi',     password:'Mutual2026',   displayName:'Maxi',     role:'Vendedor',      initials:'MX', color:'#3B82F6' },
  { id:'7',  username:'Facundo',  password:'Mutual2026',   displayName:'Facundo',  role:'Vendedor',      initials:'FA', color:'#8B5CF6' },
  { id:'8',  username:'Emanuel',  password:'Mutual2026',   displayName:'Emanuel',  role:'Cobranza',      initials:'EM', color:'#7C3AED' },
  { id:'10', username:'Matias',   password:'Mutual2026',   displayName:'Matias',   role:'Vendedor',      initials:'MT', color:'#0EA5E9' },
  { id:'11', username:'Gonzalo',  password:'Mutual2026',   displayName:'Gonzalo',  role:'Vendedor',      initials:'GO', color:'#06B6D4' },
  { id:'12', username:'Mariano',  password:'Mutual2026',   displayName:'Mariano',  role:'Administrador', initials:'MR', color:'#EC4899' },
  { id:'13', username:'VENTAS_MG1', password:'Mg2026', displayName:'Ventas MG1', role:'Vendedor', initials:'M1', color:'#F97316' },
  { id:'14', username:'VENTAS_MG2', password:'Mg2026', displayName:'Ventas MG2', role:'Vendedor', initials:'M2', color:'#84CC16' },
  { id:'15', username:'VENTAS_MG3', password:'Mg2026', displayName:'Ventas MG3', role:'Vendedor', initials:'M3', color:'#06B6D4' },
]

// ─────────────────────────────────────────────
//  CONFIGURACIÓN DE ESTADOS Y ETIQUETAS
// ─────────────────────────────────────────────
// ═══ MODELO CANÓNICO DE ESTADOS ═══
// Ventas:    pendiente (new/contacted) → vendido (closed) / rechazado (rejected) / no interesado (not_interested)
// Cobranzas: pendiente (new/contacted) → resuelto (resolved) / no resuelto (unresolved)
// Todo estado final implica archived: true — un lead archivado nunca vuelve a bandeja/cola.
const ESTADOS_FINALES = ['closed','rejected','not_interested','resolved','unresolved','sin_respuesta']

const LEAD_STATUS: Record<string,{label:string;color:string;bg:string;text:string;desc:string}> = {
  new:           { label:'Cola',           color:'#F59E0B', bg:'#FFFBEB', text:'#92400E', desc:'En cola, sin tomar' },
  contacted:     { label:'Pendiente',      color:'#3B82F6', bg:'#EFF6FF', text:'#1D4ED8', desc:'En bandeja del operador' },
  not_interested:{ label:'No interesado',  color:'#6B7280', bg:'#F9FAFB', text:'#374151', desc:'No quiere la oferta' },
  sin_respuesta: { label:'Sin respuesta',  color:'#94A3B8', bg:'#F1F5F9', text:'#475569', desc:'No contestó los mensajes' },
  contactado:    { label:'Contactado',     color:'#3B82F6', bg:'#EFF6FF', text:'#1D4ED8', desc:'Respondió, en conversación activa' },
  rejected:      { label:'Rechazado',      color:'#EF4444', bg:'#FEF2F2', text:'#991B1B', desc:'No cumple requisitos' },
  closed:        { label:'Vendido',        color:'#10B981', bg:'#ECFDF5', text:'#065F46', desc:'Operación concretada' },
  // legacy — solo para mostrar registros históricos, no seleccionables
  finalizado:    { label:'Cerrado',        color:'#6B7280', bg:'#F3F4F6', text:'#374151', desc:'Conversación finalizada (histórico)' },
  resolved:      { label:'Resuelto',       color:'#10B981', bg:'#ECFDF5', text:'#065F46', desc:'Caso resuelto' },
  unresolved:    { label:'No resuelto',    color:'#EF4444', bg:'#FEF2F2', text:'#991B1B', desc:'No se pudo resolver' },
}

// Opciones seleccionables en el modal Cambiar estado — por flujo, sin duplicados
const OPCIONES_VENTAS    = ['closed','rejected','not_interested','sin_respuesta'] as const
const OPCIONES_VENTAS_INTERMEDIOS = ['contactado'] as const
const OPCIONES_COBRANZAS = ['resolved','unresolved'] as const

// Mapeo canónico único: status de amat_loan_leads → estado de amat_consultas
const STATUS_A_CONSULTA: Record<string,string> = {
  new:            'cola',
  contacted:      'pendiente',
  contactado:     'contactado',
  closed:         'resuelto',
  resolved:       'resuelto',
  rejected:       'cerrado_rechazado',
  not_interested: 'cerrado_no_interesado',
  sin_respuesta:  'cerrado',
  unresolved:     'cerrado',
  finalizado:     'cerrado',
}

// Estados exclusivos para flujo COBRANZA
const COBRANZA_STATUS: Record<string,{label:string;color:string;bg:string;text:string;desc:string}> = {
  new:       { label:'Pendiente',   color:'#F59E0B', bg:'#FFFBEB', text:'#92400E', desc:'En cola, sin tomar' },
  contacted: { label:'Pendiente',   color:'#F59E0B', bg:'#FFFBEB', text:'#92400E', desc:'En bandeja del operador' },
  resolved:  { label:'Resuelto',    color:'#10B981', bg:'#ECFDF5', text:'#065F46', desc:'Caso resuelto exitosamente' },
  unresolved:{ label:'No resuelto', color:'#EF4444', bg:'#FEF2F2', text:'#991B1B', desc:'No se pudo resolver' },
  finalizado:{ label:'Cerrado',     color:'#6B7280', bg:'#F3F4F6', text:'#374151', desc:'Conversación finalizada (histórico)' },
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
  'EJERCITO ARGENTINO',
  'GENDARMERIA',
  'FUERZAS ARMADAS',
  'OTRA REPARTICION',
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
type Tab = 'bandeja' | 'consultas' | 'base' | 'reportes'

// ─────────────────────────────────────────────
//  MENSAJES DE EJEMPLO (simulados del bot)
// ─────────────────────────────────────────────

// ── Grilla AMAT para calcular valor de cuota ──────────────
const TABLAS_CUOTA: Record<number, Record<number,number>> = {
  6:  {100000:20833.58,110000:22916.94,150000:31250.37,200000:41667.16,250000:52083.95,300000:62500.74,350000:72917.53,400000:83334.32,450000:93751.11,500000:104167.9},
  12: {30000:3606.13,40000:4808.17,50000:6010.21,60000:7212.25,70000:8414.3,80000:9616.64,90000:10818.38,100000:12020.42,110000:13222.46,120000:14424.51,130000:15626.55,140000:16828.59,150000:19030.63,160000:19232.68,170000:20434.72,180000:21636.76,190000:22838.8,200000:24040.84,210000:25242.89,220000:26444.93,230000:27646.97,240000:28848.01,250000:30051.06,260000:31253.1,270000:32455.14,280000:33657.18,290000:34859.22,300000:36061.27,310000:37263.31,320000:38465.35,330000:39667.39,340000:40869.44,350000:42071.48,360000:43273.52,370000:44475.56,380000:45667.6,390000:46879.65,400000:48081.69,410000:49283.73,420000:50485.77,430000:51687.82,440000:52889.86,450000:54091.9,460000:55293.94,470000:56495.98,480000:57698.03,490000:59800.07,500000:60102.11,510000:61304.15,520000:62506.2,530000:63708.24,540000:64910.28,550000:66112.32,560000:67314.36,570000:68516.41,580000:69718.45,590000:70920.49,600000:72112.53,610000:73324.58,620000:74526.62,630000:75728.66,640000:76930.7,650000:78132.74,660000:79334.79,670000:80536.83,680000:81738.87,690000:82940.91,700000:84142.96,710000:85345.0,720000:86547.04,730000:87749.08,740000:88951.12,750000:90153.17,760000:91355.21,770000:92557.25,780000:93759.29,790000:94961.34,800000:96163.38,810000:97365.42,820000:98567.46,830000:99769.5,840000:100971.55,850000:102173.59,860000:103375.63,870000:104577.67,880000:105779.72,890000:106981.76,900000:108183.8,910000:109385.84,920000:110587.88,930000:111789.93,940000:112991.97,950000:114194.01,960000:115396.05,970000:116598.1,980000:117800.14,990000:119002.18,1000000:120204.22,1050000:126214.43,1100000:132224.64,1150000:138234.86,1200000:144245.07,1250000:150255.28,1300000:156265.49,1350000:162275.7,1400000:168285.91,1450000:174296.12,1500000:180306.33},
  18: {30000:2771.82,40000:3695.76,50000:4619.7,60000:5543.64,70000:6467.58,80000:7391.51,90000:8315.45,100000:9239.39,110000:10163.33,120000:11087.27,130000:12011.21,140000:12935.15,150000:13859.09,160000:14783.03,170000:15706.87,180000:16630.91,190000:17554.85,200000:18478.79,210000:19402.73,220000:20326.67,230000:21250.6,240000:22174.54,250000:23098.48,260000:24022.42,270000:24946.36,280000:25870.3,290000:26794.24,300000:27718.18,310000:28642.12,320000:29566.06,330000:30490.0,340000:31413.94,350000:32337.88,360000:33261.82,370000:34185.76,380000:35109.69,390000:36033.63,400000:36957.57,410000:37881.51,420000:38805.45,430000:39729.39,440000:40653.33,450000:41557.27,460000:42501.21,470000:43425.15,480000:44349.09,490000:45273.03,500000:46196.97,510000:47120.91,520000:48044.85,530000:48968.78,540000:49892.72,550000:50816.66,560000:51740.6,570000:52664.54,580000:53588.48,590000:54512.42,600000:55436.36,610000:56360.3,620000:57284.24,630000:58208.18,640000:59132.12,650000:60056.06,660000:60980.0,670000:61903.94,680000:62827.87,690000:63751.81,700000:64675.75,710000:65599.69,720000:66523.63,730000:67447.57,740000:68371.51,750000:69295.45,760000:70219.39,770000:71143.33,780000:72067.27,790000:72991.21,800000:73915.15,810000:74839.09,820000:75763.03,830000:76686.96,840000:77610.9,850000:78534.84,860000:79458.78,870000:80382.72,880000:81306.66,890000:82230.6,900000:83154.54,910000:84078.48,920000:85002.42,930000:85926.36,940000:86850.3,950000:87774.24,960000:88698.18,970000:89622.12,980000:90546.05,990000:91469.99,1000000:92393.93,1050000:97013.63,1100000:101633.33,1150000:106253.02,1200000:110872.72,1250000:115492.42,1300000:120112.11,1350000:124731.81,1400000:129351.51,1450000:133971.2,1500000:138590.9},
  24: {30000:2376.31,40000:3168.41,50000:3960.51,60000:4752.62,70000:5544.72,80000:6336.82,90000:7128.92,100000:7921.03,110000:8713.13,120000:9505.23,130000:10297.33,140000:11089.44,150000:11881.54,160000:12673.64,170000:13465.74,180000:14257.85,190000:15049.95,200000:15842.05,210000:16634.15,220000:17426.26,230000:18218.36,240000:19010.46,250000:19802.56,260000:20594.67,270000:21386.77,280000:22178.87,290000:22970.98,300000:23736.08,310000:24555.18,320000:25347.28,330000:26139.39,340000:26931.49,350000:27723.59,360000:28515.69,370000:29307.8,380000:30099.9,390000:30892.0,400000:31684.1,410000:32476.21,420000:33268.31,430000:34060.41,440000:34852.51,450000:35644.62,460000:36436.72,470000:37228.82,480000:38020.92,490000:38813.03,500000:39605.13,510000:40397.23,520000:41189.33,530000:41981.44,540000:42773.54,550000:43565.64,560000:44357.75,570000:45149.85,580000:45941.95,590000:46734.05,600000:47526.16,610000:48318.26,620000:49110.36,630000:49902.46,640000:50694.57,650000:51486.67,660000:52278.77,670000:53070.87,680000:53862.98,690000:54655.08,700000:55447.18,710000:56239.28,720000:57031.39,730000:57823.49,740000:58615.59,750000:59407.69,760000:60199.8,770000:60991.9,780000:61784.0,790000:62576.1,800000:63368.21,810000:64160.31,820000:64952.41,830000:65744.52,840000:66536.62,850000:67328.72,860000:68120.82,870000:68912.93,880000:69705.03,890000:70497.13,900000:71289.23,910000:72081.34,920000:72873.44,930000:73665.54,940000:74457.64,950000:75249.75,960000:76041.85,970000:76833.95,980000:77626.05,990000:78418.16,1000000:79210.26,1050000:83170.77,1100000:87131.29,1150000:91091.8,1200000:95052.31,1250000:99012.82,1300000:102973.34,1350000:106933.85,1400000:110894.36,1450000:114854.88,1500000:118815.39},
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


// ─────────────────────────────────────────────
//  HELPER: safeQuery
//  Wrapper para todas las operaciones Supabase.
//  - Captura errores y los loguea con contexto
//  - Devuelve { data, error, ok } siempre consistente
//  - El caller decide qué mostrar al usuario según ok
// ─────────────────────────────────────────────
type SafeResult<T> = { data: T | null; error: string | null; ok: boolean }

async function safeQuery<T>(
  context: string,
  fn: () => Promise<{ data: T | null; error: any }>
): Promise<SafeResult<T>> {
  try {
    const { data, error } = await fn()
    if (error) {
      console.error(`[${context}] Error Supabase:`, error)
      return { data: null, error: error.message || 'Error desconocido', ok: false }
    }
    return { data, error: null, ok: true }
  } catch (e: any) {
    console.error(`[${context}] Excepción:`, e)
    return { data: null, error: e?.message || 'Error de red', ok: false }
  }
}

// Variante para operaciones sin retorno de datos (UPDATE/INSERT donde no necesitamos data)
async function safeRun(
  context: string,
  fn: () => Promise<{ error: any }>
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await fn()
    if (error) {
      console.error(`[${context}] Error Supabase:`, error)
      return { ok: false, error: error.message || 'Error desconocido' }
    }
    return { ok: true, error: null }
  } catch (e: any) {
    console.error(`[${context}] Excepción:`, e)
    return { ok: false, error: e?.message || 'Error de red' }
  }
}

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
  const [rememberMe, setRememberMe]       = useState(false)

  // DATA — consultas (llegadas del bot)
  const [consultas, setConsultas]           = useState<any[]>([])
  const [consultasLoading, setConsultasLoading] = useState(false)
  const [consultaSelected, setConsultaSelected] = useState<any|null>(null)
  const [showConsultaModal, setShowConsultaModal] = useState(false)
  const [consultaEdit, setConsultaEdit]     = useState<ConsultaEditForm>({vendedor:'',situacion:'',estado:'pendiente'})

  // Filtros consultas
  const [cFlujo, setCFlujo]     = useState('all')
  const [cEstado, setCEstado]   = useState('all')
  const [cOrden, setCOrden]     = useState<'desc'|'asc'>('desc')
  const [campanas, setCampanas]   = useState<Record<string,string>>({})
  const [cRep, setCRep]         = useState('all')
  const [cSearch, setCSearch]   = useState('')
  const [cSearchInput, setCSearchInput] = useState('')

  // DATA — bandeja (solo leads que tienen conversación activa con el bot)
  const [botLeads, setBotLeads]           = useState<LoanLead[]>([])
  const [messages, setMessages]           = useState<Message[]>(initialMessages)
  const [currentChatMsgs, setCurrentChatMsgs] = useState<Message[]>([])

  // DATA — base de contactos (server-side paginado)
  const [baseLeads, setBaseLeads]         = useState<LoanLead[]>([])
  const [baseTotal, setBaseTotal]         = useState(0)
  const [baseLoading, setBaseLoading]     = useState(false)

  // UI
  const [tab, setTab]                     = useState<Tab>('bandeja')
  const [tabLoading, setTabLoading]       = useState(false)
  const [selectedPhone, setSelectedPhone] = useState<string|null>(null)
  const [replyText, setReplyText]         = useState('')
  const [sending, setSending]             = useState(false)

  // Filtros bandeja
  const [bandejaSearch, setBandejaSearch] = useState('')
  const [soloNoLeidos, setSoloNoLeidos]   = useState(false)
  const [vistaMode, setVistaMode]         = useState<'cola'|'mis_chats'>('cola')
  // Mapa phone → flujo (solicitud|cobranzas) cargado de amat_consultas
  const [flujoMap, setFlujoMap]           = useState<Record<string,string>>({})
  const [colaPage, setColaPage]           = useState(50)
  const [colaTotal, setColaTotal]         = useState(0)
  const [colaLeadsState, setColaLeadsState] = useState<LoanLead[]>([])
  const [colaMenu, setColaMenu]           = useState<LoanLead|null>(null)
  const [editandoFlujo, setEditandoFlujo]   = useState(false)
  const [colaMenuRef, setColaMenuRef]     = useState<{x:number,y:number}|null>(null)
  const [consultasTotal, setConsultasTotal] = useState(0)
  const [showFinalizarModal, setShowFinalizarModal] = useState(false)
  const [finalizarEstado, setFinalizarEstado]       = useState('')
  const [finalizarNota, setFinalizarNota]           = useState('')
  const [cerradosHoyCount, setCerradosHoyCount]     = useState(0)
  const [reporteLeads, setReporteLeads]             = useState<LoanLead[]>([])
  const [pipelineFlujoMap, setPipelineFlujoMap]     = useState<Record<string,string>>({})
  const [reporteMode, setReporteMode]               = useState<'ventas'|'cobranzas'>('ventas')
  const [reportePeriodo, setReportePeriodo]           = useState('mes_actual')
  const [reporteDesde, setReporteDesde]               = useState('')
  const [reporteHasta, setReporteHasta]               = useState('')
  const [showVentaModal, setShowVentaModal]         = useState(false)
  const [ventaForm, setVentaForm]         = useState<VentaForm>({entidad:'',linea:'',reparticion:'',monto:'',cuotas:'',valor_cuota:'',notas:''})

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
  const baseSearchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  const cSearchTimer    = useRef<ReturnType<typeof setTimeout>|null>(null)
  // Contadores de request — cada carga nueva incrementa el contador.
  // Si al llegar la respuesta el contador cambió, la respuesta es obsoleta y se descarta.
  const loadBaseSeq      = useRef(0)
  const loadConsultasSeq = useRef(0)
  const [mounted, setMounted] = useState(false)

  useEffect(()=>{
    setMounted(true)
    const savedUser = localStorage.getItem('amat_remember_user')
    const savedPass = localStorage.getItem('amat_remember_pass')
    if(savedUser && savedPass) {
      setLoginUser(savedUser)
      setLoginPass(savedPass)
      setRememberMe(true)
    }
  },[])
  const chatScrollRef  = useRef<HTMLDivElement>(null)
  const isAtBottom     = useRef(true)
  const prevPhone      = useRef<string|null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMsgCount   = useRef(0)

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

  useEffect(()=>{
    const phoneChanged = prevPhone.current !== selectedPhone
    prevPhone.current = selectedPhone
    if(phoneChanged) {
      // Cambio de chat: bajar instantáneo sin animación
      scrollToBottom('instant' as ScrollBehavior)
      prevMsgCount.current = messages.length
      return
    }
    const newMsgs = messages.length - prevMsgCount.current
    prevMsgCount.current = messages.length
    if(newMsgs > 0 && !isAtBottom.current) {
      // Llegaron mensajes y el usuario está leyendo arriba: mostrar badge
      setUnreadCount(c => c + newMsgs)
    } else if(isAtBottom.current) {
      // Ya estaba abajo: seguir bajando automático
      scrollToBottom('smooth')
    }
  },[messages, selectedPhone])
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
        setMessages(prev=>{
          if(prev.find(m=>m.id===msg.id)) return prev
          if(msg.direction==='out') {
            const sinTemp = prev.filter(m=>!(String(m.id).startsWith('temp_')&&m.phone_number===msg.phone_number&&m.body===msg.body))
            return [...sinTemp, msg]
          }
          return [...prev, msg]
        })
        // Actualizar currentChatMsgs si el mensaje es del chat activo
        setCurrentChatMsgs(prev=>{
          if(prev.length===0||prev[0]?.phone_number!==msg.phone_number) return prev
          if(prev.find(m=>m.id===msg.id)) return prev
          if(msg.direction==='out') {
            const sinTemp = prev.filter(m=>!(String(m.id).startsWith('temp_')&&m.body===msg.body))
            return [...sinTemp, msg]
          }
          return [...prev, msg]
        })
        // FIX 1: doble check con estado fresco antes de insertar el lead
        setBotLeads(prev=>{
          if(!prev.find(l=>l.phone_number===msg.phone_number)){
            supabase.from('amat_loan_leads').select('*').eq('phone_number',msg.phone_number).single()
              .then(({data})=>{
                if(data) {
                  const lead = data as LoanLead
                  const status = (lead.status || '') as string

                  // Reactivación cuando la persona vuelve a escribir:
                  // - closed (vendido) → entra a cola SIN cambiar estado
                  // - todos los demás estados finales → resetear a new y volver a cola
                  if(ESTADOS_FINALES.includes(status)) {
                    // Vendido y Rechazado: NO se reactivan nunca
                    if(status === 'closed' || status === 'rejected') return

                    // not_interested, sin_respuesta, unresolved → resetear a new y volver a cola
                    supabase.from('amat_loan_leads')
                      .update({ status:'new', archived:false, assigned_to:undefined as any, updated_at:new Date().toISOString() })
                      .eq('id', lead.id)
                      .then(()=>{
                        const r = {...lead, status:'new', archived:false, assigned_to:undefined as any}
                        setColaLeadsState(p2=>p2.find(l=>l.id===lead.id)?p2:[r as LoanLead,...p2])
                        setColaTotal(t=>t+1)
                      })
                    if(lead.phone_number) {
                      supabase.from('amat_consultas')
                        .update({ estado:'cola', updated_at:new Date().toISOString() })
                        .eq('phone', lead.phone_number)
                    }
                    supabase.from('amat_consultas').select('phone,flujo').eq('phone',msg.phone_number).single()
                      .then(({data:cdata})=>{ if(cdata?.phone) setFlujoMap(prev=>({...prev,[cdata.phone]:cdata.flujo||'solicitud'})) })
                    return
                  }

                  // Lead activo normal — agregar a cola si no está ya
                  if((lead as any).archived) return
                  setColaLeadsState(p2=>p2.find(l=>l.phone_number===lead.phone_number)?p2:[lead,...p2])
                  setColaTotal(t=>t+1)
                  supabase.from('amat_consultas').select('phone,flujo').eq('phone',msg.phone_number).single()
                    .then(({data:cdata})=>{ if(cdata?.phone) setFlujoMap(prev=>({...prev,[cdata.phone]:cdata.flujo||'solicitud'})) })
                }
              })
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
        const EXCLUIDOS = ['finalizado','rejected','not_interested','resolved','unresolved','sin_respuesta','closed']
        if(p.eventType==='UPDATE'){
          if(EXCLUIDOS.includes(updated.status||'') || (updated as any).archived){
            // Solo sacar si realmente estaba en la lista — evita operaciones innecesarias
            setBotLeads(prev=>{
              const existe = prev.find(l=>l.id===updated.id)
              if(!existe) return prev
              return prev.filter(l=>l.id!==updated.id)
            })
          } else {
            // Solo actualizar si ya estaba — nunca agregar leads nuevos por este camino
            setBotLeads(prev=>{
              const existe = prev.find(l=>l.id===updated.id)
              if(!existe) return prev
              return prev.map(l=>l.id===updated.id?updated:l)
            })
          }
          setBaseLeads(prev=>prev.map(l=>l.id===updated.id?updated:l))
        } else if(p.eventType==='INSERT'){
          // Solo agregar a cola si es new/contacted y no archivado
          if(['new','contacted'].includes(updated.status||'') && !(updated as any).archived && !updated.assigned_to) {
            setColaLeadsState(prev => prev.find(l=>l.id===updated.id) ? prev : [updated as LoanLead, ...prev])
            setColaTotal(t => t + 1)
          }
        }
      }).subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[])

  // Realtime consultas
  useEffect(()=>{
    const ch=supabase.channel('rt-consultas')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'amat_consultas'},p=>{
        setConsultas(prev=>[p.new as any,...prev])
        const c = p.new as any
        if(c.phone) setFlujoMap(prev=>({...prev,[c.phone]:c.flujo||'solicitud'}))
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'amat_consultas'},p=>{
        setConsultas(prev=>prev.map(c=>c.id===(p.new as any).id?p.new as any:c))
        const c = p.new as any
        if(c.phone) setFlujoMap(prev=>({...prev,[c.phone]:c.flujo||'solicitud'}))
      })
      .subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[])

  // Cargar leads de la bandeja (solo los que tienen mensajes)
  useEffect(()=>{
    const hoy = new Date().toISOString().split('T')[0]
    supabase.from('amat_loan_leads')
      .select('id,status,updated_at')
      .eq('status','closed')
      .gte('updated_at', hoy + 'T00:00:00.000Z')
      .then(({data})=>{ if(data) setCerradosHoyCount(data.length) })

    const phones=[...new Set(initialMessages.map(m=>m.phone_number))]
    ; if(phones.length===0){ ; return }

    // Supabase tiene límite de ~1000 en .in() — hacemos lotes de 200
    const BATCH = 200
    const chunks = (arr: string[]) => Array.from({length: Math.ceil(arr.length/BATCH)}, (_,i) => arr.slice(i*BATCH,(i+1)*BATCH))

    // Cargar leads en lotes
    Promise.all(chunks(phones).map(chunk =>
      supabase.from('amat_loan_leads')
        .select('*')
        .in('phone_number', chunk)
        .not('status', 'in', '("finalizado","rejected","not_interested","resolved","unresolved")')
        .eq('archived', false)
        .then(({data}) => data || [])
    )).then(results => {
      const all = results.flat() as LoanLead[]
      const seen = new Set<string>()
      const unique = all.filter(l => {
        const key = l.phone_number || String(l.id)
        if(seen.has(key)) return false
        seen.add(key)
        return true
      })
      setBotLeads(prev => {
        const merged = [...unique]
        prev.forEach(l => { if(!merged.find(x=>x.id===l.id)) merged.push(l) })
                return merged
      })
    })

    // Cargar flujos en lotes
    Promise.all(chunks(phones).map(chunk =>
      supabase.from('amat_consultas')
        .select('phone,flujo')
        .in('phone', chunk)
        .then(({data}) => data || [])
    )).then(results => {
      const all = results.flat()
      if(all.length){
        const map: Record<string,string> = {}
        all.forEach((r:any)=>{ if(r.phone) map[r.phone]=r.flujo||'solicitud' })
        setFlujoMap(map)
      }
    })
  },[initialMessages])

  // ─────────────────────────────────────────────
  //  CARGAR CONSULTAS desde amat_consultas
  // ─────────────────────────────────────────────

  const cSearchRef = useRef(cSearch)
  const cFlujoRef  = useRef(cFlujo)
  const cEstadoRef = useRef(cEstado)
  const cRepRef    = useRef(cRep)
  const cOrdenRef  = useRef(cOrden)

  useEffect(()=>{ cSearchRef.current = cSearch },[cSearch])
  useEffect(()=>{ cFlujoRef.current  = cFlujo  },[cFlujo])
  useEffect(()=>{ cEstadoRef.current = cEstado },[cEstado])
  useEffect(()=>{ cRepRef.current    = cRep    },[cRep])
  useEffect(()=>{ cOrdenRef.current  = cOrden  },[cOrden])

  const loadConsultas = async (
    repOverride?: string,
    flujoOverride?: string,
    estadoOverride?: string,
    searchOverride?: string,
  ) => {
    setConsultasLoading(true)
    const seq    = ++loadConsultasSeq.current
    const search = searchOverride ?? cSearchRef.current
    const flujo  = flujoOverride  ?? cFlujoRef.current
    const estado = estadoOverride ?? cEstadoRef.current
    const rep    = repOverride    ?? cRepRef.current

    // Query principal de consultas — solo columnas necesarias, límite 500, count real
    let q = supabase
      .from('amat_consultas')
      .select('id,phone,nombre_apellido,dni,reparticion_label,flujo,prestacion,afiliado,vendedor,situacion,estado,created_at,updated_at', { count: 'exact' })
      .order('created_at', { ascending: cOrdenRef.current === 'asc' })
      .limit(500)
    if (search)           q = q.or(`nombre_apellido.ilike.%${search}%,dni.ilike.%${search}%,phone.ilike.%${search}%`)
    if (flujo !== 'all')  q = q.eq('flujo', flujo)
    if (estado === 'cola') {
      q = q.eq('estado', 'cola')
    } else if (estado === 'pendiente') {
      q = q.eq('estado', 'pendiente')
    } else if (estado !== 'all') {
      q = q.eq('estado', estado)
    }
    if (rep !== 'all')    q = q.ilike('reparticion_label', rep)

    // Query de leads sin consulta — paralela, SIEMPRE con el mismo límite
    // para que el listado sea consistente con y sin filtros
    const leadsPromise = (() => {
      let lq = supabase
        .from('amat_loan_leads')
        .select('id,phone_number,full_name,dni,reparticion,assigned_to,status,created_at')
        .order('created_at', { ascending: false })
        .limit(300)
      if(search) lq = lq.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%,phone_number.ilike.%${search}%`)
      if(rep !== 'all') lq = lq.ilike('reparticion', `%${rep}%`)
      return lq
    })()

    // Ejecutar en paralelo
    let data: any[] | null = null
    let leadsData: any[] | null = null
    let count: number | null = null

    try {
      const [consultasRes, leadsRes] = await Promise.all([q, leadsPromise])
      if(consultasRes.error) throw consultasRes.error
      // Si llegó una carga más nueva mientras esperábamos, descartar esta respuesta
      if(seq !== loadConsultasSeq.current) return
      data = consultasRes.data
      count = consultasRes.count
      leadsData = leadsRes.data
    } catch(e: any) {
      if(seq !== loadConsultasSeq.current) return
      console.error('[loadConsultas] Error Supabase:', e)
      alert('❌ Error al cargar las consultas. Intentá de nuevo.')
      setConsultasLoading(false)
      return
    }

    setConsultasTotal(count || 0)

    // Deduplicar con Set — O(n) en vez de O(n²)
    const phonesConConsulta = new Set((data||[]).map((c:any) => c.phone).filter(Boolean))
    const statusMap: Record<string,string> = { new:'cola', contacted:'pendiente', contactado:'contactado', closed:'resuelto', resolved:'resuelto', rejected:'cerrado_rechazado', not_interested:'cerrado_no_interesado', sin_respuesta:'cerrado', unresolved:'cerrado', finalizado:'cerrado' }

    const sinConsulta = (leadsData||[])
      .filter((l:any) => l.phone_number && !phonesConConsulta.has(l.phone_number))
      .map((l:any) => ({
        id: `lead_${l.id}`,
        phone: l.phone_number,
        nombre_apellido: l.full_name,
        dni: l.dni,
        reparticion_label: l.reparticion,
        flujo: flujoMap[l.phone_number||'']||'solicitud',
        prestacion: null, afiliado: null,
        vendedor: l.assigned_to, situacion: null,
        estado: statusMap[l.status||''] || l.status,
        created_at: l.created_at,
        _esLeadSinConsulta: true,
      }))
      .filter((c:any) => flujo === 'all' || c.flujo === flujo)
      .filter((c:any) => estado === 'all' || c.estado === estado)

    // Deduplicar consultas — O(n) con Map
    const todasConsultas = [...sinConsulta, ...((data as any[]) || [])]
    const seenPhones = new Map<string, any>()
    for(const c of todasConsultas) {
      const phone = c.phone || ''
      if(!phone) continue
      const existing = seenPhones.get(phone)
      if(!existing || new Date(c.created_at||0) > new Date(existing.created_at||0)) {
        seenPhones.set(phone, c)
      }
    }
    const ordenadas = [...seenPhones.values()].sort((a:any,b:any)=>{
      const ta = new Date(a.created_at||0).getTime()
      const tb = new Date(b.created_at||0).getTime()
      return cOrdenRef.current === 'asc' ? ta - tb : tb - ta
    })
    setConsultas(ordenadas)
    setConsultasLoading(false)
  }

  // useEffect con debounce — evita que múltiples dependencias disparen cargas simultáneas
  const consultasTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  useEffect(()=>{\
    if(tab==='reportes') loadReportes(reportePeriodo, reporteDesde, reporteHasta)
    if(tab==='consultas') {
      // Spinner inmediato — sin esto se ve un flash de los datos viejos durante el debounce
      setConsultasLoading(true)
      // Cancelar cualquier carga pendiente antes de arrancar una nueva
      if(consultasTimer.current) clearTimeout(consultasTimer.current)
      consultasTimer.current = setTimeout(()=>{
        loadConsultas(cRep, cFlujo, cEstado, cSearch)
        supabase.from('amat_campanas').select('telefono,fecha')
          .gte('fecha', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
          .order('fecha',{ascending:false})
          .limit(5000)
          .then(({data})=>{
            if(!data) return
            const map: Record<string,string> = {}
            data.forEach((r:any)=>{ if(r.telefono && !map[r.telefono]) map[r.telefono]=r.fecha })
            setCampanas(map)
          })
      }, 50)
    }
    // Cleanup: cancelar timer pendiente si el componente se desmonta o cambian las deps
    return ()=>{
      if(consultasTimer.current) clearTimeout(consultasTimer.current)
    }
  },[tab, cSearch, cFlujo, cEstado, cRep, cOrden]) // eslint-disable-line


  // Cargar datos de reportes
  const loadReportes = async (
  periodo?: string,
  desdeCustom?: string,
  hastaCustom?: string
) => {
  const p = periodo ?? reportePeriodo

  // Calcular rango de fechas según el período
  const ahora = new Date()
  let desde: string | null = null
  let hasta: string | null = null

  if (p === 'mes_actual') {
    desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
    hasta = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString()
  } else if (p === 'mes_pasado') {
    desde = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString()
    hasta = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59).toISOString()
  } else if (p === '3_meses') {
    desde = new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1).toISOString()
    hasta = ahora.toISOString()
  } else if (p === '6_meses') {
    desde = new Date(ahora.getFullYear(), ahora.getMonth() - 5, 1).toISOString()
    hasta = ahora.toISOString()
  } else if (p === 'anio_actual') {
    desde = new Date(ahora.getFullYear(), 0, 1).toISOString()
    hasta = ahora.toISOString()
  } else if (p === 'custom') {
    desde = desdeCustom ? new Date(desdeCustom).toISOString() : null
    hasta = hastaCustom ? new Date(hastaCustom + 'T23:59:59').toISOString() : null
  }
  // 'historico' → sin filtro de fecha

  let allData: any[] = []
  let from = 0
  let batches = 0
  const MAX_BATCHES = 20

  while (batches < MAX_BATCHES) {
    let q = supabase
      .from('amat_loan_leads')
      .select('id, status, reparticion, assigned_to, updated_at, created_at, phone_number, entidad, linea, monto_solicitado, cant_cuotas, valor_cuota')
      .order('updated_at', { ascending: false })
      .range(from, from + 999)
    if (desde) q = q.gte('updated_at', desde)
    if (hasta) q = q.lte('updated_at', hasta)

    const { data } = await q
    if (!data || data.length === 0) break
    allData = [...allData, ...data]
    if (data.length < 1000) break
    from += 1000
    batches++
  }

  setReporteLeads(allData as LoanLead[])
  const hoy = new Date().toDateString()
  setCerradosHoyCount(allData.filter((l: any) => l.status === 'closed' && new Date(l.updated_at).toDateString() === hoy).length)

  // Cargar flujo por teléfono para separar ventas/cobranzas en los reportes
  const phones = allData.map((l: any) => l.phone_number).filter(Boolean)
  if (phones.length > 0) {
    const BATCH = 200
    const chunks = Array.from({ length: Math.ceil(phones.length / BATCH) }, (_, i) =>
      phones.slice(i * BATCH, (i + 1) * BATCH)
    )
    const results = await Promise.all(
      chunks.map(chunk =>
        supabase.from('amat_consultas').select('phone,flujo').in('phone', chunk).then(({ data }) => data || [])
      )
    )
    const map: Record<string, string> = {}
    results.flat().forEach((r: any) => { if (r.phone) map[r.phone] = r.flujo || 'solicitud' })
    setPipelineFlujoMap(map)
  }
}

  // Cargar base paginada
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
    const seq = ++loadBaseSeq.current
    const search   = baseSearchRef.current
    const rep      = baseRepRef.current
    const banco    = baseBancoRef.current
    const status   = baseStatusRef.current
    const tel      = baseTelRef.current
    const assigned = baseAssignedRef.current
    const page     = basePageRef.current

    let q=supabase.from('amat_loan_leads').select('id,phone_number,full_name,dni,reparticion,bank,status,assigned_to,created_at,updated_at,archived,email',{count:'exact'})
    if(search)           q=q.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%,phone_number.ilike.%${search}%`)
    if(rep!=='all')      q=q.ilike('reparticion',rep)
    if(banco!=='all')    q=q.eq('bank',banco)
    if(status==='pendiente') q=q.in('status',['new','contacted'])
    else if(status!=='all') q=q.eq('status',status)
    if(tel==='con')      q=q.not('phone_number','is',null).neq('phone_number','')
    if(tel==='sin')      q=q.or('phone_number.is.null,phone_number.eq.')
    if(assigned==='sin') q=q.is('assigned_to',null)
    else if(assigned!=='all') q=q.eq('assigned_to',assigned)
    q=q.order('updated_at',{ascending:false}).range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1)

    try {
      const {data, count, error} = await q
      if(error) throw error
      // Si llegó una carga más nueva mientras esperábamos, descartar esta respuesta
      if(seq !== loadBaseSeq.current) return
      setBaseLeads((data as LoanLead[])||[])
      setBaseTotal(count||0)
    } catch(e: any) {
      if(seq !== loadBaseSeq.current) return
      console.error('[loadBase] Error Supabase:', e)
      alert('❌ Error al cargar la base de contactos. Intentá de nuevo.')
    } finally {
      if(seq === loadBaseSeq.current) setBaseLoading(false)
    }
  }

  const baseMounted = useRef(false)
  useEffect(()=>{
    if(tab==='base') {
      baseMounted.current = false // resetear al cambiar de tab
      loadBase()
    }
  },[tab]) // eslint-disable-line

  useEffect(()=>{
    if(!baseMounted.current) { baseMounted.current = true; return }
    if(tab==='base') loadBase()
  },[baseSearch,baseRep,baseBanco,baseStatus,baseTel,baseAssigned,basePage]) // eslint-disable-line

  useEffect(()=>{
    if(tab==='bandeja'){
      let cancelado = false

      // Cargar mensajes: todos los de los últimos 30 días en lotes para no perder nada
      ;(async () => {
        const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        let allMsgs: Message[] = []
        let fromIdx = 0
        const BATCH = 1000
        const MAX_BATCHES = 10 // tope de seguridad: 10.000 mensajes máximo
        let batches = 0
        while(batches < MAX_BATCHES) {
          const { data: batch } = await supabase
            .from('amat_messages')
            .select('id,phone_number,body,direction,sender,created_at,media_url,media_type')
            .gte('created_at', desde)
            .order('created_at', { ascending: false })
            .range(fromIdx, fromIdx + BATCH - 1)
          if(!batch || batch.length === 0) break
          allMsgs = [...allMsgs, ...batch as Message[]]
          if(batch.length < BATCH) break
          fromIdx += BATCH
          batches++
        }
        if(!cancelado && allMsgs.length) setMessages(allMsgs)
      })()

      // Cargar leads asignados + cola en un solo async para evitar race conditions
      ;(async () => {
        // Count de cola (no bloquea)
        supabase.from('amat_loan_leads')
          .select('id', { count: 'exact', head: true })
          .is('assigned_to', null).eq('archived', false)
          .in('status', ['new','contacted'])
          .then(({ count }) => { if(!cancelado) setColaTotal(count || 0) })

        // Cargar en paralelo: leads asignados + cola
        // EXCLUIDOS debe coincidir exactamente con la lista del realtime para evitar
        // que leads cargados aquí sean borrados por el primer UPDATE que llegue
        const EXCLUIDOS = ['finalizado','rejected','not_interested','resolved','unresolved','sin_respuesta','closed']
        const [asignadosRes, colaRes] = await Promise.all([
          me ? supabase.from('amat_loan_leads').select('*')
            .eq('assigned_to', me.username).eq('archived', false)
            .not('status', 'in', `(${EXCLUIDOS.map(e=>`${e}`).join(',')})`)
            .order('updated_at', { ascending: false })
            : Promise.resolve({ data: [] }),
          supabase.from('amat_loan_leads').select('*')
            .is('assigned_to', null).eq('archived', false)
            .in('status', ['new','contacted'])
            .order('created_at', { ascending: true })
            .limit(50)
        ])

        if(cancelado) return

        // Leads asignados van a botLeads, cola va a colaLeadsState (estado independiente)
        const asignados = (asignadosRes.data || []) as LoanLead[]
        const cola = (colaRes.data || []) as LoanLead[]
        if(asignados.length) {
          setBotLeads(prev => {
            const merged = [...prev]
            asignados.forEach(lead => {
              if(!merged.find(l=>l.id===lead.id)) merged.push(lead)
            })
            return merged
          })
        }
        if(cola.length) {
          // Cargar flujo de cada lead de la cola para poder filtrar correctamente
          const phonesCol = cola.map((l:LoanLead)=>l.phone_number).filter(Boolean) as string[]
          if(phonesCol.length) {
            const BATCH = 200
            const chunks = Array.from({length:Math.ceil(phonesCol.length/BATCH)},(_,i)=>phonesCol.slice(i*BATCH,(i+1)*BATCH))
            Promise.all(chunks.map(chunk=>
              supabase.from('amat_consultas').select('phone,flujo').in('phone',chunk).then(({data})=>data||[])
            )).then(results=>{
              if(cancelado) return
              const flujoMapCola: Record<string,string> = {}
              results.flat().forEach((r:any)=>{ if(r.phone) flujoMapCola[r.phone]=r.flujo||'solicitud' })
              setFlujoMap(prev=>({...prev,...flujoMapCola}))
            })
          }
          setColaLeadsState(cola)
        }
      })()

      return () => { cancelado = true }
    }
  },[tab, me]) // eslint-disable-line

  // ── AUTH ──────────────────────────────────
  const handleLogin=()=>{
    if(locked) return
    const u=USERS.find(u=>u.username.toUpperCase()===loginUser.trim().toUpperCase()&&u.password===loginPass)
    if(u){
      setMe(u); setLoginErr(''); setAttempts(0)
      if(rememberMe){ localStorage.setItem('amat_remember_user',loginUser.trim().toUpperCase()); localStorage.setItem('amat_remember_pass',loginPass) }
      else { localStorage.removeItem('amat_remember_user'); localStorage.removeItem('amat_remember_pass') }
    }
    else{
      const a=attempts+1; setAttempts(a)
      if(a>=5){ setLocked(true); setCountdown(30); setLoginErr('Demasiados intentos. Bloqueado 30s.') }
      else setLoginErr(`Incorrecto. Intentos restantes: ${5-a}`)
    }
  }

  // ── ACCIONES ──────────────────────────────
  const sendReply=async()=>{
    if(!replyText.trim()||!selectedPhone||!me) return
    const text = replyText
    setReplyText('')  // limpiar input de inmediato para que no se sienta trabado
    setSending(true)
    // UI optimista: mostrar el mensaje al instante en ambos arrays
    const tempId = `temp_${Date.now()}`
    const tempMsg: Message = {
      id: tempId as any,
      phone_number: selectedPhone,
      body: text,
      direction: 'out',
      sender: me.username,
      created_at: new Date().toISOString(),
    } as Message
    setCurrentChatMsgs(prev => [...prev, tempMsg])
    setMessages(prev => [...prev, tempMsg])
    try {
      const controller = new AbortController()
      const timeout = setTimeout(()=>controller.abort(), 8000)
      await fetch('/api/send-message',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({phone:selectedPhone,text,senderName:me.username}),
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch(e) {
      // Si falla o timeout, restaurar el texto para que no se pierda
      setReplyText(text)
    } finally {
      setSending(false)
    }
  }

  const LIMITE_PLANTILLA_HORAS = 24

  const puedeEnviarPlantilla = async (phone: string): Promise<{ok:boolean, horasRestantes?:number}> => {
    const desde = new Date(Date.now() - LIMITE_PLANTILLA_HORAS * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('amat_campanas')
      .select('fecha')
      .eq('telefono', phone)
      .gte('fecha', desde)
      .order('fecha', { ascending: false })
      .limit(1)
    if(data?.length) {
      const horasPasadas = (Date.now() - new Date(data[0].fecha).getTime()) / (1000 * 60 * 60)
      return { ok: false, horasRestantes: Math.ceil(LIMITE_PLANTILLA_HORAS - horasPasadas) }
    }
    return { ok: true }
  }

  const sendTemplate=async(template:'recontacto'|'primer_contacto_esp'|'ayuda_economica')=>{
    if(!selectedPhone||!me) return
    const check = await puedeEnviarPlantilla(selectedPhone)
    if(!check.ok) {
      alert(`🚫 No se puede enviar la plantilla.

Ya se le envió una plantilla a este número en las últimas ${LIMITE_PLANTILLA_HORAS} horas. Podrás volver a enviarle en aprox. ${check.horasRestantes}hs.

Este límite protege el número de WhatsApp de la empresa.`)
      return
    }
    setSending(true)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(()=>controller.abort(), 8000)
      await fetch('/api/send-message',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({phone:selectedPhone,template,senderName:me.username}),
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch(e) {
      console.error('[sendTemplate] error o timeout:', e)
    } finally {
      // Buscar el lead en todas las fuentes posibles
      const lead = bandejaLeads.find(l=>l.phone_number===selectedPhone)
        || baseLeads.find(l=>l.phone_number===selectedPhone)
      try {
        await supabase.from('amat_campanas').insert({
          documento: lead?.dni || null,
          telefono: selectedPhone,
          fecha: new Date().toISOString(),
          plantilla: template,
          operador: me.username,
        })
      } catch(insertErr) {
        console.error('[sendTemplate] error insertando campana:', insertErr)
      }
      setSending(false)
    }
  }

  // ═══ FUNCIÓN ÚNICA DE CAMBIO DE ESTADO ═══
  // Todos los caminos (modal, venta, rechazo, finalizar) pasan por acá.
  // Garantiza: leads + consultas sincronizados, archivado en finales, limpieza de memoria.
  const cambiarEstado = async (
    lead: LoanLead,
    nuevoStatus: string,
    opts?: { notes?: string; situacion?: string; extraFields?: Record<string,any> }
  ) => {
    const esFinal = ESTADOS_FINALES.includes(nuevoStatus)
    const upd: any = {
      status: nuevoStatus,
      updated_at: new Date().toISOString(),
      ...(esFinal && { archived: true }),
      ...(opts?.notes !== undefined && { notes: opts.notes }),
      ...(opts?.extraFields || {}),
    }

    // 1. Actualizar DB primero — si falla, no tocamos la UI
    const resLead = await safeRun('cambiarEstado:lead', () =>
      supabase.from('amat_loan_leads').update(upd).eq('id', lead.id)
    )
    if(!resLead.ok) {
      alert('❌ No se pudo cambiar el estado. Intentá de nuevo.')
      return
    }

    // 2. Sincronizar amat_consultas — fallo no crítico (loguear, no bloquear)
    if(lead.phone_number) {
      const updC: any = {
        estado: STATUS_A_CONSULTA[nuevoStatus] || 'pendiente',
        updated_at: new Date().toISOString(),
      }
      if(opts?.situacion?.trim()) updC.situacion = opts.situacion.trim()
      const resConsulta = await safeRun('cambiarEstado:consulta', () =>
        supabase.from('amat_consultas').update(updC).eq('phone', lead.phone_number!)
      )
      if(!resConsulta.ok) {
        // No bloquear — el lead ya se actualizó. Solo avisar en consola.
        console.warn('[cambiarEstado] Lead actualizado pero consulta no sincronizada:', lead.phone_number)
      }
    }

    // 3. Actualizar UI solo después de confirmar que DB está ok
    if(esFinal) {
      setBotLeads(prev => prev.filter(l => l.id !== lead.id))
      if(nuevoStatus === 'closed' || nuevoStatus === 'resolved') setCerradosHoyCount(c => c + 1)
      if(selectedPhone === lead.phone_number) setSelectedPhone(null)
    } else {
      setBotLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...upd } : l))
      setColaLeadsState(prev => prev.map(l => l.id === lead.id ? { ...l, ...upd } : l))
    }
  }

  // Compatibilidad con llamadas existentes
  const updateStatus = async (id: number, status: string, notes?: string) => {
    const lead = bandejaLeads.find(l=>l.id===id) || colaLeadsState.find(l=>l.id===id) || baseLeads.find(l=>l.id===id)
    if(!lead) {
      const esFinal = ESTADOS_FINALES.includes(status)
      const upd: any = { status, updated_at: new Date().toISOString(), ...(esFinal && { archived: true }) }
      if(notes !== undefined) upd.notes = notes
      const res = await safeRun('updateStatus', () =>
        supabase.from('amat_loan_leads').update(upd).eq('id', id)
      )
      if(!res.ok) alert('❌ No se pudo actualizar el estado. Intentá de nuevo.')
      return
    }
    await cambiarEstado(lead, status, { notes })
  }

  const LIMITE_BANDEJA = 50

  const tomarConversacion = async (lead: LoanLead) => {
    if(!me) return
    // Verificar límite de 20 conversaciones activas
    const misActivas = bandejaLeads.filter(l =>
      l.assigned_to === me.username &&
      !['closed','rejected','not_interested','resolved','unresolved','finalizado','sin_respuesta'].includes(l.status||'')
    ).length
    if(misActivas >= LIMITE_BANDEJA) {
      alert(`Tenés ${misActivas} conversaciones activas. El límite es ${LIMITE_BANDEJA}. Cerrá alguna antes de tomar una nueva.`)
      return
    }

    // 1. DB primero — si falla no tocamos la UI ni el contador
    const resLead = await safeRun('tomarConversacion:lead', () =>
      supabase.from('amat_loan_leads')
        .update({assigned_to: me.username, status:'contacted', updated_at:new Date().toISOString()})
        .eq('id', lead.id)
    )
    if(!resLead.ok) {
      alert('❌ No se pudo tomar la conversación. Intentá de nuevo.')
      return
    }
    if(lead.phone_number) {
      await safeRun('tomarConversacion:consulta', () =>
        supabase.from('amat_consultas')
          .update({vendedor: me.username, estado:'pendiente', updated_at:new Date().toISOString()})
          .eq('phone', lead.phone_number!)
      )
      // Si falla la consulta no bloqueamos — el lead ya fue tomado
    }

    // 2. UI solo después de confirmar DB
    setColaTotal(t => Math.max(0, t - 1))
    setColaLeadsState(prev => prev.filter(l => l.id !== lead.id))

    // Actualizar en botLeads — si ya está, actualizar; si no, agregar
    setBotLeads(prev => {
      const existe = prev.find(l => l.id === lead.id)
      if(existe) return prev.map(l => l.id === lead.id ? { ...l, assigned_to: me.username, status: 'contacted' } : l)
      return [...prev, { ...lead, assigned_to: me.username, status: 'contacted' }]
    })

    setSelectedPhone(lead.phone_number)
    setVistaMode('mis_chats')
    if(lead.phone_number) cargarMensajes(lead.phone_number)

    // Reemplazar con uno nuevo de la cola — excluir el lead recién tomado del conteo
    const EXCLUIDOS_COLA = ['finalizado','rejected','not_interested','resolved','unresolved','closed','sin_respuesta']
    const colaActual = bandejaLeads.filter(l =>
      l.id !== lead.id &&   // excluir el que acaba de tomar
      !l.assigned_to &&
      !EXCLUIDOS_COLA.includes(l.status||'') &&
      !l.archived
    )
    const idsEnMemoria = new Set([...colaActual.map(l => l.id), lead.id])
    supabase
      .from('amat_loan_leads')
      .select('*')
      .is('assigned_to', null)
      .eq('archived', false)
      .not('status', 'in', `(${EXCLUIDOS_COLA.map(e=>`"${e}"`).join(',')})`)
      .order('updated_at', { ascending: false })
      .range(colaActual.length, colaActual.length)
      .then(({ data }) => {
        if(data?.length) {
          const nuevo = data[0] as LoanLead
          if(!idsEnMemoria.has(nuevo.id)) {
            setBotLeads(prev => [...prev, nuevo])
          }
        }
      })
  }

  // Helper: cargar mensajes de un phone sin límite
  const cargarMensajes = (phone: string) => {
    supabase.from('amat_messages')
      .select('id,phone_number,body,direction,sender,created_at,media_url,media_type')
      .eq('phone_number', phone)
      .order('created_at', {ascending: false})
      .limit(200)  // últimos 200 mensajes — suficiente para cualquier conversación
      .then(({data}) => {
        if(data) {
          // Revertir para mostrar de más viejo a más nuevo
          const msgs = (data as Message[]).reverse()
          setCurrentChatMsgs(msgs)
          // Actualizar el array global sin re-mergear todo
          setMessages(prev => [
            ...prev.filter(m => m.phone_number !== phone),
            ...msgs
          ])
        }
      })
  }

  const abrirChat = (lead: LoanLead) => {
    setCurrentChatMsgs([])
    setSelectedPhone(lead.phone_number)
    if(lead.phone_number) cargarMensajes(lead.phone_number)
    // No cambiar status automáticamente — el operador decide con el botón Tomar
  }

  const finalizarConversacion = async (nota?: string) => {
    if(!currentLead) return
    // Usar el estado elegido en el modal, o el actual si ya es final
    const statusFinal = finalizarEstado || (ESTADOS_FINALES.includes(currentLead.status||'') ? currentLead.status! : 'not_interested')
    await cambiarEstado(currentLead, statusFinal, { situacion: nota })
    setShowFinalizarModal(false)
    setFinalizarEstado('')
    setFinalizarNota('')
  }

  const guardarVenta = async () => {
    if(!currentLead||!me) return
    await cambiarEstado(currentLead, 'closed', {
      notes: ventaForm.notas || undefined,
      situacion: `Venta cerrada - ${ventaForm.entidad} ${ventaForm.linea} $${parseInt(ventaForm.monto).toLocaleString('es-AR')} en ${ventaForm.cuotas} cuotas · Valor cuota: $${parseFloat(ventaForm.valor_cuota).toLocaleString('es-AR')}`,
      extraFields: {
        entidad:          ventaForm.entidad,
        linea:            ventaForm.linea,
        reparticion:      ventaForm.reparticion || currentLead.reparticion,
        monto_solicitado: parseInt(ventaForm.monto)||0,
        cant_cuotas:      parseInt(ventaForm.cuotas)||0,
        valor_cuota:      parseFloat(ventaForm.valor_cuota)||0,
      },
    })
    setShowVentaModal(false)
    setVentaForm({entidad:'',linea:'',reparticion:'',monto:'',cuotas:'',valor_cuota:'',notas:''})
  }

  const openEdit=(lead:LoanLead)=>{
    setEditTarget(lead)
    setEditForm({full_name:lead.full_name,dni:lead.dni,phone_number:lead.phone_number,reparticion:lead.reparticion,bank:lead.bank,amount:lead.amount,installments:lead.installments,status:lead.status,assigned_to:lead.assigned_to,notes:lead.notes})
    setShowEditModal(true)
  }

  const saveEdit=async()=>{
    if(!editTarget) return
    setEditSaving(true)
    const upd: any = {
      ...editForm,
      full_name:    editForm.full_name?.toUpperCase()||editForm.full_name,
      reparticion:  editForm.reparticion?.toUpperCase()||editForm.reparticion,
      bank:         editForm.bank?.toUpperCase()||editForm.bank,
      updated_at:   new Date().toISOString()
    }
    // Coherencia de archivado con el modelo canónico
    if(editForm.status) {
      if(ESTADOS_FINALES.includes(editForm.status)) {
        upd.archived = true
      } else {
        upd.archived = false
      }
    }
    const resEdit = await safeRun('saveEdit:lead', () =>
      supabase.from('amat_loan_leads').update(upd).eq('id',editTarget.id)
    )
    if(!resEdit.ok) {
      alert('❌ No se pudo guardar los cambios. Intentá de nuevo.')
      setEditSaving(false)
      return
    }
    // UI solo después de confirmar DB
    if(editForm.status && ESTADOS_FINALES.includes(editForm.status)) {
      setBotLeads(prev => prev.filter(l => l.id !== editTarget.id))
    }
    // Sincronizar amat_consultas — fallo no crítico
    if(editTarget.phone_number && editForm.status) {
      await safeRun('saveEdit:consulta', () =>
        supabase.from('amat_consultas')
          .update({ estado: STATUS_A_CONSULTA[editForm.status!] || 'pendiente', updated_at: new Date().toISOString() })
          .eq('phone', editTarget.phone_number!)
      )
    }
    setEditSaving(false); setShowEditModal(false); setEditTarget(null)
    if(tab==='base') loadBase()
  }

  const saveNote=async()=>{
    const lead=currentLead||editTarget
    if(!lead) return
    const res = await safeRun('saveNote', () =>
      supabase.from('amat_loan_leads').update({notes:noteText,updated_at:new Date().toISOString()}).eq('id',lead.id)
    )
    if(!res.ok) { alert('❌ No se pudo guardar la nota. Intentá de nuevo.'); return }
    setShowNoteModal(false)
  }

  const handleReject=async()=>{
    const lead=currentLead||editTarget
    if(!lead||!rejectReason) return
    const note=`Rechazado: ${rejectReason}`
    await updateStatus(lead.id,'rejected',lead.notes?lead.notes+'\n'+note:note)
    setShowRejectModal(false); setRejectReason('')
  }

  const exportVentas = async () => {
    const {data} = await supabase.from('amat_loan_leads')
      .select('*').eq('status','closed').order('updated_at',{ascending:false})
    if(!data||data.length===0){ alert('No hay ventas cerradas para exportar'); return }
    const XLSX = await import('xlsx')
    const rows = data.map((l:any)=>{
      const fmtNum = (n:any) => n ? Number(n).toLocaleString('es-AR') : ''
      return {
        'DNI':             l.dni||'',
        'Nombre':          l.full_name||'',
        'Teléfono':        l.phone_number||'',
        'Email':           l.email||'',
        'Repartición':     l.reparticion||'',
        'Entidad':         l.entidad||'',
        'Línea':           l.linea||'',
        'Monto ($)':       fmtNum(l.monto_solicitado),
        'Cuotas':          l.cant_cuotas||'',
        'Valor cuota ($)': fmtNum(l.valor_cuota),
        'Asignado a':      l.assigned_to||'',
        'Fecha cierre':    new Date(l.updated_at).toLocaleDateString('es-AR'),
        'Observaciones':   l.notes||'',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      {wch:12},{wch:28},{wch:16},{wch:28},{wch:30},
      {wch:10},{wch:12},{wch:16},{wch:8},{wch:16},{wch:12},{wch:14},{wch:30}
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Ventas AMAT')
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
  // FIX 3: deduplicar allLeads como red de seguridad final antes del render
  const seenLeads = new Set<string>()
  const allLeads = botLeads.filter(l => {
    const key = l.phone_number || String(l.id)
    if(seenLeads.has(key)) return false
    seenLeads.add(key)
    return true
  })

  // Bandeja: solo leads con conversación (mensajes)
  const phonesConMensajes=[...new Set(messages.map(m=>m.phone_number))]
  const ESTADOS_FINALES_BANDEJA = ['finalizado','closed','rejected','not_interested','resolved','unresolved','sin_respuesta']
  const bandejaLeads=allLeads.filter(l=>{
    if(!l.phone_number) return false
    // Leads asignados al usuario siempre aparecen aunque sus mensajes no estén en el batch
    if(!phonesConMensajes.includes(l.phone_number) && l.assigned_to !== me?.username) return false
    if(ESTADOS_FINALES_BANDEJA.includes(l.status||'')) return false
    const q=bandejaSearch.toLowerCase()
    const m=!q||(l.full_name||'').toLowerCase().includes(q)||(l.phone_number||'').includes(q)||(l.dni||'').includes(q)
    if(soloNoLeidos) {
      const hasUnread = messages.some(msg =>
        msg.phone_number === l.phone_number &&
        msg.direction === 'in' &&
        new Date(msg.created_at) > new Date(l.updated_at)
      )
      if(!hasUnread) return false
    }
    return m
  }).sort((a, b) => {
    // Usar updated_at del lead para evitar iterar mensajes en cada sort
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
  
  const currentLead=allLeads.find(l=>l.phone_number===selectedPhone)||colaLeadsState.find(l=>l.phone_number===selectedPhone)||baseLeads.find(l=>l.phone_number===selectedPhone)
  // currentMsgs: priorizar currentChatMsgs (ya vienen ordenados de cargarMensajes)
  // Solo hacer filter+sort como fallback si no hay currentChatMsgs del phone actual
  const currentMsgs = (
    currentChatMsgs.length > 0 && currentChatMsgs[0]?.phone_number === selectedPhone
  )
    ? currentChatMsgs  // ya están ordenados asc por cargarMensajes
    : messages
        .filter(m=>m.phone_number===selectedPhone)
        .sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())

  // stats memoizado — no recalcular en cada render/keystroke
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

  const sc=(status:string)=>LEAD_STATUS[status]||LEAD_STATUS.new
  const scCob=(status:string)=>COBRANZA_STATUS[status]||COBRANZA_STATUS.new
  const scFor=(status:string,phone:string|null)=>{
    const flujo = phone ? flujoMap[phone] : 'solicitud'
    return flujo==='cobranzas' ? scCob(status) : sc(status)
  }
  const getEstadosFor=(phone:string|null)=>{
    const flujo = phone ? flujoMap[phone] : 'solicitud'
    return flujo==='cobranzas' ? COBRANZA_STATUS : LEAD_STATUS
  }
  const getEstadosFinalesFor=(phone:string|null)=>{
    const flujo = phone ? flujoMap[phone] : 'solicitud'
    return flujo==='cobranzas'
      ? ['resolved','unresolved']
      : ['not_interested','rejected','closed']
  }
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
                          {getFlujoLabel(currentLead.phone_number)} <span style={{fontSize:9}}>▼</span>
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
                    <button className="btn" onClick={()=>setShowAssignModal(true)}>👤 Asignar</button>
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
              <option value="pendiente">Pendiente (new + contacted)</option>
              <option value="new">Cola</option>
              <option value="contacted">Pendiente</option>
              <option value="contactado">Contactado</option>
              <option value="closed">Vendido</option>
              <option value="rejected">Rechazado</option>
              <option value="not_interested">No interesado</option>
              <option value="sin_respuesta">Sin respuesta</option>
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
            {(baseSearch||baseRep!=='all'||baseBanco!=='all'||baseStatus!=='all'||baseTel!=='all'||baseAssigned!=='all')&&(
              <button className="btn" onClick={()=>{setBaseSearch('');setBaseSearchInput('');setBaseRep('all');setBaseBanco('all');setBaseStatus('all');setBaseTel('all');setBaseAssigned('all');setBasePage(0)}}>✕ Limpiar</button>
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
                  <th>Fecha</th><th>Hora</th><th>DNI</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Repartición</th><th>Banco</th><th>Estado</th><th>Asignado</th><th>Acciones</th>
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
                            <button className="btn war" style={{padding:'4px 9px',fontSize:11}} onClick={()=>openTemplate(lead)}>💬 Plantilla</button>
                            <button className="btn" style={{padding:'4px 9px',fontSize:11,borderColor:'#6EE7B7',color:'#065F46',background:'#ECFDF5'}}
                              onClick={()=>{
                                if(lead.phone_number) cargarMensajes(lead.phone_number)
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
                  {baseLeads.length===0&&<tr><td colSpan={10} style={{textAlign:'center',padding:48,color:'#94A3B8'}}>Sin resultados</td></tr>}
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
              <option value="cola">Cola (sin tomar)</option>
              <option value="pendiente">Pendiente (en bandeja)</option>
              <option value="contactado">Contactado</option>
              <option value="cerrado">Sin respuesta</option>
              <option value="resuelto">Vendido</option>
              <option value="cerrado_rechazado">Rechazado</option>
              <option value="cerrado_no_interesado">No interesado</option>
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
                      <tr key={c.id} onClick={()=>{setConsultaSelected(c);setConsultaEdit({vendedor:c.vendedor||'',situacion:c.situacion||'',estado:c.estado||'pendiente'});setShowConsultaModal(true)}}>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:'#64748B',whiteSpace:'nowrap'}}>
                          {new Date(c.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                        </td>
                        <td style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:'#94A3B8',whiteSpace:'nowrap'}}>
                          {new Date(c.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}
                        </td>
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
                              // Cargar historial completo del chat
                              const {data:msgs} = await supabase.from('amat_messages')
                                .select('*').eq('phone_number',c.phone)
                                .order('created_at',{ascending:true})
                              if(msgs) setMessages(prev=>[...prev.filter(m=>m.phone_number!==c.phone),...msgs as Message[]])
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
                const res = await safeRun('asignar:lead', () =>
                  supabase.from('amat_loan_leads').update({assigned_to:u.username,updated_at:new Date().toISOString()}).eq('id',currentLead.id)
                )
                if(!res.ok) { alert('❌ No se pudo asignar. Intentá de nuevo.'); return }
                await safeRun('asignar:consulta', () =>
                  supabase.from('amat_consultas').update({vendedor:u.username,updated_at:new Date().toISOString()}).eq('phone',currentLead.phone_number||'')
                )
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
              const res = await safeRun('quitarAsignacion', () =>
                supabase.from('amat_loan_leads').update({assigned_to:null,updated_at:new Date().toISOString()}).eq('id',currentLead.id)
              )
              if(!res.ok) { alert('❌ No se pudo quitar la asignación. Intentá de nuevo.'); return }
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
                      await supabase.from('amat_campanas').insert({
                        documento: editTarget.dni || null,
                        telefono: editTarget.phone_number,
                        fecha: new Date().toISOString(),
                        plantilla: selectedTemplate.id,
                        operador: me.username,
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
                // Si es lead sin consulta (id empieza con 'lead_') → INSERT, sino UPDATE
                if(String(consultaSelected.id).startsWith('lead_')) {
                  await supabase.from('amat_consultas').insert({
                    phone:            consultaSelected.phone,
                    nombre_apellido:  consultaSelected.nombre_apellido,
                    dni:              consultaSelected.dni,
                    reparticion_label:consultaSelected.reparticion_label,
                    flujo:            consultaSelected.flujo||'solicitud',
                    vendedor:         consultaEdit.vendedor,
                    situacion:        consultaEdit.situacion,
                    estado:           consultaEdit.estado,
                    created_at:       new Date().toISOString(),
                    updated_at:       new Date().toISOString()
                  })
                } else {
                  await supabase.from('amat_consultas').update({
                    vendedor:  consultaEdit.vendedor,
                    situacion: consultaEdit.situacion,
                    estado:    consultaEdit.estado,
                    updated_at:new Date().toISOString()
                  }).eq('id',consultaSelected.id)
                }

                // Sincronizar amat_loan_leads con el estado elegido — mapeo inverso canónico
                if(consultaSelected.phone) {
                  const esCob = consultaSelected.flujo === 'cobranzas'
                  const CONSULTA_A_STATUS: Record<string,string> = {
                    pendiente:              'contacted',
                    contactado:             'contactado',
                    resuelto:               esCob ? 'resolved' : 'closed',
                    cerrado:                esCob ? 'unresolved' : 'not_interested',
                    cerrado_rechazado:      'rejected',
                    cerrado_no_interesado:  'not_interested',
                  }
                  const nuevoStatus = CONSULTA_A_STATUS[consultaEdit.estado] || 'contacted'
                  const esFinal = ESTADOS_FINALES.includes(nuevoStatus)

                  const {data: existingLead} = await supabase
                    .from('amat_loan_leads')
                    .select('id,archived,assigned_to,status')
                    .eq('phone_number', consultaSelected.phone)
                    .single()

                  if(existingLead) {
                    const updateData: any = {
                      status:      nuevoStatus,
                      updated_at:  new Date().toISOString(),
                    }
                    if(esFinal) {
                      // Estado final: archivar SIEMPRE, salir de bandeja/cola
                      updateData.archived = true
                    } else {
                      // Pendiente: activo, asignar vendedor si se eligió
                      updateData.archived = false
                      if(consultaEdit.vendedor) updateData.assigned_to = consultaEdit.vendedor
                    }
                    await supabase.from('amat_loan_leads').update(updateData).eq('id', existingLead.id)

                    if(esFinal) {
                      // Sacar de memoria — no debe aparecer más en bandeja/cola
                      setBotLeads(prev => prev.filter(l => l.id !== existingLead.id))
                      if(selectedPhone === consultaSelected.phone) setSelectedPhone(null)
                    } else if(consultaEdit.vendedor) {
                      // Activo con vendedor: reflejar en bandeja
                      setBotLeads(prev => {
                        const exists = prev.find(l=>l.id===existingLead.id)
                        if(exists) return prev.map(l=>l.id===existingLead.id?{...l,...updateData}:l)
                        supabase.from('amat_loan_leads').select('*').eq('id',existingLead.id).single()
                          .then(({data})=>{ if(data) setBotLeads(p=>p.find(x=>x.id===(data as any).id)?p:[data as any,...p]) })
                        return prev
                      })
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
