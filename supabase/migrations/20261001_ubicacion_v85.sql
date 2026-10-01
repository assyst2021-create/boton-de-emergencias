-- Versión 85: En vivo más confiable.
--  1. Llave del celular para subir la ubicación (hasta 26 h) sin usar la sesión. La sesión se
--     renueva cada hora y, si el servicio del celular y la app la renovaban a destiempo, Supabase
--     anulaba las dos: la ubicación se congelaba ("caída") y la persona quedaba sin sesión.
--  2. "Está compartiendo su ubicación" también llega si la vez anterior quedó marcada como activa
--     (celular apagado, app cerrada a la fuerza, tiempo vencido sin avisar).
--  3. Aviso "se está moviendo" cuando la persona pasa de quieta a moverse (aunque las dos apps
--     estén cerradas): máximo uno cada 10 minutos por persona.
-- Se puede correr varias veces sin problema.

-- ---------- Distancia en metros entre dos puntos ----------
CREATE OR REPLACE FUNCTION public.distancia_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- ---------- Columnas para saber si la persona se está moviendo ----------
ALTER TABLE public.live_locations ADD COLUMN IF NOT EXISTS mov_lat float8;
ALTER TABLE public.live_locations ADD COLUMN IF NOT EXISTS mov_lng float8;
ALTER TABLE public.live_locations ADD COLUMN IF NOT EXISTS mov_at timestamptz;
ALTER TABLE public.live_locations ADD COLUMN IF NOT EXISTS en_movimiento boolean NOT NULL DEFAULT false;
ALTER TABLE public.live_locations ADD COLUMN IF NOT EXISTS aviso_mov_at timestamptz;

-- ---------- 1. Llave del celular ----------
CREATE TABLE IF NOT EXISTS public.gps_llaves (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  llave_hash   text NOT NULL,
  valida_hasta timestamptz NOT NULL
);
-- Sin políticas: nadie la puede leer ni escribir desde la app, solo con las funciones de abajo
ALTER TABLE public.gps_llaves ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS gps_llaves_hash ON public.gps_llaves (llave_hash);

-- La app (con sesión) crea la llave al empezar a compartir; se guarda solo su huella
CREATE OR REPLACE FUNCTION public.crear_llave_gps(llave text, horas int DEFAULT 26)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR length(coalesce(llave, '')) < 32 THEN
    RAISE EXCEPTION 'NO_AUTORIZADO' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.gps_llaves (user_id, llave_hash, valida_hasta)
  VALUES (auth.uid(), encode(sha256(convert_to(llave, 'UTF8')), 'hex'),
          now() + make_interval(hours => least(greatest(coalesce(horas, 26), 1), 26)))
  ON CONFLICT (user_id) DO UPDATE
    SET llave_hash = EXCLUDED.llave_hash, valida_hasta = EXCLUDED.valida_hasta;
