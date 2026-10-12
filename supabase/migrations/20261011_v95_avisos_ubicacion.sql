-- Versión 95, punto 6b: los avisos de ubicación por notificación nunca salían (401 "Invalid JWT").
-- notify_fcm_on_ubicacion ("está compartiendo su ubicación contigo"), detectar_movimiento ("se está
-- moviendo") y notify_fcm_ubicacion_alerta (segundo aviso de una alerta, con el mapa) se crearon en
-- las versiones 85 y 89 copiando la llave de notify_fcm_on_alert, pero allí la llave está oculta con
-- puntos (•••): quedaron con solo 8 letras y el servidor las rechaza (63 veces en 6 h el 11-10).
-- Aquí se cambia SOLO esa llave por la llave pública de la app; todo lo demás de cada función queda
-- exactamente como está en el servidor. enviar-notificacion-fcm confirma todo en la base (y respeta
-- a quién se escogió), así que esta llave no abre nada nuevo.
-- La llave pública NO se sube a este repositorio: se pega a mano en el SQL Editor (es la misma de
-- VITE_SUPABASE_ANON_KEY en .env.local). notify_fcm_on_alert NO se toca.
-- Se puede correr varias veces sin problema.
DO $$
DECLARE
  f text; def text; nuevo text;
  llave constant text := 'PEGAR_AQUI_LA_LLAVE_PUBLICA';
BEGIN
  IF llave NOT LIKE 'sb\_publishable\_%' THEN RAISE EXCEPTION 'Falta pegar la llave pública'; END IF;
  FOREACH f IN ARRAY ARRAY['notify_fcm_on_ubicacion', 'detectar_movimiento', 'notify_fcm_ubicacion_alerta'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f;
    IF def IS NULL THEN RAISE EXCEPTION 'No encontré la función %', f; END IF;
    nuevo := regexp_replace(def, '''Bearer [^'']*''', '''Bearer ' || llave || '''', 'g');
    IF position('''Bearer ' || llave || '''' IN nuevo) = 0 THEN RAISE EXCEPTION 'La función % no tiene la llave', f; END IF;
    EXECUTE nuevo;
  END LOOP;
END $$;

-- ---------- Revisión (solo mira, no cambia nada) ----------
-- Funciones con llave: cuántas letras tiene (la buena tiene 46) y si un disparador la usa.
-- Disparadores de alertas y ubicación, tareas programadas y respuestas del servidor de las últimas 6 h
-- (y de cada webhook, si el proyecto los tiene).
SELECT que, detalle, veces FROM (
  SELECT 'función ' || p.proname AS que,
         (SELECT string_agg(length((r.m)[1]) || ' letras' || CASE WHEN (r.m)[2] <> '' THEN ' + ••• (oculta, no sirve)' ELSE '' END, ', ')
            FROM regexp_matches(p.prosrc, 'Bearer ([A-Za-z0-9._-]*)(•*)', 'g') AS r(m))
         || CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid)
                 THEN ' · la usa un disparador' ELSE ' · ningún disparador la usa' END AS detalle,
         NULL::bigint AS veces
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%Bearer%'

  UNION ALL
  SELECT 'disparador ' || t.tgname || ' (' || c.relname || ')',
         CASE WHEN p.proname = 'http_request'
              THEN 'webhook → ' || coalesce(substring(x.a from 'functions/v1/([a-z0-9_-]+)'), '?')
                   || ' · llave de ' || coalesce(length(substring(x.a from 'Bearer ([A-Za-z0-9._-]*)')), 0) || ' letras'
                   || CASE WHEN x.a ~ 'Bearer [A-Za-z0-9._-]*\\342' THEN ' + ••• (oculta, no sirve)' ELSE '' END
                   || ' · espera ' || coalesce(substring(x.a from '\\000(\d+)\\000$'), '?') || ' ms'
              ELSE 'función ' || p.proname END
         || CASE t.tgenabled WHEN 'D' THEN ' · APAGADO' ELSE '' END,
         NULL
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
  CROSS JOIN LATERAL (SELECT encode(t.tgargs, 'escape') AS a) x
  WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('alerts', 'live_locations')
    AND NOT t.tgisinternal

  UNION ALL
  SELECT 'tarea ' || j.jobname,
         j.schedule || ' · ' || coalesce(
           'llama a ' || substring(j.command from 'functions/v1/([a-z0-9_-]+)')
             || ' · llave de ' || coalesce(length(substring(j.command from 'Bearer ([A-Za-z0-9._-]*)')), 0) || ' letras'
             || ' · espera ' || coalesce(substring(j.command from 'timeout_milliseconds\s*:=\s*(\d+)') || ' ms', 'lo normal'),
           'trabajo dentro de la base')
         || CASE WHEN NOT j.active THEN ' · APAGADA' ELSE '' END,
         NULL
  FROM cron.job j

  UNION ALL
  SELECT 'respuesta ' || coalesce(r.status_code::text, 'sin código'),
         left(coalesce(r.error_msg, r.content), 26) || ' · última '
           || to_char(max(r.created) AT TIME ZONE 'America/Bogota', 'HH24:MI'),
         count(*)
  FROM net._http_response r
  WHERE r.created > now() - interval '6 hours'
  GROUP BY r.status_code, left(coalesce(r.error_msg, r.content), 26)

  UNION ALL
  SELECT w.que, w.detalle, w.veces
  FROM xmltable('/table/row' PASSING query_to_xml(
         CASE WHEN to_regclass('supabase_functions.hooks') IS NULL
              THEN 'SELECT NULL::text AS que, NULL::text AS detalle, NULL::bigint AS veces WHERE false'
              ELSE $q$
                SELECT 'webhook ' || h.hook_name || ' → ' || coalesce(r.status_code::text, 'sin código') AS que,
                       left(coalesce(r.error_msg, r.content), 26) || ' · última '
                         || to_char(max(r.created) AT TIME ZONE 'America/Bogota', 'HH24:MI') AS detalle,
                       count(*) AS veces
                FROM supabase_functions.hooks h
                JOIN net._http_response r ON r.id = h.request_id
                WHERE r.created > now() - interval '6 hours'
                GROUP BY h.hook_name, r.status_code, left(coalesce(r.error_msg, r.content), 26)
              $q$ END, false, false, '')
       COLUMNS que text, detalle text, veces bigint) w
) revision
ORDER BY 1, 3 DESC NULLS LAST;
