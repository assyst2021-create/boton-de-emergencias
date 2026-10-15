-- Versión 100: ubicaciones de ESTE momento y precisas (auditoría del mapa, 14-10-2026)
--  1) Alerta automática: ya NO usa la ubicación de cuando se programó (de hasta 2 horas antes, de otro
--     sitio). Usa la que manda la app abierta, o la que se está compartiendo en vivo (de menos de
--     2 minutos). Si no hay ninguna, la alerta sale sin ubicación y se le pide la de este momento al
--     celular: apenas responde, la alerta la recibe y la familia recibe el aviso con el mapa.
--  2) La respuesta del celular llega con una llave de un solo uso por alerta (como la llave de la
--     ubicación en vivo): sin sesión, pero solo sirve para poner la ubicación de esa alerta.
--  3) Cuando la alerta salió con una ubicación aproximada (de antenas o wifi), la app la reemplaza
--     por la exacta del GPS apenas la tiene (solo la propia alerta y en sus primeros 30 minutos).
-- Se puede correr varias veces sin problema. No toca los pagos ni quién recibe cada alerta.

-- ---------- 1) Alerta automática: nunca una ubicación vieja ----------
CREATE OR REPLACE FUNCTION public.disparar_alertas_vencidas(
  p_user uuid DEFAULT NULL, p_lat float8 DEFAULT NULL, p_lng float8 DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_ok boolean; v_lat float8; v_lng float8; v_tomada int; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.scheduled_alerts
            WHERE fired = false AND scheduled_at <= now() AND (p_user IS NULL OR user_id = p_user)
            ORDER BY scheduled_at
            FOR UPDATE SKIP LOCKED
  LOOP
    -- Se "toma" primero: si ya se envió o se canceló entretanto, no sale dos veces
    UPDATE public.scheduled_alerts SET fired = true WHERE id = r.id AND fired = false;
    GET DIAGNOSTICS v_tomada = ROW_COUNT;
    IF v_tomada = 0 THEN CONTINUE; END IF;

    -- La apagó o ya no tiene plan Familiar/Premium: la cadena termina
    SELECT COALESCE(u.auto_alert_enabled, false)
           AND (u.plan IN ('premium', 'familiar') OR COALESCE(u.is_premium, false))
           AND (u.premium_hasta IS NULL OR u.premium_hasta > now())
      INTO v_ok FROM public.users u WHERE u.id = r.user_id;
    IF NOT COALESCE(v_ok, false) THEN CONTINUE; END IF;

    -- Ubicación de ESTE momento: la que manda el celular ahora o la que comparte en vivo (de hace
    -- menos de 2 minutos). Versión 100: ya no se usa la de cuando se programó (podía ser de 2 horas
    -- antes y de otro sitio). Sin ninguna, sale sin ubicación y el servidor se la pide al celular.
    v_lat := p_lat; v_lng := p_lng;
    IF v_lat IS NULL OR v_lng IS NULL THEN
      v_lat := NULL; v_lng := NULL;
      SELECT l.latitude, l.longitude INTO v_lat, v_lng FROM public.live_locations l
       WHERE l.user_id = r.user_id AND l.activo AND l.updated_at > now() - interval '2 minutes';
    END IF;

    BEGIN
      INSERT INTO public.alerts (sender_id, status_type, latitude, longitude, sent_at, expires_at, is_auto, destinatarios)
      VALUES (r.user_id, r.status_type, v_lat, v_lng, now(), now() + interval '24 hours', true, r.destinatarios);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- No salió: queda pendiente para el próximo minuto
      UPDATE public.scheduled_alerts SET fired = false WHERE id = r.id;
      CONTINUE;
    END;

    -- Siguiente de la cadena (una sola pendiente por persona), sin ubicación guardada: cada alerta
    -- busca la suya en el momento en que sale
    DELETE FROM public.scheduled_alerts WHERE user_id = r.user_id AND fired = false;
    INSERT INTO public.scheduled_alerts (user_id, status_type, latitude, longitude, scheduled_at, fired, destinatarios)
    VALUES (r.user_id, r.status_type, NULL, NULL, now() + interval '2 hours', false, r.destinatarios);
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.disparar_alertas_vencidas(uuid, float8, float8) FROM PUBLIC, anon, authenticated;

-- ---------- 2) El celular responde con la ubicación de este momento ----------
-- Una llave por alerta (solo la huella). La crea la función enviar-notificacion-fcm al avisar de una
-- alerta automática sin ubicación; se borra al usarse o con la alerta.
CREATE TABLE IF NOT EXISTS public.alertas_ubicar (
  alert_id     uuid PRIMARY KEY REFERENCES public.alerts(id) ON DELETE CASCADE,
  llave_hash   text NOT NULL UNIQUE,
  valida_hasta timestamptz NOT NULL
);
ALTER TABLE public.alertas_ubicar ENABLE ROW LEVEL SECURITY;
-- Sin reglas: nadie la puede leer ni escribir desde la app; solo el servidor y la función de abajo
REVOKE ALL ON public.alertas_ubicar FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ubicar_alerta_llave(llave text, lat float8, lng float8)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_alerta uuid; n int;
BEGIN
  IF length(coalesce(llave, '')) <> 64 OR lat IS NULL OR lng IS NULL
     OR lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 THEN
    RETURN false;
  END IF;
  SELECT a.alert_id INTO v_alerta FROM public.alertas_ubicar a
   WHERE a.llave_hash = encode(sha256(convert_to(lower(llave), 'UTF8')), 'hex') AND a.valida_hasta > now();
  IF v_alerta IS NULL THEN RETURN false; END IF;
  -- Solo si todavía no tiene ubicación: así la familia recibe el aviso con el mapa una sola vez
  UPDATE public.alerts SET latitude = lat, longitude = lng
   WHERE id = v_alerta AND latitude IS NULL AND (expires_at IS NULL OR expires_at > now());
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.alertas_ubicar WHERE alert_id = v_alerta;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.ubicar_alerta_llave(text, float8, float8) FROM PUBLIC;
-- El celular responde sin sesión (con la app cerrada), igual que subir_ubicacion
GRANT EXECUTE ON FUNCTION public.ubicar_alerta_llave(text, float8, float8) TO anon, authenticated;

