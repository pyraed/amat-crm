'use client'

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTS · TOP BAR
//  Barra superior con logo, tabs de navegación, stats y usuario.
// ─────────────────────────────────────────────────────────────────────────────

import { SysUser } from '@/domain/entities/users'

type Tab = 'bandeja' | 'consultas' | 'base' | 'documentacion' | 'reportes'

type Stats = {
  inbound:    number
  activos:    number
  pendientes: number
  cerrados:   number
}

type Props = {
  me:          SysUser
  tab:         Tab
  setTab:      (t: Tab) => void
  setTabLoading: (v: boolean) => void
  stats:       Stats
  handleLogout: () => void
  onSync?:     () => void
}

const TABS = [
  ['bandeja',   '💬', 'Bandeja'],
  ['consultas', '📥', 'Consultas'],
  ['base',      '👥', 'Base'],
  ['documentacion', '📄', 'Documentación'],
  ['reportes',  '📊', 'Reportes'],
] as const

export default function TopBar({ me, tab, setTab, setTabLoading, stats, handleLogout, onSync }: Props) {
  const handleTabClick = (t: Tab) => {
    if(tab === t) return
    const tieneSpinnerPropio = ['consultas','base','documentacion','reportes'].includes(t)
    if(tieneSpinnerPropio) {
      setTab(t)
    } else {
      setTabLoading(true)
      setTimeout(()=>{ setTab(t); setTabLoading(false) }, 30)
    }
  }

  return (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 20px',background:'white',borderBottom:'1px solid #E2E8F0',flexShrink:0,minHeight:56}}>
      <div style={{width:34,height:34,background:'linear-gradient(135deg,#B45309,#F59E0B)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>🏦</div>
      <span style={{fontWeight:700,fontSize:15,color:'#0F172A',marginRight:6,whiteSpace:'nowrap'}}>AMAT · CRM</span>

      <div style={{display:'flex',gap:2,background:'#F1F5F9',padding:3,borderRadius:10}}>
        {TABS.map(([t, icon, label])=>(
          <button key={t} className={`tabbtn ${tab===t?'on':''}`} onClick={()=>handleTabClick(t as Tab)}>
            {icon} {label}
          </button>
        ))}
      </div>

      <div style={{display:'flex',gap:16,marginLeft:16}}>
        {[
          {v:stats.inbound,    l:'Inbound mes',    c:'#F59E0B'},
          {v:stats.activos,    l:'Activos',         c:'#8B5CF6'},
          {v:stats.pendientes, l:'Pendientes',       c:'#EF4444'},
          {v:stats.cerrados,   l:'Cerrados mes',     c:'#10B981'},
        ].map(s=>(
          <div key={s.l} style={{textAlign:'center',lineHeight:1}}>
            <div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.v}</div>
            <div style={{fontSize:10,color:'#94A3B8',marginTop:2,whiteSpace:'nowrap'}}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:32,height:32,borderRadius:'50%',background:me.color,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:11,fontWeight:700}}>
          {me.initials}
        </div>
        <div style={{lineHeight:1.3}}>
          <div style={{fontSize:12,fontWeight:600,color:'#1E293B'}}>{me.username}</div>
          <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,fontWeight:600,
            background:me.role==='Administrador'?'#EFF6FF':me.role==='Vendedor'?'#F0FDF4':'#F5F3FF',
            color:me.role==='Administrador'?'#1D4ED8':me.role==='Vendedor'?'#15803D':'#6D28D9'}}>
            {me.role}
          </span>
        </div>
        {onSync&&(
          <button onClick={onSync} title="Sincronizar estados desincronizados"
            style={{padding:'5px 12px',border:'1px solid #E2E8F0',borderRadius:8,background:'white',fontSize:12,cursor:'pointer',color:'#64748B',fontFamily:'inherit',fontWeight:500}}>
            🔄 Sync
          </button>
        )}
        <button onClick={handleLogout}
          style={{padding:'5px 12px',border:'1px solid #E2E8F0',borderRadius:8,background:'white',fontSize:12,cursor:'pointer',color:'#64748B',fontFamily:'inherit',fontWeight:500}}>
          Salir
        </button>
      </div>
    </div>
  )
}