END $$;
REVOKE ALL ON FUNCTION public.crear_llave_gps(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_llave_gps(text, int) TO authenticated;

-- El servicio del celular sube la ubicación con la llave (sin sesión)
CREATE OR REPLACE FUNCTION public.subir_ubicacion(
  llave text, lat float8, lng float8, prec float8, hasta timestamptz, con uuid[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  SELECT g.user_id INTO uid FROM public.gps_llaves g
   WHERE g.llave_hash = encode(sha256(convert_to(coalesce(llave, ''), 'UTF8')), 'hex')
     AND g.valida_hasta > now();
  IF uid IS NULL THEN RAISE EXCEPTION 'LLAVE_INVALIDA' USING ERRCODE = '28000'; END IF;
  IF lat IS NULL OR lng IS NULL OR lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'PUNTO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.live_locations
    (user_id, latitude, longitude, precision_m, activo, updated_at, expires_at, compartir_con)
  VALUES (uid, lat, lng, prec, true, now(),
          least(coalesce(hasta, now() + interval '1 hour'), now() + interval '25 hours'), con)
  ON CONFLICT (user_id) DO UPDATE SET
    latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, precision_m = EXCLUDED.precision_m,
    activo = true, updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at,
    compartir_con = EXCLUDED.compartir_con;
END $$;
REVOKE ALL ON FUNCTION public.subir_ubicacion(text, float8, float8, float8, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subir_ubicacion(text, float8, float8, float8, timestamptz, uuid[]) TO anon, authenticated;

-- "Dejar de compartir" desde el servicio del celular: apaga la ubicación y borra la llave
CREATE OR REPLACE FUNCTION public.apagar_ubicacion(llave text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  SELECT g.user_id INTO uid FROM public.gps_llaves g
   WHERE g.llave_hash = encode(sha256(convert_to(coalesce(llave, ''), 'UTF8')), 'hex');
  IF uid IS NULL THEN RAISE EXCEPTION 'LLAVE_INVALIDA' USING ERRCODE = '28000'; END IF;
  UPDATE public.live_locations SET activo = false WHERE user_id = uid;
  DELETE FROM public.gps_llaves WHERE user_id = uid;
END $$;
REVOKE ALL ON FUNCTION public.apagar_ubicacion(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apagar_ubicacion(text) TO anon, authenticated;

-- ---------- 2. Hora de inicio: una sesión vieja que quedó "activa" cuenta como nueva ----------
CREATE OR REPLACE FUNCTION public.marcar_inicio_ubicacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.activo THEN NEW.iniciado_at := now(); END IF;
    RETURN NEW;
  END IF;
  IF NEW.activo AND (NOT OLD.activo OR OLD.iniciado_at IS NULL
      OR OLD.expires_at < now() OR OLD.updated_at < now() - interval '30 minutes') THEN
    NEW.iniciado_at := now();
  ELSE
    NEW.iniciado_at := OLD.iniciado_at;
  END IF;
  RETURN NEW;
END $$;

-- ---------- 2 y 3. Avisos por notificación (usan la misma llave del servidor que las alertas) ----------
DO $$
DECLARE clave TEXT;
BEGIN
  SELECT substring(prosrc from 'Bearer ([A-Za-z0-9._-]+)') INTO clave
  FROM pg_proc WHERE proname = 'notify_fcm_on_alert';
  IF clave IS NULL THEN RAISE EXCEPTION 'No encontré la llave de notify_fcm_on_alert'; END IF;

  -- "Está compartiendo su ubicación contigo"
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.notify_fcm_on_ubicacion()
    RETURNS trigger LANGUAGE plpgsql AS $b$
    DECLARE nueva boolean;
    BEGIN
      IF NOT NEW.activo THEN RETURN NEW; END IF;
      IF TG_OP = 'INSERT' THEN
        nueva := true;
      ELSE
        nueva := NOT COALESCE(OLD.activo, false) OR OLD.expires_at < now()
                 OR OLD.updated_at < now() - interval '30 minutes';
      END IF;
      IF nueva THEN
        -- Si el aviso fallara, la ubicación igual se guarda
        BEGIN
          PERFORM net.http_post(
            url := 'https://julwbtqrojghvbajsqil.supabase.co/functions/v1/enviar-notificacion-fcm',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
            body := jsonb_build_object('tipo', 'ubicacion', 'record', row_to_json(NEW))
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
      RETURN NEW;
    END $b$;
  $f$, clave);

  -- "Se está moviendo": pasa de quieta a alejarse 50 m del punto donde estaba
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.detectar_movimiento()
    RETURNS trigger LANGUAGE plpgsql AS $b$
    DECLARE d float8; nueva boolean;
    BEGIN
      IF NOT COALESCE(NEW.activo, false) OR NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
        NEW.en_movimiento := false;
        RETURN NEW;
      END IF;
      IF TG_OP = 'INSERT' THEN
        nueva := true;
      ELSE
        nueva := NOT COALESCE(OLD.activo, false) OR NEW.mov_lat IS NULL OR OLD.expires_at < now()
                 OR OLD.updated_at < now() - interval '30 minutes';
      END IF;
      -- Sesión nueva: este es el punto de partida, sin aviso
      IF nueva THEN
        NEW.mov_lat := NEW.latitude; NEW.mov_lng := NEW.longitude;
        NEW.mov_at := now(); NEW.en_movimiento := false;
        RETURN NEW;
      END IF;
      -- Un punto de antenas (impreciso) haría "moverse" a alguien que está quieto
      IF COALESCE(NEW.precision_m, 0) > 40 THEN RETURN NEW; END IF;
      d := public.distancia_m(NEW.mov_lat, NEW.mov_lng, NEW.latitude, NEW.longitude);
      IF NOT NEW.en_movimiento THEN
        IF d >= 50 THEN
          NEW.en_movimiento := true;
          NEW.mov_lat := NEW.latitude; NEW.mov_lng := NEW.longitude; NEW.mov_at := now();
          IF NEW.aviso_mov_at IS NULL OR NEW.aviso_mov_at < now() - interval '10 minutes' THEN
            NEW.aviso_mov_at := now();
            -- Si el aviso fallara, la ubicación igual se guarda
            BEGIN
              PERFORM net.http_post(
                url := 'https://julwbtqrojghvbajsqil.supabase.co/functions/v1/enviar-notificacion-fcm',
                headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
                body := jsonb_build_object('tipo', 'movimiento', 'record', row_to_json(NEW))
              );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
        END IF;
      ELSIF d >= 25 THEN
        -- Sigue avanzando
        NEW.mov_lat := NEW.latitude; NEW.mov_lng := NEW.longitude; NEW.mov_at := now();
      ELSIF NEW.mov_at < now() - interval '3 minutes' THEN
        -- 3 minutos sin avanzar: está quieta otra vez (un semáforo no cuenta)
        NEW.en_movimiento := false;
      END IF;
      RETURN NEW;
    END $b$;
  $f$, clave);
END $$;

DROP TRIGGER IF EXISTS trigger_fcm_ubicacion ON public.live_locations;
CREATE TRIGGER trigger_fcm_ubicacion
  AFTER INSERT OR UPDATE OF activo ON public.live_locations
  FOR EACH ROW EXECUTE FUNCTION public.notify_fcm_on_ubicacion();

DROP TRIGGER IF EXISTS trg_movimiento_ubicacion ON public.live_locations;
CREATE TRIGGER trg_movimiento_ubicacion
  BEFORE INSERT OR UPDATE ON public.live_locations
  FOR EACH ROW EXECUTE FUNCTION public.detectar_movimiento();

-- Revisión: deben salir las 3 funciones nuevas y los 3 disparadores de live_locations
SELECT 'funcion' AS tipo, proname AS nombre FROM pg_proc
 WHERE proname IN ('crear_llave_gps', 'subir_ubicacion', 'apagar_ubicacion')
UNION ALL
SELECT 'disparador', tgname FROM pg_trigger
 WHERE tgrelid = 'public.live_locations'::regclass AND NOT tgisinternal;
