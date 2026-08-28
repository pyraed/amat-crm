import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
//  LIB · SUPABASE CLIENTS
//
//  Tres clientes con responsabilidades distintas:
//
//  supabase      → Browser / client-side. Singleton global. Usa anon key.
//                  Sujeto a RLS. Usado en componentes React.
//
//  supabaseAdmin → Server-side únicamente. Singleton global. Usa service key.
//                  Bypasea RLS. Solo para API routes y server actions.
//                  ⚠️  NUNCA exponer al browser ni pasar como prop.
//
//  createServerClient() → SSR / API routes que necesiten contexto de sesión
//                         del usuario (cookies). Llamar por request, no como
//                         singleton. Ver uso en getServerSideProps / route handlers.
//
//  Invariante: si SUPABASE_SERVICE_KEY no está definida en producción,
//  el proceso falla en startup en lugar de silenciosamente usar anon key.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Validación explícita de service key — falla ruidoso, no silencioso
function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) {
    // En desarrollo, warning. En producción, error fatal.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[supabase] SUPABASE_SERVICE_KEY no definida. ' +
        'El cliente admin no puede operar sin ella.'
      )
    }
    console.warn(
      '[supabase] SUPABASE_SERVICE_KEY no definida. ' +
      'supabaseAdmin operará con anon key — SOLO aceptable en desarrollo local.'
    )
    return supabaseAnonKey
  }
  return key
}

// ─── Tipos para el singleton global ──────────────────────────────────────────

type SupabaseGlobal = {
  supabaseClient: ReturnType<typeof createClient> | undefined
  supabaseAdminClient: ReturnType<typeof createClient> | undefined
}

const g = globalThis as unknown as SupabaseGlobal

// ─── Cliente browser (anon key, con Realtime) ─────────────────────────────────

export const supabase =
  g.supabaseClient ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })

if (process.env.NODE_ENV !== 'production') {
  g.supabaseClient = supabase
}

// ─── Cliente admin (service key, sin Realtime) ────────────────────────────────
//
//  Singleton: evita abrir una nueva conexión en cada import durante SSR.
//  En Next.js sin --turbo, cada hot-reload puede reimportar módulos;
//  el patrón globalThis previene conexiones duplicadas en desarrollo.

export const supabaseAdmin =
  g.supabaseAdminClient ??
  createClient(supabaseUrl, getServiceKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Admin no necesita Realtime — si lo necesitás en un caso específico,
    // creá un cliente ad-hoc en ese módulo, no acá.
  })

if (process.env.NODE_ENV !== 'production') {
  g.supabaseAdminClient = supabaseAdmin
}

// ─── Cliente server con contexto de sesión ───────────────────────────────────
//
//  Usar en getServerSideProps, route handlers, o server actions donde necesitás
//  operar como el usuario autenticado (respeta RLS con su JWT).
//
//  IMPORTANTE: llamar createServerClient() por request, no cachear el resultado.
//
//  Ejemplo de uso en un route handler:
//
//    import { createServerClient } from '@/lib/supabase'
//    export async function GET(req: Request) {
//      const cookieHeader = req.headers.get('cookie') ?? ''
//      const client = createServerClient(cookieHeader)
//      const { data } = await client.from('sessions').select('*')
//      ...
//    }

export function createServerClient(cookieHeader: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      // Inyectar cookies del request para que Supabase valide el JWT del usuario
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        cookie: cookieHeader,
      },
    },
  })
}
