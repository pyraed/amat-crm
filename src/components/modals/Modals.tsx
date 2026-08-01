'use client'

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTS · MODALS
//  Todos los modales del sistema en un solo archivo.
//  Cada modal es una función exportada que recibe sus props exactas.
//  Ninguno tiene estado propio — todo viene del componente padre.
//
//  Modales incluidos:
//    ModalCambiarEstado, ModalAsignar, ModalNota, ModalRechazar,
//    ModalEditar, ModalFinalizar, ModalVenta, ModalGestionarConsulta
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import { LoanLead } from '@/lib/types'
import { USERS } from '@/domain/entities/users'
import {
  LEAD_STATUS, COBRANZA_STATUS, ESTADOS_FINALES,
  OPCIONES_VENTAS, OPCIONES_VENTAS_INTERMEDIOS, OPCIONES_COBRANZAS,
} from '@/domain/entities/leadStatus'
import { REPARTICIONES, BANCOS, REJECTION_REASONS, TEMPLATES } from '@/domain/entities/catalogs'
import { TABLAS_CUOTA, calcularCuotaAMAT, esReparticionIntegra, calcularCuotaIntegra, getCapitalesIntegra, CUOTA_SOCIAL_INTEGRA } from '@/domain/calculations/cuotas'
import { consultaStatusToLeadStatus } from '@/domain/workflows/statusMapping'
import { supabase } from '@/lib/supabase'
import { updateConsulta, insertConsulta } from '@/services/consulta.service'
import { tomarLead } from '@/services/lead.service'
import { registrarCampana } from '@/services/chat.service'

// ── Tipos compartidos ─────────────────────────────────────────────────────────
type VentaForm = {
  entidad: string; linea: string; reparticion: string
  monto: string; cuotas: string; valor_cuota: string; notas: string
}

// ── ModalCambiarEstado ────────────────────────────────────────────────────────
type ModalCambiarEstadoProps = {
  currentLead:       LoanLead
  flujoMap:          Record<string, string>
  updateStatus:      (id: number, status: string) => void
  setShowStatusModal:(v: boolean) => void
  setEditTarget:     (l: LoanLead) => void
  setShowRejectModal:(v: boolean) => void
  setVentaForm:      (f: VentaForm) => void
  setShowVentaModal: (v: boolean) => void
}

