-- Versión 95, punto 6c: la notificación de las ALERTAS (rojo/naranja/verde) a los celulares de la
-- familia no salía. El disparador trigger_fcm_alerta usa notify_fcm_on_alert, y esa función tiene la
-- llave copiada OCULTA con puntos ("Bearer eyJhbGci•••"): el servidor la rechaza (401). Comprobado el
-- 11-10: 3 alertas en 6 h (la página web sí avisó: 3 "ok") y ninguna respuesta buena de
-- enviar-notificacion-fcm. Solo llegaban el SMS y el aviso de la página web.
-- Aquí se cambia SOLO esa llave por la llave pública de la app; todo lo demás de la función queda
-- exactamente como está en el servidor. enviar-notificacion-fcm confirma la alerta en la base y
-- respeta a quién se escogió. No hay otro camino que mande esta notificación: no se duplica.
-- La llave pública NO se sube a este repositorio: se pega a mano en el SQL Editor (es la misma de
-- VITE_SUPABASE_ANON_KEY en .env.local). Se puede correr varias veces sin problema.
DO $$
DECLARE
  def text; nuevo text; n int;
  llave constant text := 'PEGAR_AQUI_LA_LLAVE_PUBLICA';
BEGIN
  IF llave NOT LIKE 'sb\_publishable\_%' THEN RAISE EXCEPTION 'Falta pegar la llave pública'; END IF;
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'notify_fcm_on_alert';
  IF def IS NULL THEN RAISE EXCEPTION 'No encontré la función notify_fcm_on_alert'; END IF;
  IF position('Bearer ' || llave IN def) > 0 THEN RETURN; END IF;  -- ya estaba arreglada
  SELECT count(*) INTO n FROM regexp_matches(def, 'Bearer [A-Za-z0-9._-]*•+', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'Esperaba 1 llave oculta en notify_fcm_on_alert y hay %: no cambié nada', n; END IF;
  nuevo := regexp_replace(def, 'Bearer [A-Za-z0-9._-]*•+', 'Bearer ' || llave);
  EXECUTE nuevo;
END $$;

-- ---------- Revisión (solo mira): la función como quedó, con la llave tapada ----------
-- Línea 0: cuánto espera el servidor por defecto cada aviso (net.http_post).
SELECT linea, texto FROM (
  SELECT t.n AS linea,
         regexp_replace(regexp_replace(t.l, 'sb_publishable_[A-Za-z0-9_-]+', '«llave pública»', 'g'),
                        'eyJ[A-Za-z0-9._-]+', '«llave»', 'g') AS texto
  FROM pg_proc p
  CROSS JOIN LATERAL regexp_split_to_table(p.prosrc, E'\n') WITH ORDINALITY AS t(l, n)
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'notify_fcm_on_alert'
  UNION ALL
  SELECT 0, 'net.http_post(' || pg_get_function_arguments(p.oid) || ')'
  FROM pg_proc p
  WHERE p.pronamespace = 'net'::regnamespace AND p.proname = 'http_post'
) revision
ORDER BY 1;
