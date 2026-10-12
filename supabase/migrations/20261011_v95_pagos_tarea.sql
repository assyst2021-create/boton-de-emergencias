-- Versión 95, punto 6 (corrección): la tarea revisar-suscripciones respondía 401 "Invalid JWT".
-- La llave copiada de notify_fcm_on_alert medía solo 8 letras (no es una llave completa). La app
-- usa la llave PÚBLICA nueva de Supabase (sb_publishable_…), que las funciones aceptan; el modo
-- { revisar: true } de activar-premium acepta cualquier llave válida y tiene turno de 2 minutos.
-- La llave pública NO se sube a este repositorio: se pega a mano en el SQL Editor (es la misma de
-- VITE_SUPABASE_ANON_KEY en .env.local). Se puede correr varias veces sin problema.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'revisar-suscripciones';
  PERFORM cron.schedule(
    'revisar-suscripciones',
    '*/5 * * * *',
    $c$SELECT net.http_post(
      url := 'https://julwbtqrojghvbajsqil.supabase.co/functions/v1/activar-premium',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer PEGAR_AQUI_LA_LLAVE_PUBLICA'),
      body := '{"revisar": true}'::jsonb,
      timeout_milliseconds := 60000
    )$c$
  );
END $$;

SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'revisar-suscripciones';