export function ModalCambiarEstado({
  currentLead, flujoMap, updateStatus,
  setShowStatusModal, setEditTarget, setShowRejectModal,
  setVentaForm, setShowVentaModal,
}: ModalCambiarEstadoProps) {
  const [flujoSeleccionado, setFlujoSeleccionado] = React.useState<'solicitud'|'cobranzas'|null>(null)

  const esCobranza = flujoSeleccionado === 'cobranzas'
  const opciones = flujoSeleccionado ? [
    ...(esCobranza ? OPCIONES_COBRANZAS : []),
    ...OPCIONES_VENTAS_INTERMEDIOS,
    ...(esCobranza ? [] : OPCIONES_VENTAS),
  ] : []

  return (
    <div className="movo" onClick={()=>{ setShowStatusModal(false); setFlujoSeleccionado(null) }}>
      <div className="mod" onClick={e=>e.stopPropagation()}>
        <h3>Cambiar estado</h3>

        {!flujoSeleccionado && (<>
          <div style={{fontSize:12,color:'#64748B',marginBottom:12}}>¿A qué flujo corresponde esta gestión?</div>
          <div className="mopt" onClick={()=>setFlujoSeleccionado('solicitud')}>
            <div style={{width:10,height:10,borderRadius:'50%',background:'#2563EB',flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500,color:'#1E293B'}}>💼 Ventas</div>
              <div style={{fontSize:11,color:'#94A3B8'}}>Vendido, rechazado, no interesado, sin respuesta</div>
            </div>
          </div>
          <div className="mopt" onClick={()=>setFlujoSeleccionado('cobranzas')}>
            <div style={{width:10,height:10,borderRadius:'50%',background:'#7C3AED',flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500,color:'#1E293B'}}>🔔 Cobranzas</div>
              <div style={{fontSize:11,color:'#94A3B8'}}>Resuelto, no resuelto</div>
            </div>
          </div>
        </>)}

        {flujoSeleccionado && (<>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <button onClick={()=>setFlujoSeleccionado(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#64748B',fontSize:18,padding:0,lineHeight:1}}>←</button>
            <span style={{fontSize:12,color:'#64748B'}}>{esCobranza ? '🔔 Cobranzas' : '💼 Ventas'}</span>
          </div>
          {opciones
            .map(k => [k, LEAD_STATUS[k] || COBRANZA_STATUS[k]] as [string, typeof LEAD_STATUS[keyof typeof LEAD_STATUS]])
            .filter(([,v])=>v)
            .map(([k,v])=>(
              <div key={k} className="mopt" onClick={()=>{
                if(!esCobranza && k==='rejected') {
                  setShowStatusModal(false); setFlujoSeleccionado(null); setEditTarget(currentLead); setShowRejectModal(true)
                } else if(!esCobranza && k==='closed') {
                  setShowStatusModal(false); setFlujoSeleccionado(null)
                  setVentaForm({entidad:'',linea:'',reparticion:currentLead.reparticion||'',monto:'',cuotas:'',valor_cuota:'',notas:''})
                  setShowVentaModal(true)
                } else {
                  updateStatus(currentLead.id, k); setShowStatusModal(false); setFlujoSeleccionado(null)
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
            ))}
        </>)}

        <button className="btn" style={{width:'100%',justifyContent:'center',marginTop:14}} onClick={()=>{ setShowStatusModal(false); setFlujoSeleccionado(null) }}>Cancelar</button>
      </div>
    </div>
  )
}

// ── ModalAsignar ──────────────────────────────────────────────────────────────
type ModalAsignarProps = {
  currentLead:       LoanLead
  setBotLeads:       React.Dispatch<React.SetStateAction<LoanLead[]>>
  setShowAssignModal:(v: boolean) => void
}

export function ModalAsignar({ currentLead, setBotLeads, setShowAssignModal }: ModalAsignarProps) {
  return (
    <div className="movo" onClick={()=>setShowAssignModal(false)}>
      <div className="mod" onClick={e=>e.stopPropagation()}>
        <h3>Asignar a un asesor</h3>
        {USERS.map(u=>(
          <div key={u.id} className="mopt" onClick={async()=>{
            const res = await tomarLead({...currentLead, assigned_to: null}, u.username)
            if(!res.ok) { alert('❌ No se pudo asignar. Intentá de nuevo.'); return }
            setBotLeads(prev => prev.map(l => l.id===currentLead.id ? {...l, assigned_to: u.username, status:'contacted'} : l))
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
          setBotLeads(prev => prev.map(l => l.id===currentLead.id ? {...l, assigned_to: null} : l))
          setShowAssignModal(false)
        }}>
          <span style={{fontSize:13,color:'#EF4444'}}>Quitar asignación</span>
        </div>
        <button className="btn" style={{width:'100%',justifyContent:'center',marginTop:8}} onClick={()=>setShowAssignModal(false)}>Cancelar</button>
      </div>
    </div>
  )
}

// ── ModalNota ─────────────────────────────────────────────────────────────────
type ModalNotaProps = {
  noteText:          string
  setNoteText:       (v: string) => void
  saveNote:          () => void
  setShowNoteModal:  (v: boolean) => void
}

export function ModalNota({ noteText, setNoteText, saveNote, setShowNoteModal }: ModalNotaProps) {
  return (
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
  )
}

// ── ModalRechazar ─────────────────────────────────────────────────────────────
type ModalRechazarProps = {
  editTarget:        LoanLead
  rejectReason:      string
  setRejectReason:   (v: string) => void
  handleReject:      () => void
  setShowRejectModal:(v: boolean) => void
}

export function ModalRechazar({ editTarget, rejectReason, setRejectReason, handleReject, setShowRejectModal }: ModalRechazarProps) {
  return (
    <div className="movo" onClick={()=>setShowRejectModal(false)}>
      <div className="mod" onClick={e=>e.stopPropagation()}>
        <h3>✕ Motivo de rechazo</h3>
        {REJECTION_REASONS.map(r=>(
          <div key={r} className="mopt"
            style={{background:rejectReason===r?'#FEF2F2':'',borderColor:rejectReason===r?'#FECACA':''}}
            onClick={()=>setRejectReason(r)}>
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
  )
}

// ── ModalEditar ───────────────────────────────────────────────────────────────
type ModalEditarProps = {
  editTarget:        LoanLead
  editForm:          Partial<LoanLead>
  setEditForm:       React.Dispatch<React.SetStateAction<Partial<LoanLead>>>
  editSaving:        boolean
  saveEdit:          () => void
  setShowEditModal:  (v: boolean) => void
  isAdmin:           boolean
}

export function ModalEditar({ editTarget, editForm, setEditForm, editSaving, saveEdit, setShowEditModal, isAdmin }: ModalEditarProps) {
  return (
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
          {isAdmin&&(
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
          <button className="btn pri" style={{flex:1,justifyContent:'center'}} onClick={saveEdit} disabled={editSaving}>
            {editSaving?'Guardando...':'💾 Guardar'}
          </button>
          <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowEditModal(false)}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── ModalPlantillas ───────────────────────────────────────────────────────────
type ModalPlantillasProps = {
  editTarget:           LoanLead
  selectedTemplate:     typeof TEMPLATES[0] | null
  setSelectedTemplate:  (t: typeof TEMPLATES[0] | null) => void
  templateVars:         Record<string, string>
  setTemplateVars:      React.Dispatch<React.SetStateAction<Record<string,string>>>
  applyTemplate:        (tpl: typeof TEMPLATES[0], lead: LoanLead) => void
  updateStatus:         (id: number, status: string) => void
  setShowTemplateModal: (v: boolean) => void
  operadorName:         string
}

export function ModalPlantillas({
  editTarget, selectedTemplate, setSelectedTemplate,
  templateVars, setTemplateVars, applyTemplate,
  updateStatus, setShowTemplateModal, operadorName,
}: ModalPlantillasProps) {
  return (
    <div className="movo" onClick={()=>setShowTemplateModal(false)}>
      <div className="mod" onClick={e=>e.stopPropagation()}>
        <h3>💬 Plantillas de mensaje</h3>
        {!selectedTemplate ? (
          <>
            <p style={{fontSize:13,color:'#64748B',marginBottom:14}}>Seleccioná una plantilla para contactar a <strong>{editTarget.full_name}</strong>:</p>
            {TEMPLATES.filter(t=>['ayuda_economica','recontacto'].includes(t.id)).map(tpl=>(
              <div key={tpl.id} className="tcard" onClick={()=>applyTemplate(tpl, editTarget)}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{fontSize:12,fontWeight:600,color:'#1E293B'}}>{tpl.name}</span>
                  <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#EFF6FF',color:'#1D4ED8',fontWeight:600}}>{tpl.category}</span>
                </div>
                <div style={{fontSize:12,color:'#64748B',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{tpl.body.substring(0,120)}...</div>
              </div>
            ))}
          </>
        ) : (
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
                if(!editTarget?.phone_number) return
                try {
                  const controller = new AbortController()
                  const timeout = setTimeout(()=>controller.abort(), 8000)
                  await fetch('/api/send-message',{
                    method:'POST',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({ phone: editTarget.phone_number, template: selectedTemplate.id, senderName: operadorName }),
                    signal: controller.signal,
                  })
                  clearTimeout(timeout)
                } catch(e) {
                  console.error('[ModalPlantillas] timeout o error:', e)
                } finally {
                  await registrarCampana({ phone: editTarget.phone_number!, dni: editTarget.dni, plantilla: selectedTemplate.id, operador: operadorName })
                  await updateStatus(editTarget.id, 'contacted')
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
  )
}

// ── ModalFinalizar ────────────────────────────────────────────────────────────
type ModalFinalizarProps = {
  currentLead:          LoanLead
  flujoMap:             Record<string, string>
  finalizarEstado:      string
  setFinalizarEstado:   (v: string) => void
  finalizarNota:        string
  setFinalizarNota:     (v: string) => void
  updateStatus:         (id: number, status: string) => void
  finalizarConversacion:(nota?: string) => void
  setShowFinalizarModal:(v: boolean) => void
}

export function ModalFinalizar({
  currentLead, flujoMap,
  finalizarEstado, setFinalizarEstado,
  finalizarNota, setFinalizarNota,
  updateStatus, finalizarConversacion, setShowFinalizarModal,
}: ModalFinalizarProps) {
  const flujo = flujoMap[currentLead.phone_number||'']||'solicitud'
  const estadosFinales = flujo==='cobranzas' ? ['resolved','unresolved'] : ['not_interested','rejected','closed']
  const yaFinalizado   = estadosFinales.includes(currentLead.status||'')
  const statusOpts     = flujo==='cobranzas'
    ? Object.entries(COBRANZA_STATUS).filter(([k])=>['resolved','unresolved'].includes(k))
    : [
        ['rejected',       {label:'Rechazado',    bg:'#FEF2F2',text:'#991B1B'}],
        ['not_interested', {label:'No interesado',bg:'#F9FAFB',text:'#374151'}],
      ] as [string, {label:string;bg:string;text:string}][]
  const puedeConfirmar = yaFinalizado || !!finalizarEstado
  const estadoLabel    = (flujo==='cobranzas'?COBRANZA_STATUS:LEAD_STATUS)[currentLead.status||'']?.label || currentLead.status

  return (
    <div className="movo" onClick={()=>{ setShowFinalizarModal(false); setFinalizarEstado(''); setFinalizarNota('') }}>
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
              {statusOpts.map(([k,v])=>(<option key={k} value={k}>{(v as any).label}</option>))}
            </select>
          </div>
        )}
        {!yaFinalizado&&(
          <div style={{marginBottom:12}}>
            <label className="fl">Anotación <span style={{color:'#94A3B8',fontWeight:400}}>(opcional)</span></label>
            <textarea className="ta" style={{minHeight:64}} placeholder="Describí qué se resolvió, motivo de cierre..." value={finalizarNota} onChange={e=>setFinalizarNota(e.target.value)}/>
          </div>
        )}
        <div style={{display:'flex',gap:8}}>
          <button className="btn pri" style={{flex:1,justifyContent:'center',opacity:puedeConfirmar?1:0.4}} disabled={!puedeConfirmar}
            onClick={async()=>{
              if(!yaFinalizado&&finalizarEstado) await updateStatus(currentLead.id, finalizarEstado)
              finalizarConversacion(yaFinalizado?undefined:finalizarNota)
            }}>
            ✓ {yaFinalizado ? 'Sí, cerrar conversación' : 'Confirmar y finalizar'}
          </button>
          <button className="btn" onClick={()=>{ setShowFinalizarModal(false); setFinalizarEstado(''); setFinalizarNota('') }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── ModalVenta ────────────────────────────────────────────────────────────────
type ModalVentaProps = {
  currentLead:       LoanLead
  ventaForm:         VentaForm
  setVentaForm:      React.Dispatch<React.SetStateAction<VentaForm>>
  guardarVenta:      () => void
  setShowVentaModal: (v: boolean) => void
}

export function ModalVenta({ currentLead, ventaForm, setVentaForm, guardarVenta, setShowVentaModal }: ModalVentaProps) {
  const montoNum  = parseInt(ventaForm.monto)||0
  const cuotasNum = parseInt(ventaForm.cuotas)||0
  const fmtP = (n:number) => n>0 ? '$ '+n.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.') : '—'
  const fmt  = (n:number) => '$ '+n.toLocaleString('es-AR')

  // Detectar si la repartición usa grilla Integra Fin
  const esIntegra = esReparticionIntegra(ventaForm.reparticion)

  // Cálculo según grilla
  const resultadoIntegra = esIntegra && montoNum && cuotasNum
    ? calcularCuotaIntegra(montoNum, cuotasNum) : null
  const calcCuota = esIntegra
    ? (resultadoIntegra?.cuota || 0)
    : (ventaForm.entidad&&ventaForm.linea&&ventaForm.reparticion&&montoNum&&cuotasNum
        ? calcularCuotaAMAT(ventaForm.entidad, ventaForm.linea, ventaForm.reparticion, montoNum, cuotasNum) : 0)

  // Cuotas disponibles según grilla
  const cuotasDisponibles = esIntegra ? [12,18,24] : [6,12,18,24]

  // Selector de capital/monto
  const capitalesIntegra = esIntegra ? getCapitalesIntegra(cuotasNum||12) : []

  return (
    <div className="movo" onClick={()=>setShowVentaModal(false)}>
      <div className="mod" onClick={e=>e.stopPropagation()} style={{width:560}}>
        <h3>🎉 Registrar venta cerrada</h3>
        <p style={{fontSize:12,color:'#64748B',marginBottom:14}}>
          {esIntegra
            ? '📋 Grilla Integra Fin — Ejército / Gendarmería / FFAA'
            : 'El valor de cuota se calcula automáticamente con la grilla AMAT.'}
        </p>

        {/* Badge de grilla activa */}
        {esIntegra&&(
          <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'#1D4ED8',display:'flex',alignItems:'center',gap:6}}>
            ℹ️ Esta repartición usa la grilla <strong>AMAT + Integra Fin</strong>. Cuota social fija: {fmt(CUOTA_SOCIAL_INTEGRA)}/mes incluida en la cuota.
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          {/* Entidad y línea — solo para grilla AMAT */}
          {!esIntegra&&(<>
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
          </>)}

          {/* Repartición */}
          <div style={{gridColumn:'1/-1'}}>
            <label className="fl">Repartición</label>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {REPARTICIONES.map(r=>(
                <button key={r}
                  style={{padding:'6px 10px',borderRadius:7,borderWidth:1,borderStyle:'solid',
                    borderColor:ventaForm.reparticion===r?'#B45309':'#E2E8F0',
                    background:ventaForm.reparticion===r?'#FFFBEB':'white',
                    fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                    color:ventaForm.reparticion===r?'#B45309':'#374151'}}
                  onClick={()=>setVentaForm(f=>({...f,reparticion:r,monto:'',cuotas:'',entidad:esReparticionIntegra(r)?'AMAT+INTEGRA':f.entidad,linea:esReparticionIntegra(r)?'Haberes':f.linea}))}>
                  {r.replace('MINISTERIO DE ','Min. ').replace('SERVICIO PENITENCIARIO BONAERENSE','SPB')}
                  {esReparticionIntegra(r)&&<span style={{marginLeft:4,fontSize:9,color:'#1D4ED8'}}>★</span>}
                </button>
              ))}
            </div>
            <div style={{fontSize:10,color:'#94A3B8',marginTop:4}}>★ Grilla Integra Fin</div>
          </div>

          {/* Capital (Integra) o Monto (AMAT) */}
          <div>
            <label className="fl">{esIntegra ? 'Capital' : 'Monto'}</label>
            {esIntegra ? (
              <select className="fs" value={ventaForm.monto||''} onChange={e=>setVentaForm(f=>({...f,monto:e.target.value}))}>
                <option value="">— Seleccioná el capital —</option>
                {capitalesIntegra.map(cap=>{
                  const res = calcularCuotaIntegra(cap, cuotasNum||12)
                  return (
                    <option key={cap} value={cap}>
                      {fmt(cap)} → neto {fmt(cap-20000)}{res?` · cuota ${fmtP(res.cuota)}`:''}
                    </option>
                  )
                })}
              </select>
            ) : (
              <select className="fs" value={ventaForm.monto||''} onChange={e=>setVentaForm(f=>({...f,monto:e.target.value}))}>
                <option value="">— Seleccioná un monto —</option>
                {Object.keys(TABLAS_CUOTA[cuotasNum||12]||TABLAS_CUOTA[12]).map(Number).sort((a,b)=>a-b).map(m=>(
                  <option key={m} value={m}>
                    {'$'+m.toLocaleString('es-AR')+(ventaForm.cuotas&&TABLAS_CUOTA[cuotasNum]?.[m]?' → $'+TABLAS_CUOTA[cuotasNum][m].toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}):'')}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Cuotas */}
          <div>
            <label className="fl">Cuotas</label>
            <div style={{display:'flex',gap:5}}>
              {cuotasDisponibles.map(n=>(
                <button key={n} style={{flex:1,padding:'8px 4px',borderRadius:7,borderWidth:1,borderStyle:'solid',borderColor:cuotasNum===n?'#F59E0B':'#E2E8F0',background:cuotasNum===n?'#FFFBEB':'white',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Mono',monospace",color:cuotasNum===n?'#B45309':'#374151'}}
                  onClick={()=>setVentaForm(f=>({...f,cuotas:String(n)}))}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Panel de resultado — muestra capital + neto para Integra, solo cuota para AMAT */}
        {calcCuota>0&&(
          <div style={{background:'#ECFDF5',border:'1px solid #BBF7D0',borderRadius:10,padding:'12px 16px',marginBottom:12}}>
            {esIntegra&&resultadoIntegra ? (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <div>
                  <div style={{fontSize:10,color:'#065F46',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:2}}>Capital</div>
                  <div style={{fontSize:18,fontWeight:700,color:'#065F46'}}>{fmt(montoNum)}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:'#065F46',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:2}}>Monto neto cliente</div>
                  <div style={{fontSize:18,fontWeight:700,color:'#1D4ED8'}}>{fmt(resultadoIntegra.montoNeto)}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:'#065F46',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:2}}>Cuota mensual</div>
                  <div style={{fontSize:18,fontWeight:700,color:'#065F46'}}>{fmtP(calcCuota)}</div>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:11,color:'#065F46',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:2}}>Total por cuota</div>
                  <div style={{fontSize:26,fontWeight:700,color:'#065F46'}}>{fmtP(calcCuota)}</div>
                </div>
                <div style={{textAlign:'right',fontSize:12,color:'#047857'}}>
                  <div>{ventaForm.entidad} · {ventaForm.linea}</div>
                  <div>${montoNum.toLocaleString('es-AR')} · {ventaForm.cuotas} cuotas</div>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{marginBottom:12}}>
          <label className="fl">Notas (opcional)</label>
          <textarea className="ta" style={{minHeight:56}} value={ventaForm.notas} onChange={e=>setVentaForm(f=>({...f,notas:e.target.value}))}/>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={{flex:2,padding:'10px',background:'linear-gradient(135deg,#059669,#10B981)',color:'white',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
            opacity:((!ventaForm.reparticion||!ventaForm.monto||!ventaForm.cuotas)||(esIntegra?false:(!ventaForm.entidad||!ventaForm.linea)))?0.4:1}}
            disabled={!ventaForm.reparticion||!ventaForm.monto||!ventaForm.cuotas||(esIntegra?false:(!ventaForm.entidad||!ventaForm.linea))}
            onClick={()=>{ setVentaForm(f=>({...f,valor_cuota:String(calcCuota)})); setTimeout(guardarVenta,50) }}>
            💾 Guardar venta
          </button>
          <button className="btn" style={{flex:1}} onClick={()=>setShowVentaModal(false)}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── ModalGestionarConsulta ────────────────────────────────────────────────────
type ModalGestionarConsultaProps = {
  consultaSelected:     any
  consultaEdit:         {vendedor:string; situacion:string; estado:string}
  setConsultaEdit:      React.Dispatch<React.SetStateAction<{vendedor:string;situacion:string;estado:string}>>
  setShowConsultaModal: (v: boolean) => void
  setBotLeads:          React.Dispatch<React.SetStateAction<LoanLead[]>>
  setSelectedPhone:     (p: string | null) => void
  selectedPhone:        string | null
  loadConsultas:        () => void
}

export function ModalGestionarConsulta({
  consultaSelected, consultaEdit, setConsultaEdit,
  setShowConsultaModal, setBotLeads, setSelectedPhone, selectedPhone, loadConsultas,
}: ModalGestionarConsultaProps) {
  return (
    <div className="movo" onClick={()=>setShowConsultaModal(false)}>
      <div className="mod" onClick={e=>e.stopPropagation()} style={{width:560}}>
        <h3>📥 Gestionar consulta</h3>
        <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[
              ['Nombre',      consultaSelected.nombre_apellido],
              ['DNI',         consultaSelected.dni],
              ['Teléfono',    consultaSelected.phone],
              ['Email',       consultaSelected.email],
              ['Repartición', consultaSelected.reparticion_label],
              ['Flujo',       consultaSelected.flujo==='cobranzas'?'Cobranzas':'Solicitud'],
              ['Prestación',  consultaSelected.prestacion||'—'],
              ['Afiliado',    consultaSelected.afiliado?'Sí':'No'],
              ['Fecha',       new Date(consultaSelected.created_at).toLocaleString('es-AR')],
              ['Message ID',  consultaSelected.message_id||'—'],
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
            // 1. Guardar consulta
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
            if(!resConsulta.ok) { alert('❌ No se pudo guardar la consulta. Intentá de nuevo.'); return }

            // 2. Sincronizar amat_loan_leads
            if(consultaSelected.phone) {
              const nuevoStatus = consultaStatusToLeadStatus(consultaEdit.estado, consultaSelected.flujo||'solicitud')
              const esFinal     = ESTADOS_FINALES.includes(nuevoStatus)

              const { data: _ld } = await supabase.from('amat_loan_leads')
                .select('id,archived,assigned_to,status')
                .eq('phone_number', consultaSelected.phone).single()

              if(_ld) {
                const updateData: any = { status: nuevoStatus, updated_at: new Date().toISOString() }
                if(esFinal) { updateData.archived = true }
                else { updateData.archived = false; if(consultaEdit.vendedor) updateData.assigned_to = consultaEdit.vendedor }

                const { error } = await supabase.from('amat_loan_leads').update(updateData).eq('id', (_ld as any).id)
                if(!error) {
                  if(esFinal) {
                    setBotLeads(prev => prev.filter(l => l.id !== (_ld as any).id))
                    if(selectedPhone === consultaSelected.phone) setSelectedPhone(null)
                  } else if(consultaEdit.vendedor) {
                    setBotLeads(prev => {
                      const exists = prev.find(l=>l.id===(_ld as any).id)
                      if(exists) return prev.map(l=>l.id===(_ld as any).id?{...l,...updateData}:l)
                      supabase.from('amat_loan_leads').select('*').eq('id',(_ld as any).id).single()
                        .then(({data})=>{ if(data) setBotLeads(p=>p.find(x=>x.id===(data as any).id)?p:[data as any,...p]) })
                      return prev
                    })
                  }
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
  )
}
