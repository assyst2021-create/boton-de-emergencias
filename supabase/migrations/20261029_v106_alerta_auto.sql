-- Versión 106: alerta automática
--  1) "Estoy bien" (alerta verde) detiene la alerta automática. Antes seguía saliendo cada 2 horas y
--     solo paraba apagando y prendiendo la opción. La opción queda prendida: la próxima alerta roja o
--     naranja vuelve a empezar la cadena, igual que siempre.
--  2) Si justo en el mismo minuto el servidor estaba enviando la automática, tampoco sale ni se
--     programa la siguiente (una verde enviada después de programarla la detiene).
-- Sirve para todas las versiones de la app y la página web (lo hace la base). No toca el SMS, los
-- botones, la ubicación en vivo, Recuperar celular ni los pagos. Se puede correr varias veces.

-- ---------- 1) La alerta verde detiene la cadena al instante ----------
CREATE OR REPLACE FUNCTION public.detener_auto_al_estar_bien()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status_type = 'green' AND NOT COALESCE(NEW.is_auto, false) THEN
    DELETE FROM public.scheduled_alerts WHERE user_id = NEW.sender_id AND fired = false;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.detener_auto_al_estar_bien() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_detener_auto_al_estar_bien ON public.alerts;
CREATE TRIGGER trg_detener_auto_al_estar_bien
  AFTER INSERT ON public.alerts
  FOR EACH ROW WHEN (NEW.status_type = 'green')
  EXECUTE FUNCTION public.detener_auto_al_estar_bien();

-- ---------- 2) El envío de cada minuto también lo respeta ----------
-- Igual a la versión 100, con una sola regla nueva: si la persona mandó "Estoy bien" después de que
-- se programó esta automática, no sale y la cadena termina.
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

    -- Versión 106: mandó "Estoy bien" después de que se programó esta: no sale y la cadena termina.
    -- (Una verde con la hora del celular mal puesta, "del futuro", no cuenta aquí; igual la detuvo
    -- el disparador apenas llegó.)
    IF EXISTS (SELECT 1 FROM public.alerts a
                WHERE a.sender_id = r.user_id AND a.status_type = 'green' AND NOT COALESCE(a.is_auto, false)
                  AND a.sent_at >= r.scheduled_at - interval '2 hours'
                  AND a.sent_at <= now() + interval '5 minutes') THEN
      CONTINUE;
    END IF;

    -- Ubicación de ESTE momento: la que manda el celular ahora o la que comparte en vivo (de hace
    -- menos de 2 minutos). Sin ninguna, sale sin ubicación y el servidor se la pide al celular.
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

-- ---------- Revisión (las 2 primeras "sí (bien)"; la última "no") ----------
SELECT 'Estoy bien detiene la automática' AS revision,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_detener_auto_al_estar_bien' AND NOT tgisinternal)
            THEN 'sí (bien)' ELSE 'NO (mal)' END AS resultado
UNION ALL SELECT 'el envío de cada minuto lo respeta',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname = 'disparar_alertas_vencidas' AND pronamespace = 'public'::regnamespace) LIKE '%status_type = ''green''%'
            THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'disparar_alertas_vencidas abierta a la app',
       CASE WHEN has_function_privilege('authenticated', 'public.disparar_alertas_vencidas(uuid, float8, float8)', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END;
