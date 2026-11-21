-- Versión 107 (21-11-2026): solo dos planes, Gratis y Premium.
--   Gratis: 5 familiares, alertas ilimitadas, ubicación en vivo hasta 8 horas.
--   Premium (y quien tenía el antiguo Familiar): 10 familiares, ubicación hasta 48 horas,
--   alerta automática y Recuperar celular.
-- Solo da más de lo que había: se puede correr antes de publicar la 107 sin dañar la 106.

-- 1) Cuántas horas puede compartir la ubicación cada persona (uso interno del servidor)
CREATE OR REPLACE FUNCTION public.horas_max_ubicacion(uid uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN (u.plan IN ('premium', 'familiar') OR COALESCE(u.is_premium, false))
       AND (u.premium_hasta IS NULL OR u.premium_hasta > now()) THEN 48
      ELSE 8 END
    FROM public.users u WHERE u.id = uid), 8)
$$;
REVOKE ALL ON FUNCTION public.horas_max_ubicacion(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Familiares: Gratis 5 (antes 1); Premium y el antiguo Familiar 10
CREATE OR REPLACE FUNCTION public.limite_familiares(uid UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN u.premium_hasta IS NOT NULL AND u.premium_hasta <= NOW() THEN 5
    WHEN u.plan IN ('premium', 'familiar') OR u.is_premium THEN 10
    ELSE 5
  END
  FROM public.users u WHERE u.id = uid
$$;

-- 3) Alertas: ilimitadas en todos los planes (antes Gratis = 6 al mes).
--    La alerta automática sigue siendo solo de Premium. En Gratis se siguen contando (solo estadística).
CREATE OR REPLACE FUNCTION public.contar_alerta_mes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mes TEXT := to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM');
  v_pago BOOLEAN;
BEGIN
  SELECT (u.plan IN ('premium', 'familiar') OR u.is_premium)
         AND (u.premium_hasta IS NULL OR u.premium_hasta > NOW())
    INTO v_pago FROM public.users u WHERE u.id = NEW.sender_id;

  IF COALESCE(NEW.is_auto, false) THEN
    -- La alerta automática es de Premium: en plan Gratis se descarta sin error
    IF NOT COALESCE(v_pago, false) THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;

  IF NOT COALESCE(v_pago, false) THEN
    INSERT INTO public.alertas_mes (user_id, mes, usadas) VALUES (NEW.sender_id, v_mes, 1)
    ON CONFLICT (user_id, mes) DO UPDATE SET usadas = alertas_mes.usadas + 1;
  END IF;
  RETURN NEW;
END; $$;

-- 4) Llave del servicio de ubicación del celular: según el plan (Gratis 8 h, Premium 48 h) + 2 h de margen
CREATE OR REPLACE FUNCTION public.crear_llave_gps(llave text, horas int DEFAULT 26)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max int;
BEGIN
  IF auth.uid() IS NULL OR length(coalesce(llave, '')) < 32 THEN
    RAISE EXCEPTION 'NO_AUTORIZADO' USING ERRCODE = '28000';
  END IF;
  v_max := public.horas_max_ubicacion(auth.uid()) + 2;
  INSERT INTO public.gps_llaves (user_id, llave_hash, valida_hasta)
  VALUES (auth.uid(), encode(sha256(convert_to(llave, 'UTF8')), 'hex'),
          now() + make_interval(hours => least(greatest(coalesce(horas, 26), 1), v_max)))
  ON CONFLICT (user_id) DO UPDATE
    SET llave_hash = EXCLUDED.llave_hash, valida_hasta = EXCLUDED.valida_hasta;
END $$;

-- 5) Subir la ubicación: el final nunca pasa de lo que permite el plan (Gratis 8 h, Premium 48 h) + 1 h.
--    Todo lo demás queda igual que en la versión 95 (Recuperar celular manda sobre con quién se comparte).
CREATE OR REPLACE FUNCTION public.subir_ubicacion(
  llave text, lat float8, lng float8, prec float8, hasta timestamptz, con uuid[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; v_con_rec uuid[];
BEGIN
  SELECT g.user_id INTO uid FROM public.gps_llaves g
   WHERE g.llave_hash = encode(sha256(convert_to(coalesce(llave, ''), 'UTF8')), 'hex')
     AND g.valida_hasta > now();
  IF uid IS NULL THEN RAISE EXCEPTION 'LLAVE_INVALIDA' USING ERRCODE = '28000'; END IF;
  IF lat IS NULL OR lng IS NULL OR lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'PUNTO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  SELECT s.compartir_con INTO v_con_rec FROM public.recuperacion_sesiones s
   WHERE s.owner_id = uid AND s.estado = 'activa' AND s.vence_at > now()
   ORDER BY s.iniciada_at DESC LIMIT 1;
  IF FOUND THEN con := v_con_rec; END IF;
  INSERT INTO public.live_locations
    (user_id, latitude, longitude, precision_m, activo, updated_at, expires_at, compartir_con)
  VALUES (uid, lat, lng, prec, true, now(),
          least(coalesce(hasta, now() + interval '1 hour'),
                now() + make_interval(hours => public.horas_max_ubicacion(uid) + 1)), con)
  ON CONFLICT (user_id) DO UPDATE SET
    latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, precision_m = EXCLUDED.precision_m,
    activo = true, updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at,
    compartir_con = EXCLUDED.compartir_con;
END $$;

-- 6) Quien tenía el plan Familiar pasa a Premium (con la misma fecha de vencimiento)
UPDATE public.users SET plan = 'premium', is_premium = true WHERE plan = 'familiar';

-- 7) Revisión (solo mira): todo debe decir true y quedan_familiar = 0
SELECT
  (SELECT count(*) FROM public.users WHERE plan = 'familiar') AS quedan_familiar,
  (SELECT prosrc LIKE '%ELSE 5%' FROM pg_proc WHERE proname = 'limite_familiares') AS gratis_5_familiares,
  (SELECT prosrc NOT LIKE '%LIMITE_ALERTAS%' FROM pg_proc WHERE proname = 'contar_alerta_mes') AS alertas_ilimitadas,
  (SELECT prosrc LIKE '%horas_max_ubicacion%' FROM pg_proc WHERE proname = 'subir_ubicacion') AS ubicacion_por_plan,
  (SELECT NOT has_function_privilege('anon', 'public.horas_max_ubicacion(uuid)', 'EXECUTE')) AS funcion_interna_cerrada;
