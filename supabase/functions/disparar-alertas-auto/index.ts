/**
 * Edge Function: disparar-alertas-auto
 *
 * Envía las alertas automáticas que ya tocan y programa la siguiente 2 horas después, hasta que
 * la persona apague la opción. Toda la lógica vive en la base (disparar_alertas_vencidas), que
 * además corre sola cada minuto con pg_cron: esta función es un respaldo y hace exactamente lo mismo.
 * Funciona aunque el teléfono del usuario esté apagado o sin la app abierta.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * La llave del servidor: la nueva de Supabase (SUPABASE_SECRET_KEYS) y, si el proyecto todavía no la
 * tiene, la de antes (SUPABASE_SERVICE_ROLE_KEY, que Supabase retira a finales de 2026).
 */
function llaveServidor(): string {
  try {
    const llaves = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    const llave = llaves.default ?? Object.values(llaves)[0]
    if (typeof llave === 'string' && llave) return llave
  } catch (_) { /* sin llaves nuevas */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  llaveServidor(),
)

Deno.serve(async (_req) => {
  try {
    const { data, error } = await supabase.rpc('disparar_alertas_vencidas')
    if (error) throw error
    return new Response(JSON.stringify({ disparadas: data ?? 0 }), { status: 200 })
  } catch (e) {
    console.error('[disparar-alertas-auto]', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
