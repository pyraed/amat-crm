'use client'

import { useState } from 'react'

// ─────────────────────────────────────────────
//  GRILLA DE CUOTAS (extraída de grilla.xlsx de AMAT)
// ─────────────────────────────────────────────
const TABLAS: Record<number, Record<number, number>> = {
  6:  {100000:20833.58, 110000:22916.94, 150000:31250.37, 200000:41667.16, 250000:52083.95, 300000:62500.74, 350000:72917.53, 400000:83334.32, 450000:93751.11, 500000:104167.9},
  12: {30000:3654.01, 40000:4872.01, 50000:6090.01, 60000:7308.01, 70000:8526.01, 80000:9744.02, 90000:10962.02, 100000:12180.02, 110000:13398.02, 120000:14616.02, 130000:15834.03, 140000:17052.03, 150000:18270.03, 160000:19488.03, 170000:20706.03, 180000:21924.04, 190000:23142.04, 200000:24360.04, 210000:25578.04, 220000:26796.04, 230000:28014.05, 240000:29232.05, 250000:30450.05, 260000:31668.05, 270000:32886.05, 280000:34104.06, 290000:35322.06, 300000:36540.06, 310000:37758.06, 320000:38976.06, 330000:40194.07, 340000:41412.07, 350000:42630.07, 360000:43848.07, 370000:45066.07, 380000:46284.08, 390000:47502.08, 400000:48720.08, 410000:49938.08, 420000:51156.08, 430000:52374.09, 440000:53592.09, 450000:54810.09, 460000:56028.09, 470000:57246.09, 480000:58464.1, 490000:59682.1, 500000:60900.1, 510000:62118.1, 520000:63336.1, 530000:64554.11, 540000:65772.11, 550000:66990.11, 560000:68208.11, 570000:69426.11, 580000:70644.12, 590000:71862.12, 600000:73080.12, 610000:74298.12, 620000:75516.12, 630000:76734.13, 640000:77952.13, 650000:79170.13, 660000:80388.13, 670000:81606.13, 680000:82824.14, 690000:84042.14, 700000:85260.14, 710000:86478.14, 720000:87696.14, 730000:88914.15, 740000:90132.15, 750000:91350.15, 760000:92568.15, 770000:93786.15, 780000:95004.16, 790000:96222.16, 800000:97440.16, 810000:98658.16, 820000:99876.16, 830000:101094.17, 840000:102312.17, 850000:103530.17, 860000:104748.17, 870000:105966.17, 880000:107184.18, 890000:108402.18, 900000:109620.18, 910000:110838.18, 920000:112056.18, 930000:113274.19, 940000:114492.19, 950000:115710.19, 960000:116928.19, 970000:118146.19, 980000:119364.2, 990000:120582.2, 1000000:121800.2, 1050000:127890.21, 1100000:133980.22, 1150000:140070.23, 1200000:146160.24, 1250000:152250.25, 1300000:158340.26, 1350000:164430.27, 1400000:170520.28, 1450000:176610.29, 1500000:182700.3},
  18: {30000:2827.4, 40000:3761.86, 50000:4702.33, 60000:5642.79, 70000:6583.26, 80000:7523.72, 90000:8464.19, 100000:9404.65, 110000:10345.12, 120000:11285.58, 130000:12226.05, 140000:13166.51, 150000:14106.98, 160000:15047.44, 170000:15987.91, 180000:16928.37, 190000:17686.84, 200000:18809.3, 210000:19749.77, 220000:20690.23, 230000:21630.7, 240000:22571.17, 250000:23511.63, 260000:24452.1, 270000:25392.56, 280000:26333.03, 290000:27273.49, 300000:28213.96, 310000:29154.42, 320000:30094.89, 330000:31035.35, 340000:31975.82, 350000:32916.28, 360000:33856.75, 370000:34797.21, 380000:35737.68, 390000:36678.14, 400000:37618.61, 410000:38559.07, 420000:39499.54, 430000:40440.0, 440000:41380.47, 450000:42320.94, 460000:43261.4, 470000:44201.87, 480000:45142.33, 490000:46082.8, 500000:47023.26, 510000:47963.73, 520000:48904.19, 530000:49844.66, 540000:50785.12, 550000:51725.59, 560000:52666.05, 570000:53606.52, 580000:54546.98, 590000:55487.45, 600000:56427.91, 610000:57368.38, 620000:58308.84, 630000:59249.31, 640000:60189.77, 650000:61130.24, 660000:62070.7, 670000:63011.17, 680000:63951.64, 690000:64892.1, 700000:65832.57, 710000:66773.03, 720000:67713.5, 730000:68653.96, 740000:69594.43, 750000:70534.89, 760000:71475.36, 770000:72415.82, 780000:73356.29, 790000:74296.75, 800000:75237.22, 810000:76177.68, 820000:77118.15, 830000:78058.61, 840000:78999.08, 850000:79939.54, 860000:80880.01, 870000:81820.47, 880000:82760.94, 890000:83701.41, 900000:84641.87, 910000:85582.34, 920000:86522.8, 930000:87463.27, 940000:88403.73, 950000:89344.2, 960000:90284.66, 970000:91225.13, 980000:92165.59, 990000:93106.06, 1000000:94046.52, 1050000:98748.85, 1100000:103451.17, 1150000:108153.5, 1200000:112855.83, 1250000:117558.15, 1300000:122260.48, 1350000:126962.81, 1400000:131665.13, 1450000:136367.46, 1500000:141069.78},
  24: {30000:2428.28, 40000:3237.71, 50000:4047.14, 60000:4856.56, 70000:5665.99, 80000:6475.42, 90000:7284.85, 100000:8094.27, 110000:8903.7, 120000:9713.13, 130000:10522.55, 140000:11331.98, 150000:12141.41, 160000:12950.84, 170000:13760.26, 180000:14569.69, 190000:15379.12, 200000:16188.54, 210000:16997.97, 220000:17807.4, 230000:18616.83, 240000:19426.25, 250000:20235.68, 260000:21045.11, 270000:21854.54, 280000:22663.96, 290000:23473.39, 300000:24282.82, 310000:25092.24, 320000:25901.67, 330000:26711.1, 340000:27520.53, 350000:28329.95, 360000:29139.38, 370000:29948.81, 380000:30758.24, 390000:31567.66, 400000:32377.09, 410000:33186.52, 420000:33995.94, 430000:34805.37, 440000:35614.8, 450000:36424.23, 460000:37233.65, 470000:38043.08, 480000:38852.51, 490000:39661.94, 500000:40471.36, 510000:41280.79, 520000:42090.22, 530000:42899.64, 540000:43709.07, 550000:44518.5, 560000:45327.93, 570000:46137.35, 580000:46946.78, 590000:47756.21, 600000:48565.63, 610000:49375.06, 620000:50184.49, 630000:50993.92, 640000:51803.34, 650000:52612.77, 660000:53422.2, 670000:54231.63, 680000:55041.05, 690000:55850.48, 700000:56659.91, 710000:57469.33, 720000:58278.76, 730000:59088.19, 740000:59897.62, 750000:60707.04, 760000:61516.47, 770000:62325.9, 780000:63135.33, 790000:63944.75, 800000:64754.18, 810000:65563.61, 820000:66373.03, 830000:67182.46, 840000:67991.89, 850000:68801.32, 860000:69610.74, 870000:70420.17, 880000:71229.6, 890000:72039.02, 900000:72848.45, 910000:73657.88, 920000:74467.31, 930000:75276.73, 940000:76086.16, 950000:76895.59, 960000:77705.02, 970000:78514.44, 980000:79323.87, 990000:80133.3, 1000000:80942.72, 1050000:84989.86, 1100000:89037.0, 1150000:93084.13, 1200000:97131.27, 1250000:101178.41, 1300000:105225.54, 1350000:109272.68, 1400000:113319.81, 1450000:117366.95, 1500000:121414.09},
}

