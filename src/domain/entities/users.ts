// ─────────────────────────────────────────────────────────────────────────────
//  DOMAIN · ENTITIES · USERS
//  Modelo de usuarios del sistema y lista canónica de operadores.
//
//  Por qué existe: centralizar la definición de roles y el directorio de
//  usuarios para que cualquier parte del sistema que necesite verificar
//  permisos o listar operadores importe desde acá.
//
//  Qué ocurriría si desaparece: el componente perdería los tipos Role y
//  SysUser, y la lista USERS dejaría de estar disponible para auth y UI.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'Administrador' | 'Vendedor' | 'Cobranza'

export type SysUser = {
  id:          string
  username:    string
  password:    string
  displayName: string
  role:        Role
  initials:    string
  color:       string
}

export const USERS: SysUser[] = [
  { id:'1',  username:'Walter',     password:'Walter#2026',  displayName:'Walter',     role:'Administrador', initials:'WA', color:'#B45309' },
  { id:'2',  username:'Muse',       password:'Muse#2026',    displayName:'Muse',       role:'Administrador', initials:'MU', color:'#92400E' },
  { id:'9',  username:'Nicolas',    password:'Nicolas2026',  displayName:'Nicolas',    role:'Administrador', initials:'NI', color:'#1D4ED8' },
  { id:'3',  username:'Valentin',   password:'Mutual2026',   displayName:'Valentin',   role:'Vendedor',      initials:'VA', color:'#D97706' },
  { id:'4',  username:'Juan',       password:'Mutual2026',   displayName:'Juan',       role:'Vendedor',      initials:'JU', color:'#F59E0B' },
  { id:'5',  username:'Eliseo',     password:'Mutual2026',   displayName:'Eliseo',     role:'Vendedor',      initials:'EL', color:'#10B981' },
  { id:'6',  username:'Maxi',       password:'Mutual2026',   displayName:'Maxi',       role:'Vendedor',      initials:'MX', color:'#3B82F6' },
  { id:'7',  username:'Facundo',    password:'Mutual2026',   displayName:'Facundo',    role:'Vendedor',      initials:'FA', color:'#8B5CF6' },
  { id:'8',  username:'Emanuel',    password:'Mutual2026',   displayName:'Emanuel',    role:'Cobranza',      initials:'EM', color:'#7C3AED' },
  { id:'10', username:'Matias',     password:'Mutual2026',   displayName:'Matias',     role:'Vendedor',      initials:'MT', color:'#0EA5E9' },
  { id:'11', username:'Gonzalo',    password:'Mutual2026',   displayName:'Gonzalo',    role:'Vendedor',      initials:'GO', color:'#06B6D4' },
  { id:'12', username:'Mariano',    password:'Mutual2026',   displayName:'Mariano',    role:'Administrador', initials:'MR', color:'#EC4899' },
  { id:'13', username:'VENTAS_MG1', password:'Mg2026',       displayName:'Ventas MG1', role:'Vendedor',      initials:'M1', color:'#F97316' },
  { id:'14', username:'VENTAS_MG2', password:'Mg2026',       displayName:'Ventas MG2', role:'Vendedor',      initials:'M2', color:'#84CC16' },
  { id:'15', username:'VENTAS_MG3', password:'Mg2026',       displayName:'Ventas MG3', role:'Vendedor',      initials:'M3', color:'#06B6D4' },
]
