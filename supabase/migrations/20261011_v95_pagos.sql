-- Versión 95, punto 6: pagos que no pueden fallar
--  a) compras_pendientes: compras que Google todavía no confirma al comprar (pago pendiente o error
--     de Google). La revisión automática las reintenta cada 5 minutos: ninguna compra se pierde.
--  b) suscripciones_revision: cuándo se le preguntó a Google por última vez por cada suscripción.
--  c) La revisión automática cada 5 minutos (llama a activar-premium con { revisar: true }, con la
--     misma llave del disparador de las alertas): pone y quita el plan a tiempo aunque la persona no
--     abra la app (renovaciones, vencimientos, reembolsos, cancelaciones).
-- Solo las usa el servidor: sin reglas para la app (nadie las puede leer ni escribir desde la app).
-- Se puede correr varias veces sin problema. No toca las alertas ni ningún plan.

-- ---------- a) Compras pendientes ----------
CREATE TABLE IF NOT EXISTS public.compras_pendientes (
  token         text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creada_at     timestamptz NOT NULL DEFAULT now(),
  intentos      int NOT NULL DEFAULT 0,
  ultimo_estado text
);
ALTER TABLE public.compras_pendientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compras_pendientes FROM anon, authenticated;

-- ---------- b) Última revisión de cada suscripción ----------
CREATE TABLE IF NOT EXISTS public.suscripciones_revision (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revisado_at timestamptz NOT NULL DEFAULT now(),
  estado      text
);
ALTER TABLE public.suscripciones_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.suscripciones_revision FROM anon, authenticated;

-- ---------- c) Revisión automática cada 5 minutos ----------
-- Turno: la función no corre dos revisiones seguidas (menos de 2 minutos)
INSERT INTO public.app_config (clave, valor) VALUES ('revision_suscripciones', '2000-01-01T00:00:00.000Z')
ON CONFLICT (clave) DO NOTHING;

DO $$
DECLARE clave text;
BEGIN
  SELECT substring(prosrc from 'Bearer ([A-Za-z0-9._-]+)') INTO clave
  FROM pg_proc WHERE proname = 'notify_fcm_on_alert';
  IF clave IS NULL THEN RAISE EXCEPTION 'No encontré la llave de notify_fcm_on_alert'; END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'revisar-suscripciones';
  PERFORM cron.schedule(
    'revisar-suscripciones',
    '*/5 * * * *',
    format($f$SELECT net.http_post(
      url := 'https://julwbtqrojghvbajsqil.supabase.co/functions/v1/activar-premium',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
      body := '{"revisar": true}'::jsonb,
      timeout_milliseconds := 60000
    )$f$, clave)
  );
END $$;

-- ---------- Revisión (todo debe decir "bien") ----------
SELECT 'tabla compras_pendientes' AS revision,
       CASE WHEN to_regclass('public.compras_pendientes') IS NOT NULL THEN 'sí (bien)' ELSE 'NO (mal)' END AS resultado
UNION ALL SELECT 'tabla suscripciones_revision',
       CASE WHEN to_regclass('public.suscripciones_revision') IS NOT NULL THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'la app NO puede leer las compras pendientes',
       CASE WHEN has_table_privilege('anon', 'public.compras_pendientes', 'SELECT')
              OR has_table_privilege('authenticated', 'public.compras_pendientes', 'SELECT') THEN 'SÍ puede (mal)' ELSE 'no puede (bien)' END
UNION ALL SELECT 'turno de la revisión',
       CASE WHEN EXISTS (SELECT 1 FROM public.app_config WHERE clave = 'revision_suscripciones') THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'revisión automática',
       coalesce((SELECT 'cada 5 minutos (bien)' FROM cron.job WHERE jobname = 'revisar-suscripciones' AND schedule = '*/5 * * * *'), 'NO (mal)');