// ─────────────────────────────────────────────
//  MEMBRESÍA AMAT por repartición y monto
// ─────────────────────────────────────────────
function calcularMembresia(entidad: string, reparticion: string, monto: number): [number,number,number] {

  if (entidad === 'dos_agosto') {
    if (reparticion === 'policia') {
      const cs = 9000
      if (monto <= 200000) return [cs, 3750, 3950]
      if (monto <= 300000) return [cs, 6250, 6450]
      if (monto <= 400000) return [cs, 8250, 8450]
      if (monto <= 600000) return [cs, 11750, 11950]
      return [cs, 14750, 14950]
    }
    if (reparticion === 'educacion') {
      const cs = 9900
      if (monto <= 200000) return [cs, 3750, 3950]
      if (monto <= 300000) return [cs, 6250, 6450]
      if (monto <= 400000) return [cs, 8250, 8450]
      return [cs, 9998, 9998]
    }
    if (reparticion === 'salud') return [0, 0, 0]
    if (reparticion === 'spb') {
      const cs = 4300
      if (monto <= 200000) return [cs, 3750, 3950]
      if (monto <= 300000) return [cs, 6250, 6450]
      if (monto <= 400000) return [cs, 8250, 8450]
      if (monto <= 600000) return [cs, 11750, 11950]
      return [cs, 14750, 14950]
    }
    return [0, 0, 0]
  }

  // AMAT
  if (reparticion === 'policia' || reparticion === 'spb') {
    const cs = 4300
    if (monto <= 200000) return [cs, 3850, 3950]
    if (monto <= 300000) return [cs, 6150, 6250]
    if (monto <= 400000) return [cs, 8150, 8250]
    if (monto <= 600000) return [cs, 11850, 11950]
    return [cs, 14850, 14950]
  }
  if (reparticion === 'educacion') {
    const cs = 9900
    if (monto <= 200000) return [cs, 3850, 3950]
    if (monto <= 300000) return [cs, 6150, 6250]
    if (monto <= 400000) return [cs, 8150, 8250]
    return [cs, 9998, 9998]
  }
  if (reparticion === 'salud') return [5172, 5078, 5214]
  return [0, 0, 0]
}

