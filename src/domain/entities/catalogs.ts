// ─────────────────────────────────────────────────────────────────────────────
//  DOMAIN · ENTITIES · CATALOGS
//  Catálogos de datos de referencia: reparticiones, bancos, motivos de
//  rechazo y plantillas de mensaje WhatsApp.
//
//  Por qué existe: estos catálogos son datos del dominio, no de la UI.
//  Vivían hardcodeados en BandejaClient. Centralizarlos permite reutilizarlos
//  desde servicios, hooks y componentes sin duplicar.
//
//  Qué ocurriría si desaparece: los selectores de repartición, banco y
//  motivo de rechazo, y el sistema de plantillas WhatsApp, perderían sus datos.
// ─────────────────────────────────────────────────────────────────────────────

export const REPARTICIONES = [
  'MINISTERIO DE SEGURIDAD',
  'MINISTERIO DE EDUCACION',
  'SERVICIO PENITENCIARIO BONAERENSE',
  'MINISTERIO DE SALUD',
  'EJERCITO ARGENTINO',
  'GENDARMERIA',
  'FUERZAS ARMADAS',
  'OTRA REPARTICION',
] as const

export type Reparticion = typeof REPARTICIONES[number]

export const BANCOS = [
  'BANCO PROVINCIA',
  'BANCO NACION',
  'BANCO GALICIA',
  'BANCO SANTANDER',
  'BANCO ICBC',
  'BANCO MACRO',
  'BANCO PATAGONIA',
  'OTRO',
] as const

export type Banco = typeof BANCOS[number]

export const REJECTION_REASONS = [
  'No cumple requisitos',
  'No quiere ser contactado',
  'Número incorrecto / no existe',
  'Ya tiene préstamo activo',
  'Otro',
] as const

export type RejectionReason = typeof REJECTION_REASONS[number]

// ── Plantillas de mensaje WhatsApp ────────────────────────────────────────────
// Estructura lista para Meta Cloud API.
// Las variables entre {{}} se reemplazan antes del envío.

export type Template = {
  id:        string
  name:      string
  category:  'MARKETING' | 'UTILITY'
  body:      string
  variables: string[]
}

export const TEMPLATES: Template[] = [
  {
    id:       'ayuda_economica',
    name:     'Ayuda Económica — Primer contacto',
    category: 'MARKETING',
    body:     `Hola {{nombre}} 👋 Te contactamos desde *AMAT* (Asociación Mutual Amarilla de Trabajadores).\n\nComo empleado/a de {{reparticion}}, podés acceder a una *Ayuda Económica* con descuento directo en tu recibo de sueldo.\n\n¿Te interesa que te contemos más? Respondé *SI* para continuar.`,
    variables: ['nombre', 'reparticion'],
  },
  {
    id:       'recontacto',
    name:     'Recontacto — Sin respuesta previa',
    category: 'MARKETING',
    body:     `Hola {{nombre}}, te escribimos nuevamente desde *AMAT*.\n\nQueríamos consultarte si seguís interesado/a en la Ayuda Económica que te ofrecemos. Es sin garante y con descuento por recibo. ¿Podemos ayudarte?`,
    variables: ['nombre'],
  },
  {
    id:       'info_general',
    name:     'Información general',
    category: 'UTILITY',
    body:     `Hola {{nombre}} 👋 Desde *AMAT* te informamos que contamos con Ayudas Económicas para empleados públicos de la Provincia de Buenos Aires.\n\n✅ Sin garante\n✅ Descuento por recibo\n✅ Aprobación rápida\n\nEscribinos al *[número]* para más info.`,
    variables: ['nombre'],
  },
]
