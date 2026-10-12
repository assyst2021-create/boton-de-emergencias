-- Versión 95, punto 11 (seguridad). Se puede correr varias veces sin problema.
-- a) Cada aviso sale una sola vez: enviar-notificacion-fcm y send-push-alert anotan aquí cada aviso
--    real (alerta, mapa, "está compartiendo", "se está moviendo", página web). Con la llave pública
--    cualquiera podía repetir la llamada e inundar a una familia con el mismo aviso; ahora no sale.
--    Solo el servidor la usa: sin reglas para la app y sin permisos para anon/authenticated.
CREATE TABLE IF NOT EXISTS public.avisos_enviados (
  clave      text PRIMARY KEY,
  enviado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.avisos_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_enviados FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.avisos_enviados TO service_role;

-- Se borran a los 3 días (las alertas duran 24 h)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'limpiar-avisos-enviados';
  PERFORM cron.schedule('limpiar-avisos-enviados', '41 4 * * *',
    $c$DELETE FROM public.avisos_enviados WHERE enviado_at < now() - interval '3 days'$c$);
END $$;

-- ---------- Revisión: deben salir 4 "bien" ----------
SELECT 'tabla avisos_enviados' AS que,
       CASE WHEN to_regclass('public.avisos_enviados') IS NOT NULL THEN 'existe (bien)' ELSE 'NO existe' END AS estado
UNION ALL
SELECT 'reglas por fila', CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.avisos_enviados'::regclass) THEN 'activas (bien)' ELSE 'NO' END
UNION ALL
SELECT 'sin sesión / con sesión la pueden leer',
       CASE WHEN has_table_privilege('anon', 'public.avisos_enviados', 'SELECT') OR has_table_privilege('authenticated', 'public.avisos_enviados', 'SELECT')
            THEN 'sí (mal)' ELSE 'no (bien)' END
UNION ALL
SELECT 'limpieza diaria', CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar-avisos-enviados') THEN 'programada (bien)' ELSE 'NO' END;
