// ─────────────────────────────────────────────────────────────────────────────
//  HOOKS · USE BASE
//  Maneja el tab de base de contactos: paginación, filtros, carga y edición.
//
//  Por qué existe: los 8 filtros, 8 refs de stale closure, loadBase y saveEdit
//  vivían todos en BandejaClient. Este hook los encapsula.
//
//  Qué ocurriría si desaparece: el tab de base de contactos dejaría de
//  funcionar.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { LoanLead } from '@/lib/types'
import { ESTADOS_FINALES } from '@/domain/entities/leadStatus'
import { fetchBase, editLead, saveLeadNote } from '@/services/lead.service'
import { fetchFlujoMap } from '@/services/consulta.service'

const PAGE_SIZE = 50

type BaseSetters = {
  setFlujoMap: React.Dispatch<React.SetStateAction<Record<string,string>>>
  setBotLeads: React.Dispatch<React.SetStateAction<LoanLead[]>>
}

export function useBase(tab: string, setters: BaseSetters) {
  const { setFlujoMap, setBotLeads } = setters

  const [baseLeads, setBaseLeads]         = useState<LoanLead[]>([])
  const [baseTotal, setBaseTotal]         = useState(0)
  const [baseLoading, setBaseLoading]     = useState(false)
  const [basePage, setBasePage]           = useState(0)
  const [baseSearch, setBaseSearch]       = useState('')
  const [baseSearchInput, setBaseSearchInput] = useState('')
  const [baseRep, setBaseRep]             = useState('all')
  const [baseBanco, setBaseBanco]         = useState('all')
  const [baseStatus, setBaseStatus]       = useState('all')
  const [baseTel, setBaseTel]             = useState<'all'|'con'|'sin'>('all')
  const [baseAssigned, setBaseAssigned]   = useState('all')
  const [baseFlujo, setBaseFlujo]         = useState('all')
  const [baseOrdenCol, setBaseOrdenCol]   = useState('created_at')
  const [baseOrdenDir, setBaseOrdenDir]   = useState<'asc'|'desc'>('desc')

  // Modal de edición
  const [showEditModal, setShowEditModal]   = useState(false)
  const [editTarget, setEditTarget]         = useState<LoanLead|null>(null)
  const [editForm, setEditForm]             = useState<Partial<LoanLead>>({})
  const [editSaving, setEditSaving]         = useState(false)
  const [showNoteModal, setShowNoteModal]   = useState(false)
  const [noteText, setNoteText]             = useState('')

  // Refs para evitar stale closures
  const baseSearchRef   = useRef(baseSearch)
  const baseRepRef      = useRef(baseRep)
  const baseBancoRef    = useRef(baseBanco)
  const baseStatusRef   = useRef(baseStatus)
  const baseTelRef      = useRef(baseTel)
  const baseAssignedRef = useRef(baseAssigned)
  const basePageRef     = useRef(basePage)
  const baseOrdenColRef = useRef(baseOrdenCol)
  const baseOrdenDirRef = useRef(baseOrdenDir)
  const loadBaseSeq     = useRef(0)
  const baseSearchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(()=>{ baseSearchRef.current   = baseSearch   },[baseSearch])
  useEffect(()=>{ baseRepRef.current      = baseRep      },[baseRep])
  useEffect(()=>{ baseBancoRef.current    = baseBanco    },[baseBanco])
  useEffect(()=>{ baseStatusRef.current   = baseStatus   },[baseStatus])
  useEffect(()=>{ baseTelRef.current      = baseTel      },[baseTel])
  useEffect(()=>{ baseAssignedRef.current = baseAssigned },[baseAssigned])
  useEffect(()=>{ basePageRef.current     = basePage     },[basePage])
  useEffect(()=>{ baseOrdenColRef.current = baseOrdenCol },[baseOrdenCol])
  useEffect(()=>{ baseOrdenDirRef.current = baseOrdenDir },[baseOrdenDir])

  const loadBase = async (overrides?: {
    search?: string; rep?: string; banco?: string; status?: string
    tel?: string; assigned?: string; page?: number
    ordenCol?: string; ordenDir?: 'asc'|'desc'
  }) => {
    setBaseLoading(true)
    const seq = ++loadBaseSeq.current
    const filtros = {
      search:   overrides?.search   ?? baseSearchRef.current,
      rep:      overrides?.rep      ?? baseRepRef.current,
      banco:    overrides?.banco    ?? baseBancoRef.current,
      status:   overrides?.status   ?? baseStatusRef.current,
      tel:      (overrides?.tel     ?? baseTelRef.current) as 'all'|'con'|'sin',
      assigned: overrides?.assigned ?? baseAssignedRef.current,
      page:     overrides?.page     ?? basePageRef.current,
      ordenCol: overrides?.ordenCol ?? baseOrdenColRef.current,
      ordenDir: (overrides?.ordenDir ?? baseOrdenDirRef.current) as 'asc'|'desc',
    }

    try {
      const { leads, total } = await fetchBase(filtros)
      if(seq !== loadBaseSeq.current) return
      setBaseLeads(leads)
      setBaseTotal(total)

      const phones = leads.map(l=>l.phone_number).filter(Boolean) as string[]
      if(phones.length) {
        fetchFlujoMap(phones).then(map => {
          if(seq !== loadBaseSeq.current) return
          setFlujoMap(prev=>({...prev,...map}))
        })
      }
    } catch(e: any) {
      if(seq !== loadBaseSeq.current) return
      console.error('[useBase] Error:', e)
      alert('❌ Error al cargar la base de contactos. Intentá de nuevo.')
    } finally {
      if(seq === loadBaseSeq.current) setBaseLoading(false)
    }
  }

  useEffect(()=>{ if(tab==='base') loadBase({ search:baseSearch, rep:baseRep, banco:baseBanco, status:baseStatus, tel:baseTel, assigned:baseAssigned, page:basePage, ordenCol:baseOrdenCol, ordenDir:baseOrdenDir }) },[tab]) // eslint-disable-line
  useEffect(()=>{ if(tab==='base') loadBase({ search:baseSearch, rep:baseRep, banco:baseBanco, status:baseStatus, tel:baseTel, assigned:baseAssigned, page:basePage, ordenCol:baseOrdenCol, ordenDir:baseOrdenDir }) },[baseSearch,baseRep,baseBanco,baseStatus,baseTel,baseAssigned,basePage,baseOrdenCol,baseOrdenDir]) // eslint-disable-line

  const openEdit = (lead: LoanLead) => {
    setEditTarget(lead)
    setEditForm({full_name:lead.full_name,dni:lead.dni,phone_number:lead.phone_number,reparticion:lead.reparticion,bank:lead.bank,amount:lead.amount,installments:lead.installments,status:lead.status,assigned_to:lead.assigned_to,notes:lead.notes,email:lead.email})
    setShowEditModal(true)
  }

  const saveEdit = async () => {
    if(!editTarget) return
    setEditSaving(true)
    const { ok } = await editLead(editTarget.id, editTarget.phone_number, editForm)
    if(!ok) {
      alert('❌ No se pudo guardar los cambios. Intentá de nuevo.')
      setEditSaving(false)
      return
    }
    if(editForm.status && ESTADOS_FINALES.includes(editForm.status)) {
      setBotLeads(prev => prev.filter(l => l.id !== editTarget.id))
    }
    setEditSaving(false); setShowEditModal(false); setEditTarget(null)
    if(tab === 'base') loadBase()
  }

  const saveNote = async (currentLead?: LoanLead | null) => {
    const lead = currentLead || editTarget
    if(!lead) return
    const res = await saveLeadNote(lead.id, noteText)
    if(!res.ok) { alert('❌ No se pudo guardar la nota. Intentá de nuevo.'); return }
    setShowNoteModal(false)
  }

  // Debounced search — encapsula el timer para que el JSX no acceda al ref directamente
  const setBaseSearchDebounced = (value: string) => {
    setBaseSearchInput(value)
    if(baseSearchTimer.current) clearTimeout(baseSearchTimer.current)
    baseSearchTimer.current = setTimeout(()=>{ setBaseSearch(value); setBasePage(0) }, 400)
  }

  const commitBaseSearch = (value: string) => {
    if(baseSearchTimer.current) clearTimeout(baseSearchTimer.current)
    setBaseSearch(value)
    setBasePage(0)
  }

  return {
    baseLeads, setBaseLeads,
    baseTotal, baseLoading,
    basePage, setBasePage,
    baseSearch, setBaseSearch,
    baseSearchInput, setBaseSearchInput,
    setBaseSearchDebounced,
    commitBaseSearch,
    baseRep, setBaseRep,
    baseBanco, setBaseBanco,
    baseStatus, setBaseStatus,
    baseTel, setBaseTel,
    baseAssigned, setBaseAssigned,
    baseFlujo, setBaseFlujo,
    baseOrdenCol, setBaseOrdenCol,
    baseOrdenDir, setBaseOrdenDir,
    showEditModal, setShowEditModal,
    editTarget, setEditTarget,
    editForm, setEditForm,
    editSaving,
    showNoteModal, setShowNoteModal,
    noteText, setNoteText,
    loadBase,
    openEdit,
    saveEdit,
    saveNote,
  }
}
