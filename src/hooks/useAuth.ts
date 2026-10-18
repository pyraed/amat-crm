// ─────────────────────────────────────────────────────────────────────────────
//  HOOKS · USE AUTH
//  Maneja login, bloqueo por intentos, countdown y persistencia en localStorage.
//
//  Por qué existe: toda la lógica de autenticación local vivía dispersa en
//  BandejaClient entre useState, useEffect y handleLogin.
//
//  Qué ocurriría si desaparece: el componente perdería la pantalla de login
//  y el control de sesión.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { USERS, SysUser } from '@/domain/entities/users'

export function useAuth() {
  const [me, setMe]           = useState<SysUser|null>(null)
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginErr, setLoginErr]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [attempts, setAttempts]   = useState(0)
  const [locked, setLocked]       = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [rememberMe, setRememberMe] = useState(false)
  const userRef = useRef<HTMLInputElement>(null)

  // Cargar usuario guardado al montar (NO la contraseña)
  useEffect(()=>{
    const savedUser = localStorage.getItem('amat_remember_user')
    if(savedUser) {
      setLoginUser(savedUser)
      setRememberMe(true)
    }
  },[])

  // Focus en el input de usuario cuando no hay sesión
  useEffect(()=>{ if(!me) setTimeout(()=>userRef.current?.focus(), 100) },[me])

  // Countdown de bloqueo por intentos fallidos
  useEffect(()=>{
    if(countdown <= 0) return
    const t = setTimeout(()=>{
      setCountdown(c => {
        if(c <= 1){ setLocked(false); setAttempts(0) }
        return c - 1
      })
    }, 1000)
    return ()=>clearTimeout(t)
  },[countdown])

  const handleLogin = () => {
    if(locked) return
    const u = USERS.find(u =>
      u.username.toUpperCase() === loginUser.trim().toUpperCase() && u.password === loginPass
    )
    if(u){
      setMe(u); setLoginErr(''); setAttempts(0)
      if(rememberMe){
        localStorage.setItem('amat_remember_user', loginUser.trim().toUpperCase())
      } else {
        localStorage.removeItem('amat_remember_user')
      }
    } else {
      const a = attempts + 1; setAttempts(a)
      if(a >= 5){ setLocked(true); setCountdown(30); setLoginErr('Demasiados intentos. Bloqueado 30s.') }
      else setLoginErr(`Incorrecto. Intentos restantes: ${5 - a}`)
    }
  }

  const handleLogout = () => setMe(null)

  const handleRememberMe = (checked: boolean) => {
    setRememberMe(checked)
    if(!checked){
      localStorage.removeItem('amat_remember_user')
    }
  }

  return {
    me, userRef,
    loginUser, setLoginUser,
    loginPass, setLoginPass,
    loginErr, showPass, setShowPass,
    locked, countdown, rememberMe,
    handleLogin, handleLogout, handleRememberMe,
  }
}