-- ---------- 3) Cambiar una ubicación aproximada por la exacta ----------
CREATE OR REPLACE FUNCTION public.mejorar_ubicacion_alerta(p_id uuid, p_lat float8, p_lng float8)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL OR p_lat IS NULL OR p_lng IS NULL
     OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RETURN false;
  END IF;
  UPDATE public.alerts SET latitude = p_lat, longitude = p_lng
   WHERE id = p_id AND sender_id = auth.uid()
     AND sent_at > now() - interval '30 minutes'
     AND (expires_at IS NULL OR expires_at > now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.mejorar_ubicacion_alerta(uuid, float8, float8) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mejorar_ubicacion_alerta(uuid, float8, float8) TO authenticated;

-- Las alertas automáticas que ya estaban programadas tampoco llevan la ubicación vieja
UPDATE public.scheduled_alerts SET latitude = NULL, longitude = NULL WHERE fired = false AND latitude IS NOT NULL;

-- ---------- Revisión (las 4 primeras "sí (bien)"; las demás "no") ----------
SELECT 'alerta automática sin ubicación vieja' AS revision,
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname = 'disparar_alertas_vencidas' AND pronamespace = 'public'::regnamespace) LIKE '%interval ''2 minutes''%'
                 AND (SELECT prosrc FROM pg_proc WHERE proname = 'disparar_alertas_vencidas' AND pronamespace = 'public'::regnamespace) NOT LIKE '%r.latitude%'
            THEN 'sí (bien)' ELSE 'NO (mal)' END AS resultado
UNION ALL SELECT 'tabla alertas_ubicar',
       CASE WHEN to_regclass('public.alertas_ubicar') IS NOT NULL THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'función ubicar_alerta_llave',
       CASE WHEN to_regprocedure('public.ubicar_alerta_llave(text, float8, float8)') IS NOT NULL THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'función mejorar_ubicacion_alerta',
       CASE WHEN to_regprocedure('public.mejorar_ubicacion_alerta(uuid, float8, float8)') IS NOT NULL THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'alertas programadas con ubicación vieja',
       CASE WHEN EXISTS (SELECT 1 FROM public.scheduled_alerts WHERE fired = false AND latitude IS NOT NULL) THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'disparar_alertas_vencidas abierta a la app',
       CASE WHEN has_function_privilege('authenticated', 'public.disparar_alertas_vencidas(uuid, float8, float8)', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'mejorar_ubicacion_alerta sin sesión',
       CASE WHEN has_function_privilege('anon', 'public.mejorar_ubicacion_alerta(uuid, float8, float8)', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'alertas_ubicar visible desde la app',
       CASE WHEN has_table_privilege('anon', 'public.alertas_ubicar', 'SELECT') OR has_table_privilege('authenticated', 'public.alertas_ubicar', 'SELECT') THEN 'SÍ (mal)' ELSE 'no' END;
