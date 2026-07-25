'use client'

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTS · LOGIN SCREEN
//  Pantalla de login completa. Autocontenida — no depende de ningún estado
//  de la app, solo recibe los valores y callbacks de useAuth.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'

type Props = {
  userRef:        React.RefObject<HTMLInputElement | null>
  loginUser:      string
  setLoginUser:   (v: string) => void
  loginPass:      string
  setLoginPass:   (v: string) => void
  loginErr:       string
  showPass:       boolean
  setShowPass:    (v: boolean | ((p: boolean) => boolean)) => void
  locked:         boolean
  countdown:      number
  rememberMe:     boolean
  handleRememberMe: (checked: boolean) => void
  handleLogin:    () => void
}

export default function LoginScreen({
  userRef, loginUser, setLoginUser, loginPass, setLoginPass,
  loginErr, showPass, setShowPass,
  locked, countdown, rememberMe, handleRememberMe, handleLogin,
}: Props) {
  return (
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
          <input ref={userRef} className="li mono" placeholder="Usuario" value={loginUser}
            onChange={e=>setLoginUser(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleLogin()}
            disabled={locked}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{display:'block',fontSize:11,fontWeight:500,color:'#64748B',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Contraseña</label>
          <div style={{position:'relative'}}>
            <input className="li" type={showPass?'text':'password'} placeholder="••••••••••••"
              value={loginPass}
              onChange={e=>setLoginPass(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleLogin()}
              disabled={locked}/>
            <button onClick={()=>setShowPass(p=>!p)}
              style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#475569',fontSize:16}}
              tabIndex={-1}>
              {showPass?'🙈':'👁'}
            </button>
          </div>
        </div>
        {loginErr&&(
          <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.2)',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#FCA5A5'}}>
            ⚠️ {loginErr}
          </div>
        )}
        {locked&&(
          <div style={{background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.2)',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#FCD34D',textAlign:'center'}}>
            🔒 {countdown}s...
          </div>
        )}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
          <input type="checkbox" id="rememberMe" checked={rememberMe}
            onChange={e=>handleRememberMe(e.target.checked)}
            style={{width:15,height:15,accentColor:'#F59E0B',cursor:'pointer'}}/>
          <label htmlFor="rememberMe" style={{fontSize:12,color:'#475569',cursor:'pointer',userSelect:'none'}}>
            Recordar usuario
          </label>
        </div>
        <button onClick={handleLogin} disabled={locked}
          style={{width:'100%',background:'linear-gradient(135deg,#B45309,#F59E0B)',border:'none',borderRadius:12,padding:14,color:'white',fontSize:14,fontWeight:600,cursor:locked?'not-allowed':'pointer',fontFamily:'inherit',opacity:locked?.5:1}}>
          {locked?'🔒 Bloqueado':'Iniciar sesión'}
        </button>
      </div>
    </div>
  )
}