// ─────────────────────────────────────────────
//  BAPRO — tabla fija solo AMAT
// ─────────────────────────────────────────────
const TABLA_BAPRO: Record<number,number> = {
  100000: 20465.69, 150000: 30698.53,
  200000: 40931.37, 250000: 51164.21, 300000: 61397.06,
}

// ─────────────────────────────────────────────
//  DOCUMENTACIÓN por repartición
// ─────────────────────────────────────────────
const DOCS: Record<string, string[]> = {
  policia:   ['DNI frente y dorso','Certificado de Afectación','Comprobante de Servicio','Último Recibo de Sueldo','Selfie con DNI en mano','Constancia de CBU'],
  spb:       ['DNI frente y dorso','Certificado de Afectación','Comprobante de Servicio','Último Recibo de Sueldo','Selfie con DNI en mano','Constancia de CBU'],
  educacion: ['DNI frente y dorso','Certificado de Afectación','Último Recibo de Sueldo','Selfie con DNI en mano','Constancia de CBU'],
  salud:     ['DNI frente y dorso','Certificado de Afectación','Último Recibo de Sueldo','Selfie con DNI en mano','Constancia de CBU'],
}

const fmt = (n: number) =>
  '$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const BASE_DATERO = 'https://datero-amat.onrender.com'

// ─────────────────────────────────────────────
//  GENERADOR DE MENSAJE
// ─────────────────────────────────────────────
function generarMensaje(params: {
  linea: string; entidad: string; reparticion: string
  monto: number; cuotas: number; total: number
  link: string; nombre?: string
}): string {
  const { linea, entidad, reparticion, monto, cuotas, total, link, nombre } = params
  const saludo = nombre ? `Hola ${nombre.split(' ')[0]} 👋\n\n` : ''
  const docs = DOCS[reparticion] || DOCS['educacion']
  const entLabel = entidad === 'dos_agosto' ? 'DOS DE AGOSTO' : 'AMAT'
  const repLabel = reparticion.charAt(0).toUpperCase() + reparticion.slice(1)

  if (linea === 'bapro') {
    return `${saludo}*OFERTA BAPRO — AMAT*\n\n✅ Ayuda económica pre-aprobada por descuento en haberes:\n\n*Monto:* ${fmt(monto)}\n*Plan:* ${cuotas} cuotas de *${fmt(total)}*\n\n📋 *DOCUMENTACIÓN REQUERIDA:*\n${docs.map(d => `• ${d}`).join('\n')}\n\n🧾 *FORMULARIO ONLINE:*\n${link}`
  }

  if (linea === 'ayuda') {
    return `${saludo}*OFERTA AYUDA ECONÓMICA — ${entLabel}*\n\n✅ Línea de ayuda económica especial:\n\n*Repartición:* ${repLabel}\n*Monto:* ${fmt(monto)}\n*Plan:* ${cuotas} cuotas de *${fmt(total)}*\n\n📋 *DOCUMENTACIÓN REQUERIDA:*\n${docs.map(d => `• ${d}`).join('\n')}\n\n🧾 *FORMULARIO ONLINE:*\n${link}`
  }

  return `${saludo}*OFERTA POR DESCUENTO EN HABERES*\n\n✅ Ayuda económica pre-aprobada:\n\n*Entidad:* ${entLabel}\n*Repartición:* ${repLabel}\n💰 *Monto:* ${fmt(monto)}\n📅 *Plan:* ${cuotas} cuotas de *${fmt(total)}*\n\n📋 *DOCUMENTACIÓN REQUERIDA:*\n${docs.map(d => `• ${d}`).join('\n')}\n\n🧾 *FORMULARIO ONLINE:*\n${link}`
}

