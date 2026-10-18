/**
 * Escapa caracteres que podrían inyectar condiciones adicionales
 * en filtros PostgREST .or() / .filter().
 * Caracteres peligrosos: , (separa condiciones), ( ) (agrupamiento).
 */
export function sanitizeSearch(input: string): string {
  return input.replace(/[,()]/g, '')
}
