'use client'

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTS · TABS · TAB REPORTES
//  Tab completo de reportes. Solo lee datos — no muta estado del padre.
//  Todos los recharts y tablas de pipeline viven acá.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart,
  RadialBarChart, RadialBar,
} from 'recharts'
import { LoanLead } from '@/lib/types'
import { USERS } from '@/domain/entities/users'
import { LEAD_STATUS, COBRANZA_STATUS } from '@/domain/entities/leadStatus'
import { REPARTICIONES } from '@/domain/entities/catalogs'

type Props = {
  reporteLeads:     LoanLead[]
  pipelineFlujoMap: Record<string, string>
  reporteMode:      'ventas' | 'cobranzas'
  setReporteMode:   (m: 'ventas' | 'cobranzas') => void
  reportePeriodo:   string
  setReportePeriodo:(p: string) => void
  reporteDesde:     string
  setReporteDesde:  (v: string) => void
  reporteHasta:     string
  setReporteHasta:  (v: string) => void
  loadReportes:     (periodo?: string, desde?: string, hasta?: string) => void
}

export default function TabReportes({
  reporteLeads, pipelineFlujoMap,
  reporteMode, setReporteMode,
  reportePeriodo, setReportePeriodo,
  reporteDesde, setReporteDesde,
  reporteHasta, setReporteHasta,
  loadReportes,
}: Props) {
  // Filtrar leads por modo (ventas vs cobranzas) usando pipelineFlujoMap
  const modoR = reporteMode
  const rLeadsFinal = reporteLeads.filter(l => {
    const flujo = pipelineFlujoMap[l.phone_number||''] || 'solicitud'
    return modoR === 'cobranzas' ? flujo === 'cobranzas' : flujo !== 'cobranzas'
  })

  return (
    <div style={{flex:1,overflowY:'auto',padding:'20px 24px',background:'#F8FAFC'}}>

      {/* Toolbar */}
      <div style={{display:'flex',gap:8,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4,background:'white',border:'1px solid #E2E8F0',borderRadius:9,padding:3}}>
          {(['ventas','cobranzas'] as const).map(m=>(
            <button key={m} onClick={()=>{ setReporteMode(m); loadReportes(reportePeriodo,reporteDesde,reporteHasta) }}
              style={{padding:'5px 14px',borderRadius:6,border:'none',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                background:modoR===m?(m==='cobranzas'?'#7C3AED':'#3B82F6'):'transparent',
                color:modoR===m?'white':'#64748B'}}>
              {m==='cobranzas'?'🔔 Cobranzas':'💼 Ventas'}
            </button>
          ))}
        </div>

        <select value={reportePeriodo}
          onChange={e=>{ setReportePeriodo(e.target.value); if(e.target.value!=='custom') loadReportes(e.target.value) }}
          style={{border:'1px solid #E2E8F0',borderRadius:8,padding:'7px 10px',fontSize:12,fontFamily:'inherit',color:'#374151',background:'white',outline:'none',cursor:'pointer'}}>
          <option value="mes_actual">Este mes</option>
          <option value="mes_pasado">Mes pasado</option>
          <option value="3_meses">Últimos 3 meses</option>
          <option value="6_meses">Últimos 6 meses</option>
          <option value="anio_actual">Este año</option>
          <option value="historico">Histórico total</option>
          <option value="custom">Personalizado</option>
        </select>

        {reportePeriodo==='custom'&&(<>
          <input type="date" value={reporteDesde} onChange={e=>setReporteDesde(e.target.value)}
            style={{border:'1px solid #E2E8F0',borderRadius:8,padding:'7px 10px',fontSize:12,fontFamily:'inherit',color:'#374151',background:'white',outline:'none'}}/>
          <span style={{fontSize:12,color:'#94A3B8'}}>→</span>
          <input type="date" value={reporteHasta} onChange={e=>setReporteHasta(e.target.value)}
            style={{border:'1px solid #E2E8F0',borderRadius:8,padding:'7px 10px',fontSize:12,fontFamily:'inherit',color:'#374151',background:'white',outline:'none'}}/>
          <button onClick={()=>loadReportes('custom',reporteDesde,reporteHasta)}
            style={{padding:'7px 14px',borderRadius:8,border:'none',background:'#3B82F6',color:'white',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
            Ver
          </button>
        </>)}

        <button onClick={()=>loadReportes(reportePeriodo,reporteDesde,reporteHasta)}
          style={{padding:'7px 14px',borderRadius:8,border:'1px solid #E2E8F0',background:'white',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',color:'#374151',marginLeft:'auto'}}>
          🔄 Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {(modoR==='cobranzas' ? [
          {label:'Total casos',   val:rLeadsFinal.length, color:'#7C3AED', icon:'◈', sub:'Histórico total'},
          {label:'Resueltos',     val:rLeadsFinal.filter(l=>l.status==='resolved').length, color:'#10B981', icon:'✓', sub:'Casos resueltos'},
          {label:'No resueltos',  val:rLeadsFinal.filter(l=>l.status==='unresolved').length, color:'#EF4444', icon:'✗', sub:'Sin resolución'},
          {label:'Contactados',   val:rLeadsFinal.filter(l=>l.status==='contacted').length, color:'#06B6D4', icon:'◉', sub:'Conversaciones iniciadas'},
          {label:'Tasa resolución',val:rLeadsFinal.length>0?Math.round(rLeadsFinal.filter(l=>l.status==='resolved').length/rLeadsFinal.length*100)+'%':'0%', color:'#EC4899', icon:'%', sub:'Resueltos vs total'},
        ] : [
          {label:'Total leads',   val:rLeadsFinal.length, color:'#F59E0B', icon:'◈', sub:reportePeriodo==='mes_actual'?'Este mes':reportePeriodo==='mes_pasado'?'Mes pasado':reportePeriodo==='historico'?'Histórico total':'Período seleccionado'},
          {label:'Cerrados',      val:rLeadsFinal.filter(l=>l.status==='closed').length, color:'#10B981', icon:'✓', sub:'Operaciones concretadas'},
          {label:'Contactados',   val:rLeadsFinal.filter(l=>l.status==='contacted').length, color:'#06B6D4', icon:'◉', sub:'Conversaciones iniciadas'},
          {label:'Sin contactar', val:rLeadsFinal.filter(l=>l.status==='new').length, color:'#F59E0B', icon:'·', sub:'Estado nuevo'},
          {label:'Tasa conversión',val:rLeadsFinal.length>0?Math.round(rLeadsFinal.filter(l=>l.status==='closed').length/rLeadsFinal.length*100)+'%':'0%', color:'#EC4899', icon:'%', sub:'Cerrados vs total'},
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

      {/* Charts Row 1 */}
      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:16,marginBottom:16}}>
        <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Distribución por estado</div>
            <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Cantidad de leads en cada etapa del proceso</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={(modoR==='cobranzas'?Object.entries(COBRANZA_STATUS):Object.entries(LEAD_STATUS)).map(([k,v])=>({name:v.label,value:rLeadsFinal.filter(l=>l.status===k).length,color:v.color}))}
              margin={{top:0,right:10,left:-10,bottom:40}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:10,fill:'#94A3B8'}} angle={-35} textAnchor="end" interval={0} tickLine={false} axisLine={false}/>
              <YAxis tick={{fontSize:11,fill:'#94A3B8'}} tickLine={false} axisLine={false} allowDecimals={false}/>
              <Tooltip contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12}} cursor={{fill:'rgba(59,130,246,0.05)'}} formatter={(val:any)=>[`${val} leads`,'']}/>
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {Object.entries(LEAD_STATUS).map(([,v],i)=>(<Cell key={i} fill={v.color}/>))}
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
              <Pie
                data={REPARTICIONES.map(r=>({name:r.replace('MINISTERIO DE ','Min. ').replace('SERVICIO PENITENCIARIO BONAERENSE','SPB'),value:rLeadsFinal.filter(l=>l.reparticion===r).length})).filter(d=>d.value>0)}
                cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                {REPARTICIONES.map((_,i)=>(<Cell key={i} fill={['#F59E0B','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899'][i%7]}/>))}
              </Pie>
              <Tooltip contentStyle={{background:'white',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12}} formatter={(val:any)=>[`${val} leads`,'']}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Embudo de conversión</div>
            <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Leads que avanzan por cada etapa</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={modoR==='cobranzas' ? [
                {etapa:'Nuevos',     leads:rLeadsFinal.filter(l=>l.status==='new').length},
                {etapa:'Contactados',leads:rLeadsFinal.filter(l=>l.status==='contacted').length},
                {etapa:'Resueltos',  leads:rLeadsFinal.filter(l=>l.status==='resolved').length},
                {etapa:'No resueltos',leads:rLeadsFinal.filter(l=>l.status==='unresolved').length},
              ] : [
                {etapa:'Nuevos',       leads:rLeadsFinal.filter(l=>l.status==='new').length},
                {etapa:'Contactados',  leads:rLeadsFinal.filter(l=>l.status==='contacted').length},
                {etapa:'No interesados',leads:rLeadsFinal.filter(l=>l.status==='not_interested').length},
                {etapa:'Rechazados',   leads:rLeadsFinal.filter(l=>l.status==='rejected').length},
                {etapa:'Cerrados',     leads:rLeadsFinal.filter(l=>l.status==='closed').length},
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
              <Area type="monotone" dataKey="leads" stroke="#3B82F6" strokeWidth={2} fill="url(#colorLeads)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline table */}
        <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid #F1F5F9'}}>
            <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Pipeline por asesor</div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
            <thead>
              <tr style={{background:'#F8FAFC'}}>
                {['Asesor', modoR==='cobranzas'?'Casos':'Leads', 'Contactados', modoR==='cobranzas'?'Resueltos':'Cerrados', modoR==='cobranzas'?'No resueltos':'Rechazados', '% Éxito'].map(h=>(
                  <th key={h} style={{textAlign:'left',padding:'9px 12px',fontSize:10.5,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid #E2E8F0'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {USERS.filter(u=>u.username!=='Nicolas').map(u=>{
                const asignados   = rLeadsFinal.filter(l=>l.assigned_to===u.username).length
                const exitoStatus = modoR==='cobranzas'?'resolved':'closed'
                const negStatus   = modoR==='cobranzas'?'unresolved':'rejected'
                const contactados = rLeadsFinal.filter(l=>l.assigned_to===u.username&&['contacted',exitoStatus].includes(l.status||'')).length
                const cerrados    = rLeadsFinal.filter(l=>l.assigned_to===u.username&&l.status===exitoStatus).length
                const negativos   = rLeadsFinal.filter(l=>l.assigned_to===u.username&&l.status===negStatus).length
                const pct         = asignados>0?Math.round(cerrados/asignados*100):0
                return (
                  <tr key={u.id} style={{borderBottom:'1px solid #F8FAFC'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')}
                    onMouseLeave={e=>(e.currentTarget.style.background='white')}>
                    <td style={{padding:'9px 12px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div style={{width:26,height:26,borderRadius:'50%',background:u.color,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:10,fontWeight:700,flexShrink:0}}>{u.initials}</div>
                        <div>
                          <div style={{fontWeight:600,color:'#0F172A',fontSize:12}}>{u.username}</div>
                          <div style={{fontSize:10,color:'#94A3B8'}}>{u.role}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding:'9px 12px',fontWeight:500,color:'#374151',fontFamily:"'DM Mono',monospace"}}>{asignados}</td>
                    <td style={{padding:'9px 12px',color:'#06B6D4',fontFamily:"'DM Mono',monospace"}}>{contactados}</td>
                    <td style={{padding:'9px 12px',color:'#10B981',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{cerrados}</td>
                    <td style={{padding:'9px 12px',color:'#EF4444',fontFamily:"'DM Mono',monospace"}}>{negativos}</td>
                    <td style={{padding:'9px 12px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                        <div style={{width:44,height:4,background:'#F1F5F9',borderRadius:99,overflow:'hidden'}}>
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

      {/* Charts Row 3 */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:16,marginBottom:20}}>
        <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 20px 12px'}}>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>Salud de la operación</div>
            <div style={{fontSize:11,color:'#94A3B8',marginTop:2,fontFamily:"'DM Mono',monospace"}}>Estados positivos vs negativos</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <RadialBarChart innerRadius="25%" outerRadius="90%"
              data={modoR==='cobranzas' ? [
                {name:'Resueltos',   value:rLeadsFinal.filter(l=>l.status==='resolved').length,   fill:'#10B981'},
                {name:'Contactados', value:rLeadsFinal.filter(l=>l.status==='contacted').length,  fill:'#06B6D4'},
                {name:'No resueltos',value:rLeadsFinal.filter(l=>l.status==='unresolved').length, fill:'#EF4444'},
              ] : [
                {name:'Cerrados',       value:rLeadsFinal.filter(l=>l.status==='closed').length,        fill:'#10B981'},
                {name:'Contactados',    value:rLeadsFinal.filter(l=>l.status==='contacted').length,     fill:'#06B6D4'},
                {name:'No interesados', value:rLeadsFinal.filter(l=>l.status==='not_interested').length,fill:'#6B7280'},
                {name:'Rechazados',     value:rLeadsFinal.filter(l=>l.status==='rejected').length,      fill:'#EF4444'},
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
                const asignados   = rLeadsFinal.filter(l=>l.assigned_to===u.username).length
                const exitoStatus = modoR==='cobranzas'?'resolved':'closed'
                const contactados = rLeadsFinal.filter(l=>l.assigned_to===u.username&&['contacted',exitoStatus].includes(l.status||'')).length
                const cerrados    = rLeadsFinal.filter(l=>l.assigned_to===u.username&&l.status===exitoStatus).length
                const pct         = asignados>0?Math.round(cerrados/asignados*100):0
                return (
                  <tr key={u.id} style={{borderBottom:'1px solid #F8FAFC'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')}
                    onMouseLeave={e=>(e.currentTarget.style.background='white')}>
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
}
