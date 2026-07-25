// ─────────────────────────────────────────────────────────────────────────────
//  LIB · SUPABASE HELPERS
//  Wrappers de error handling para operaciones Supabase.
//  Capturan errores, los loguean con contexto, y devuelven resultados
//  consistentes para que el caller decida qué mostrar al usuario.
//
//  Por qué existe: vivían definidos dentro de BandejaClient y no podían
//  ser reutilizados por los servicios. Extraerlos acá los hace disponibles
//  en toda la capa de servicios sin duplicación.
//
//  Qué ocurriría si desaparece: todos los servicios perderían su manejo
//  de errores consistente.
// ─────────────────────────────────────────────────────────────────────────────

export type SafeResult<T> = { data: T | null; error: string | null; ok: boolean }

/**
 * Wrapper para queries con retorno de datos (SELECT).
 * Siempre devuelve { data, error, ok } — nunca lanza.
 */
export async function safeQuery<T>(
  context: string,
  fn: () => Promise<{ data: T | null; error: any }>
): Promise<SafeResult<T>> {
  try {
    const { data, error } = await fn()
    if (error) {
      console.error(`[${context}] Error Supabase:`, error)
      return { data: null, error: error.message || 'Error desconocido', ok: false }
    }
    return { data, error: null, ok: true }
  } catch (e: any) {
    console.error(`[${context}] Excepción:`, e)
    return { data: null, error: e?.message || 'Error de red', ok: false }
  }
}

/**
 * Wrapper para mutaciones sin retorno de datos (UPDATE / INSERT / DELETE).
 * Siempre devuelve { ok, error } — nunca lanza.
 */
export async function safeRun(
  context: string,
  fn: () => Promise<{ error: any }>
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await fn()
    if (error) {
      console.error(`[${context}] Error Supabase:`, error)
      return { ok: false, error: error.message || 'Error desconocido' }
    }
    return { ok: true, error: null }
  } catch (e: any) {
    console.error(`[${context}] Excepción:`, e)
    return { ok: false, error: e?.message || 'Error de red' }
  }
}
