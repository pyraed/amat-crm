'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LoanLead } from '@/lib/types'
import * as XLSX from 'xlsx'

// Columnas del Excel exportado/importado
const COLS = [
  { key:'dni',          label:'DNI' },
  { key:'full_name',    label:'NOMBRE' },
  { key:'phone_number', label:'TELEFONO_1' },
  { key:'email',        label:'EMAIL' },
  { key:'reparticion',  label:'REPARTICION' },
  { key:'bank',         label:'BANCO' },
  { key:'status',       label:'ESTADO' },
  { key:'assigned_to',  label:'ASIGNADO_A' },
  { key:'notes',        label:'NOTAS' },
  { key:'amount',       label:'MONTO' },
  { key:'installments', label:'CUOTAS' },
]

type ExportFilter = {
  search: string
  rep: string
  banco: string
  status: string
  tel: string
  assigned: string
  limit: string
}

type Props = {
  onClose: () => void
  onImportDone: () => void
  currentFilters: ExportFilter
}

export default function ImportExport({ onClose, onImportDone, currentFilters }: Props) {
  const [mode, setMode]           = useState<'export'|'import'>('export')
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ok:number;updated:number;errors:string[]}|null>(null)
  const [exportFilters, setExportFilters] = useState<ExportFilter>(currentFilters)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── EXPORTAR ─────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    try {
      let q = supabase.from('amat_loan_leads').select('*')

      if(exportFilters.search) q=q.or(`full_name.ilike.%${exportFilters.search}%,dni.ilike.%${exportFilters.search}%,phone_number.ilike.%${exportFilters.search}%`)
      if(exportFilters.rep!=='all')      q=q.eq('reparticion',exportFilters.rep)
      if(exportFilters.banco!=='all')    q=q.eq('bank',exportFilters.banco)
      if(exportFilters.status!=='all')   q=q.eq('status',exportFilters.status)
      if(exportFilters.tel==='con')      q=q.not('phone_number','is',null)
      if(exportFilters.tel==='sin')      q=q.is('phone_number',null)
      if(exportFilters.assigned==='sin') q=q.is('assigned_to',null)
      else if(exportFilters.assigned!=='all') q=q.eq('assigned_to',exportFilters.assigned)

      const limit = parseInt(exportFilters.limit) || 0
      if(limit>0) q=q.limit(limit)

      q=q.order('full_name',{ascending:true})

      const { data, error } = await q
      if(error) throw error

      // Armar filas para Excel
      const rows = (data as any[]).map(lead => {
        const row: Record<string,any> = {}
        COLS.forEach(c => { row[c.label] = lead[c.key] ?? '' })
        return row
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Contactos')

      // Ancho de columnas
      ws['!cols'] = COLS.map(c => ({ wch: c.key==='full_name'?30:c.key==='email'?28:c.key==='reparticion'?30:15 }))

      const fecha = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `AMAT_contactos_${fecha}.xlsx`)
    } catch(e:any) {
      alert('Error al exportar: ' + e.message)
    }
    setExporting(false)
  }

  // ── IMPORTAR ─────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if(!file) return
    setImporting(true)
    setImportResult(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      let ok = 0, updated = 0
      const errors: string[] = []

      // Procesar en lotes de 50
      const BATCH = 50
      for(let i=0; i<rows.length; i+=BATCH) {
        const batch = rows.slice(i, i+BATCH)
        for(const row of batch) {
          const dni = String(row['DNI']||row['dni']||'').trim()
          if(!dni) { errors.push(`Fila ${i+1}: sin DNI`); continue }

          const record: any = {
            full_name:    String(row['NOMBRE']||row['full_name']||'').trim()||null,
            phone_number: String(row['TELEFONO_1']||row['phone_number']||'').trim()||null,
            email:        String(row['EMAIL']||row['email']||'').trim().toLowerCase()||null,
            reparticion:  String(row['REPARTICION']||row['reparticion']||'').trim().toUpperCase()||null,
            bank:         String(row['BANCO']||row['bank']||'').trim().toUpperCase()||null,
            notes:        String(row['NOTAS']||row['notes']||'').trim()||null,
            amount:       parseInt(row['MONTO']||row['amount'])||null,
            installments: parseInt(row['CUOTAS']||row['installments'])||null,
            updated_at:   new Date().toISOString(),
          }

          // Limpiar teléfono
          if(record.phone_number) {
            const clean = record.phone_number.replace(/\D/g,'')
            record.phone_number = (clean.length>=10&&clean.length<=15)?clean:null
          }

          // Buscar si ya existe por DNI
          const { data: existing } = await supabase
            .from('loan_leads').select('id,phone_number,email').eq('dni',dni).maybeSingle()

          if(existing) {
            // Actualizar — solo sobreescribir teléfono y email si vienen con datos
            const upd: any = { ...record, dni }
            if(!record.phone_number) delete upd.phone_number
            if(!record.email) delete upd.email
            const { error } = await supabase.from('amat_loan_leads').update(upd).eq('id',existing.id)
            if(error) errors.push(`DNI ${dni}: ${error.message}`)
            else updated++
          } else {
            // Insertar nuevo
            const { error } = await supabase.from('amat_loan_leads').insert({ ...record, dni, status:'new', created_at:new Date().toISOString() })
            if(error) errors.push(`DNI ${dni}: ${error.message}`)
            else ok++
          }
        }
      }

      setImportResult({ ok, updated, errors })
      onImportDone()
    } catch(e:any) {
      alert('Error al importar: ' + e.message)
    }
    setImporting(false)
    if(fileRef.current) fileRef.current.value = ''
  }

  // ── DESCARGAR PLANTILLA ───────────────────
  const downloadTemplate = () => {
    const ejemplo = [{
      DNI:'28441902', NOMBRE:'RODRIGUEZ CARLOS', TELEFONO_1:'5491112345678',
      EMAIL:'carlos@gmail.com', REPARTICION:'MINISTERIO DE SEGURIDAD',
      BANCO:'BANCO PROVINCIA', ESTADO:'new', ASIGNADO_A:'', NOTAS:'', MONTO:'', CUOTAS:''
    }]
    const ws = XLSX.utils.json_to_sheet(ejemplo)
    ws['!cols'] = COLS.map(c=>({wch:20}))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'AMAT_plantilla_importacion.xlsx')
  }

  const REPARTICIONES = ['all','MINISTERIO DE EDUCACION','MINISTERIO DE SEGURIDAD','MINISTERIO DE SALUD','SERVICIO PENITENCIARIO BONAERENSE','IPS','CAJA DE POLICIA','OTRA REPARTICION']
  const BANCOS = ['all','BANCO PROVINCIA','BANCO NACION','BANCO GALICIA','BANCO SANTANDER','BANCO ICBC','BANCO MACRO','BANCO PATAGONIA','OTRO']
  const ESTADOS = ['all','new','no_phone','attempted','no_answer','interested','not_interested','evaluation','contacted','closed','rejected']
  const ESTADO_LABELS: Record<string,string> = {all:'Todos',new:'Nuevo',no_phone:'Sin teléfono',attempted:'Intentado',no_answer:'No contesta',interested:'Interesado',not_interested:'No interesado',evaluation:'En evaluación',contacted:'Contactado',closed:'Cerrado',rejected:'Rechazado'}

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,backdropFilter:'blur(3px)',fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <div style={{background:'white',borderRadius:20,padding:28,width:560,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 25px 60px rgba(0,0,0,.2)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <h3 style={{margin:0,fontSize:17,fontWeight:600,color:'#0F172A'}}>📊 Importar / Exportar</h3>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#94A3B8',padding:'0 4px'}}>×</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:4,background:'#F1F5F9',padding:4,borderRadius:10,marginBottom:20}}>
          {(['export','import'] as const).map(m=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:'8px 0',borderRadius:8,border:'none',fontFamily:'inherit',fontSize:13,fontWeight:500,cursor:'pointer',background:mode===m?'white':'transparent',color:mode===m?'#1E293B':'#64748B',boxShadow:mode===m?'0 1px 3px rgba(0,0,0,.1)':'none',transition:'all .15s'}}>
              {m==='export'?'⬇️ Exportar':'⬆️ Importar'}
            </button>
          ))}
        </div>

        {/* EXPORTAR */}
        {mode==='export'&&(
          <div>
            <p style={{fontSize:13,color:'#64748B',margin:'0 0 16px'}}>Exportá la base filtrada como archivo Excel. Podés ajustar los filtros antes de exportar.</p>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Buscar</label>
                <input style={{width:'100%',border:'1px solid #E2E8F0',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',outline:'none'}} placeholder="Nombre, DNI..." value={exportFilters.search} onChange={e=>setExportFilters(f=>({...f,search:e.target.value}))}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Límite de registros</label>
                <input style={{width:'100%',border:'1px solid #E2E8F0',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',outline:'none'}} placeholder="0 = todos" type="number" value={exportFilters.limit} onChange={e=>setExportFilters(f=>({...f,limit:e.target.value}))}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Repartición</label>
                <select style={{width:'100%',border:'1px solid #E2E8F0',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',outline:'none',background:'white'}} value={exportFilters.rep} onChange={e=>setExportFilters(f=>({...f,rep:e.target.value}))}>
                  {REPARTICIONES.map(r=><option key={r} value={r}>{r==='all'?'Todas':r}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Banco</label>
                <select style={{width:'100%',border:'1px solid #E2E8F0',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',outline:'none',background:'white'}} value={exportFilters.banco} onChange={e=>setExportFilters(f=>({...f,banco:e.target.value}))}>
                  {BANCOS.map(b=><option key={b} value={b}>{b==='all'?'Todos':b}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Estado</label>
                <select style={{width:'100%',border:'1px solid #E2E8F0',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',outline:'none',background:'white'}} value={exportFilters.status} onChange={e=>setExportFilters(f=>({...f,status:e.target.value}))}>
                  {ESTADOS.map(s=><option key={s} value={s}>{ESTADO_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Teléfono</label>
                <select style={{width:'100%',border:'1px solid #E2E8F0',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',outline:'none',background:'white'}} value={exportFilters.tel} onChange={e=>setExportFilters(f=>({...f,tel:e.target.value}))}>
                  <option value="all">Con y sin teléfono</option>
                  <option value="con">Solo con teléfono</option>
                  <option value="sin">Solo sin teléfono</option>
                </select>
              </div>
            </div>

            <button onClick={handleExport} disabled={exporting} style={{width:'100%',background:'linear-gradient(135deg,#10B981,#059669)',color:'white',border:'none',borderRadius:10,padding:'12px',fontSize:14,fontWeight:600,cursor:exporting?'not-allowed':'pointer',fontFamily:'inherit',opacity:exporting?.7:1}}>
              {exporting?'⏳ Exportando...':'⬇️ Descargar Excel'}
            </button>
          </div>
        )}

        {/* IMPORTAR */}
        {mode==='import'&&(
          <div>
            <p style={{fontSize:13,color:'#64748B',margin:'0 0 14px'}}>Importá un archivo Excel o CSV. Si el DNI ya existe, actualiza los datos. Si no existe, crea un registro nuevo.</p>

            <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:12,color:'#065F46'}}>
              <strong>Columnas requeridas:</strong> DNI<br/>
              <strong>Columnas opcionales:</strong> NOMBRE, TELEFONO_1, EMAIL, REPARTICION, BANCO, ESTADO, NOTAS, MONTO, CUOTAS
            </div>

            <button onClick={downloadTemplate} style={{width:'100%',background:'#F8FAFC',border:'1px dashed #CBD5E1',borderRadius:10,padding:'11px',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',color:'#475569',marginBottom:12}}>
              📋 Descargar plantilla de ejemplo
            </button>

            <div style={{border:'2px dashed #CBD5E1',borderRadius:12,padding:'28px',textAlign:'center',cursor:'pointer',transition:'all .15s',background:'#F8FAFC'}}
              onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();(e.currentTarget as HTMLDivElement).style.borderColor='#3B82F6'}}
              onDragLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#CBD5E1'}}
              onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&fileRef.current){const dt=new DataTransfer();dt.items.add(f);fileRef.current.files=dt.files;handleFileChange({target:fileRef.current} as any)}}}>
              <div style={{fontSize:32,marginBottom:8}}>📂</div>
              <div style={{fontSize:14,fontWeight:500,color:'#374151',marginBottom:4}}>
                {importing?'Importando...':'Hacé clic o arrastrá tu archivo acá'}
              </div>
              <div style={{fontSize:12,color:'#94A3B8'}}>Excel (.xlsx, .xls) o CSV (.csv)</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={handleFileChange}/>

            {importing&&(
              <div style={{marginTop:14,padding:'12px 14px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:10,fontSize:13,color:'#1D4ED8',textAlign:'center'}}>
                ⏳ Procesando registros...
              </div>
            )}

            {importResult&&(
              <div style={{marginTop:14,background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:10,padding:'14px 16px'}}>
                <div style={{fontSize:14,fontWeight:600,color:'#065F46',marginBottom:8}}>✅ Importación completada</div>
                <div style={{fontSize:13,color:'#065F46'}}>
                  <div>Nuevos registros: <strong>{importResult.ok}</strong></div>
                  <div>Actualizados: <strong>{importResult.updated}</strong></div>
                  {importResult.errors.length>0&&(
                    <div style={{marginTop:8,color:'#92400E'}}>
                      Errores ({importResult.errors.length}):
                      <div style={{fontSize:12,marginTop:4,maxHeight:80,overflowY:'auto'}}>
                        {importResult.errors.slice(0,10).map((e,i)=><div key={i}>• {e}</div>)}
                        {importResult.errors.length>10&&<div>... y {importResult.errors.length-10} más</div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