// ─────────────────────────────────────────────
//  CONFIGURACIÓN UI
// ─────────────────────────────────────────────
const ENTIDADES = [
  { value: 'amat',      label: 'AMAT',        color: '#B45309' },
  { value: 'dos_agosto',label: 'DOS DE AGOSTO',color: '#18181B' },
]

const LINEAS = [
  { value: 'haberes', label: 'Haberes' },
  { value: 'ayuda',   label: 'Ayuda' },
  { value: 'bapro',   label: 'BAPRO' },
]

const REPS_AMAT = [
  { value:'policia',   label:'Policía' },
  { value:'spb',       label:'SPB' },
  { value:'educacion', label:'Educación' },
  { value:'salud',     label:'Salud' },
]

const REPS_DOS_AGOSTO = [
  { value:'policia',   label:'Policía' },
  { value:'spb',       label:'SPB' },
  { value:'educacion', label:'Educación' },
  { value:'salud',     label:'Salud' },
]

const CUOTAS_HABERES  = [6, 12, 18, 24]
const CUOTAS_AYUDA    = [24]
const CUOTAS_BAPRO    = [12]

const MONTOS_HABERES = [50000,100000,150000,200000,250000,300000,350000,400000,450000,500000,600000,700000,800000,900000,1000000,1200000,1500000]
const MONTOS_AYUDA_AMAT: Record<string,number> = { educacion: 200000, salud: 100000 }
const MONTOS_BAPRO   = [100000,150000,200000,250000,300000]

type Props = {
  contactName?: string
  onSendMessage: (msg: string) => void
  onClose: () => void
}

export default function CalculadorOferta({ contactName, onSendMessage, onClose }: Props) {
  const [entidad,     setEntidad]    = useState('amat')
  const [linea,       setLinea]      = useState('haberes')
  const [reparticion, setRep]        = useState('policia')
  const [monto,       setMonto]      = useState(200000)
  const [cuotas,      setCuotas]     = useState(24)
  const [resultado,   setResultado]  = useState<null|{cs:number;med:number;farm:number;vc:number;total:number;link:string;msg:string}>(null)
  const [copied,      setCopied]     = useState(false)

  const entColor = ENTIDADES.find(e => e.value === entidad)?.color || '#B45309'
  const repsDisp = entidad === 'dos_agosto' ? REPS_DOS_AGOSTO : REPS_AMAT
  const cuotasDisp = linea === 'bapro' ? CUOTAS_BAPRO : linea === 'ayuda' ? CUOTAS_AYUDA : CUOTAS_HABERES
  const montosDisp = linea === 'bapro' ? MONTOS_BAPRO : linea === 'ayuda' ? [MONTOS_AYUDA_AMAT[reparticion] || 200000] : MONTOS_HABERES

  const handleEntidad = (e: string) => {
    setEntidad(e); setResultado(null); setCopied(false)
    if (e === 'dos_agosto' && linea === 'bapro') setLinea('haberes')
  }

  const handleLinea = (l: string) => {
    setLinea(l); setResultado(null); setCopied(false)
    const newCuotas = l === 'bapro' ? 12 : l === 'ayuda' ? 24 : 24
    setCuotas(newCuotas)
    if (l === 'ayuda') setMonto(MONTOS_AYUDA_AMAT[reparticion] || 200000)
    if (l === 'bapro') setMonto(200000)
  }

  const handleRep = (r: string) => {
    setRep(r); setResultado(null)
    if (linea === 'ayuda') setMonto(MONTOS_AYUDA_AMAT[r] || 200000)
  }

  const calcular = () => {
    let vc = 0, cs = 0, med = 0, farm = 0, total = 0
    let montoCalc = monto

    if (linea === 'haberes') {
      vc = TABLAS[cuotas]?.[monto] || 0
      ;[cs, med, farm] = calcularMembresia(entidad, reparticion, monto)
      total = vc + cs + med + farm

    } else if (linea === 'ayuda') {
      if (entidad === 'amat') {
        if (reparticion === 'educacion') { montoCalc = 200000; vc = 28996 }
        else if (reparticion === 'salud') { montoCalc = 100000; vc = 15464 }
      }
      total = vc

    } else if (linea === 'bapro') {
      vc = TABLA_BAPRO[monto] || 0
      ;[cs] = calcularMembresia(entidad, reparticion, monto)
      total = vc + cs
    }

    const link = `${BASE_DATERO}/cliente?ent=${entidad}&rep=${reparticion}&monto=${montoCalc}&cuotas=${cuotas}&linea=${linea}`
    const msg = generarMensaje({ linea, entidad, reparticion, monto: montoCalc, cuotas, total, link, nombre: contactName })
    setResultado({ cs, med, farm, vc, total, link, msg })
    setCopied(false)
  }

  const labelStyle: React.CSSProperties = {
    display:'block', fontSize:10.5, fontWeight:600, color:'#64748B',
    textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5,
    fontFamily:"'DM Mono', monospace",
  }

  const btnGroup = (items: {value:string;label:string}[], active: string, onClick: (v:string)=>void, accent?: string) => (
    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
      {items.map(it => (
        <button key={it.value} onClick={()=>onClick(it.value)} style={{
          padding:'6px 8px', borderRadius:6, flex:1, fontSize:11.5, fontWeight:600,
          cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
          borderWidth:1, borderStyle:'solid',
          borderColor: active===it.value ? (accent||entColor) : '#E2E8F0',
          background: active===it.value ? `${accent||entColor}18` : 'white',
          color: active===it.value ? (accent||entColor) : '#374151',
        }}>
          {it.label}
        </button>
      ))}
    </div>
  )

  const btnMonto = (items: number[]) => (
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4}}>
      {items.map(m => (
        <button key={m} onClick={()=>{setMonto(m);setResultado(null)}} style={{
          padding:'5px 2px', borderRadius:5, fontSize:10.5, fontWeight:600,
          cursor:'pointer', fontFamily:"'DM Mono',monospace", transition:'all .15s',
          borderWidth:1, borderStyle:'solid',
          borderColor: monto===m ? entColor : '#E2E8F0',
          background: monto===m ? `${entColor}18` : 'white',
          color: monto===m ? entColor : '#374151',
        }}>
          ${m >= 1000000 ? (m/1000000).toFixed(1)+'M' : (m/1000).toFixed(0)+'k'}
        </button>
      ))}
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`.val-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #F8FAFC}`}</style>

      {/* Header */}
      <div style={{padding:'12px 14px 10px',borderBottom:'1px solid #F1F5F9',background:'white'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:14,fontWeight:700,color:'#0F172A',fontFamily:"'Playfair Display',serif"}}>
            💰 Calculador AMAT
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#94A3B8',fontSize:18,lineHeight:1}}>×</button>
        </div>
        {contactName && <div style={{fontSize:11.5,color:'#94A3B8',marginTop:3,fontFamily:"'DM Mono',monospace"}}>Para: {contactName}</div>}
      </div>

      {/* Formulario */}
      <div style={{flex:1,overflowY:'auto',padding:'12px 14px'}}>

        {/* Entidad */}
        <div style={{marginBottom:11}}>
          <label style={labelStyle}>Entidad</label>
          {btnGroup(ENTIDADES, entidad, handleEntidad)}
        </div>

        {/* Línea */}
        <div style={{marginBottom:11}}>
          <label style={labelStyle}>Línea</label>
          {btnGroup(
            entidad === 'dos_agosto' ? LINEAS.filter(l=>l.value!=='bapro') : LINEAS,
            linea, handleLinea, '#2563EB'
          )}
        </div>

        {/* Repartición */}
        <div style={{marginBottom:11}}>
          <label style={labelStyle}>Repartición</label>
          {btnGroup(repsDisp, reparticion, handleRep)}
        </div>

        {/* Monto */}
        <div style={{marginBottom:11}}>
          <label style={labelStyle}>Monto</label>
          {btnMonto(montosDisp)}
        </div>

        {/* Cuotas */}
        {cuotasDisp.length > 1 && (
          <div style={{marginBottom:14}}>
            <label style={labelStyle}>Cuotas</label>
            <div style={{display:'flex',gap:5}}>
              {cuotasDisp.map(c => (
                <button key={c} onClick={()=>{setCuotas(c);setResultado(null)}} style={{
                  padding:'6px 0',borderRadius:6,flex:1,fontSize:12,fontWeight:600,
                  cursor:'pointer',fontFamily:"'DM Mono',monospace",transition:'all .15s',
                  borderWidth:1,borderStyle:'solid',
                  borderColor:cuotas===c ? '#F59E0B' : '#E2E8F0',
                  background:cuotas===c ? '#FFFBEB' : 'white',
                  color:cuotas===c ? '#B45309' : '#374151',
                }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Botón calcular */}
        <button onClick={calcular} style={{
          width:'100%',padding:'10px',
          background:`linear-gradient(135deg,${entColor},${entColor}cc)`,
          color:'white',border:'none',borderRadius:9,fontSize:13,fontWeight:700,
          cursor:'pointer',fontFamily:'inherit',
          boxShadow:`0 2px 10px ${entColor}40`,marginBottom:14,
        }}>
          Calcular oferta →
        </button>

        {/* Resultado */}
        {resultado && (
          <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'12px 14px',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:entColor,textTransform:'uppercase',letterSpacing:'0.07em',fontFamily:"'DM Mono',monospace",marginBottom:8}}>
              {entidad.toUpperCase().replace('_',' ')} · {linea.toUpperCase()} · {reparticion.charAt(0).toUpperCase()+reparticion.slice(1)}
            </div>

            {linea !== 'ayuda' && (
              <>
                {[
                  ['Cuota préstamo', resultado.vc],
                  ['Cuota social', resultado.cs],
                  ...(linea !== 'bapro' ? [['Coseguro médico', resultado.med],['Coseguro farmacia', resultado.farm]] : []),
                ].filter((r): r is [string,number] => Array.isArray(r) && (r[1] as number) > 0).map(([l,v],i)=>(
                  <div key={i} className="val-row">
                    <span style={{fontSize:12,color:'#475569'}}>{l}</span>
                    <span style={{fontSize:12,fontWeight:500,color:entColor,fontFamily:"'DM Mono',monospace"}}>{fmt(v)}</span>
                  </div>
                ))}
              </>
            )}

            <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:`2px solid ${entColor}30`}}>
              <span style={{fontSize:13,fontWeight:700,color:'#0F172A'}}>Total por cuota</span>
              <span style={{fontSize:16,fontWeight:700,color:entColor,fontFamily:"'Playfair Display',serif"}}>{fmt(resultado.total)}</span>
            </div>

            {/* Preview */}
            <div style={{marginTop:10,background:'white',border:'1px solid #E2E8F0',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:10.5,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.07em',fontFamily:"'DM Mono',monospace",marginBottom:6}}>
                Vista previa
              </div>
              <div style={{fontSize:11.5,color:'#374151',lineHeight:1.6,whiteSpace:'pre-wrap',maxHeight:120,overflowY:'auto'}}>
                {resultado.msg}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {resultado && (
        <div style={{padding:'10px 14px',borderTop:'1px solid #F1F5F9',background:'white',display:'flex',gap:8}}>
          <button onClick={()=>{navigator.clipboard.writeText(resultado.msg);setCopied(true);setTimeout(()=>setCopied(false),2500)}}
            style={{flex:1,padding:'9px',border:'1px solid #E2E8F0',borderRadius:8,background:'white',fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit',color:'#374151'}}>
            {copied ? '✓ Copiado' : '📋 Copiar'}
          </button>
          <button onClick={()=>{onSendMessage(resultado.msg);onClose()}}
            style={{flex:2,padding:'9px',background:`linear-gradient(135deg,${entColor},${entColor}cc)`,color:'white',border:'none',borderRadius:8,fontSize:12.5,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
            ↑ Enviar por WhatsApp
          </button>
        </div>
      )}
    </div>
  )
}
