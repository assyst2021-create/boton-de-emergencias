-- ============================================================
-- VERSIÓN 89 (03-10-2026). Funciona también con las apps viejas: todo lo nuevo es opcional.
-- ============================================================

-- ---------- Punto 1a. Idioma y hora de cada persona para su notificación ----------
-- El servidor escribe la notificación en el idioma de QUIEN LA RECIBE y con su hora.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS idioma text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS zona_horaria text;

-- Permiso de lectura de columnas: todas menos los tokens internos (si falta una columna nueva,
-- leer el perfil falla entero y el plan se ve como "Básico")
DO $$
DECLARE cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users'
    AND column_name NOT IN ('fcm_token', 'play_purchase_token');
  EXECUTE 'REVOKE SELECT ON public.users FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.users TO authenticated', cols);
END $$;

-- ---------- Punto 1b. La alerta que salió sin GPS recibe la ubicación cuando llega ----------
-- Solo quien la envió, solo si todavía no tenía ubicación y solo mientras está vigente (24 h)
CREATE OR REPLACE FUNCTION public.ubicar_alerta(p_id uuid, p_lat float8, p_lng float8)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL OR p_lat IS NULL OR p_lng IS NULL
     OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RETURN false;
  END IF;
  UPDATE public.alerts SET latitude = p_lat, longitude = p_lng
   WHERE id = p_id AND sender_id = auth.uid() AND latitude IS NULL
     AND (expires_at IS NULL OR expires_at > now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.ubicar_alerta(uuid, float8, float8) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ubicar_alerta(uuid, float8, float8) TO authenticated;

-- Segundo aviso a la familia con el mapa (usa la misma llave del servidor que las alertas)
DO $$
DECLARE clave TEXT;
BEGIN
  SELECT substring(prosrc from 'Bearer ([A-Za-z0-9._-]+)') INTO clave
  FROM pg_proc WHERE proname = 'notify_fcm_on_alert';
  IF clave IS NULL THEN RAISE EXCEPTION 'No encontré la llave de notify_fcm_on_alert'; END IF;

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.notify_fcm_ubicacion_alerta()
    RETURNS trigger LANGUAGE plpgsql AS $b$
    BEGIN
      IF OLD.latitude IS NULL AND NEW.latitude IS NOT NULL THEN
        -- Si el aviso fallara, la ubicación igual queda guardada
        BEGIN
          PERFORM net.http_post(
            url := 'https://julwbtqrojghvbajsqil.supabase.co/functions/v1/enviar-notificacion-fcm',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
            body := jsonb_build_object('tipo', 'ubicacion_alerta', 'record', row_to_json(NEW))
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
      RETURN NEW;
    END $b$;
  $f$, clave);
END $$;

DROP TRIGGER IF EXISTS trg_fcm_ubicacion_alerta ON public.alerts;
CREATE TRIGGER trg_fcm_ubicacion_alerta
  AFTER UPDATE OF latitude ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.notify_fcm_ubicacion_alerta();

-- ---------- Punto 1c. Plan Gratis: 6 alertas al mes; Familiar y Premium no gastan cupo ----------
-- Antes también se contaban las de los planes pagos: si el plan se vencía a mitad de mes,
-- la persona quedaba bloqueada con el cupo ya gastado.
CREATE OR REPLACE FUNCTION public.contar_alerta_mes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mes TEXT := to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM');
  v_usadas INT;
  v_pago BOOLEAN;
BEGIN
  SELECT (u.plan IN ('premium', 'familiar') OR u.is_premium)
         AND (u.premium_hasta IS NULL OR u.premium_hasta > NOW())
    INTO v_pago FROM public.users u WHERE u.id = NEW.sender_id;

  IF COALESCE(NEW.is_auto, false) THEN
    -- La alerta automática es de pago: en plan Gratis se descarta sin error
    IF NOT COALESCE(v_pago, false) THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;

  -- Familiar y Premium: ilimitadas
  IF COALESCE(v_pago, false) THEN RETURN NEW; END IF;

  INSERT INTO public.alertas_mes (user_id, mes, usadas) VALUES (NEW.sender_id, v_mes, 1)
  ON CONFLICT (user_id, mes) DO UPDATE SET usadas = alertas_mes.usadas + 1
  RETURNING usadas INTO v_usadas;

  IF v_usadas > 6 THEN
    RAISE EXCEPTION 'LIMITE_ALERTAS' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

-- ---------- Revisión del punto 1: deben salir 4 filas ----------
SELECT 'columna' AS tipo, column_name AS nombre FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('idioma', 'zona_horaria')
UNION ALL
SELECT 'funcion', proname FROM pg_proc WHERE proname = 'ubicar_alerta'
UNION ALL
SELECT 'disparador', tgname FROM pg_trigger WHERE tgname = 'trg_fcm_ubicacion_alerta';

-- ---------- Punto 2. Las alertas se borran de verdad del sistema a las 24 h ----------
-- (Antes: una tarea cada hora, si existía. Ahora cada 10 minutos, y se crea si faltaba.)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'borrar-alertas-vencidas';
END $$;
SELECT cron.schedule(
  'borrar-alertas-vencidas',
  '*/10 * * * *',
  $$DELETE FROM public.alerts
     WHERE expires_at < now()
        OR (expires_at IS NULL AND sent_at < now() - interval '24 hours');$$
);

-- Borrado inmediato de lo que ya pasó de 24 h
DELETE FROM public.alerts
 WHERE expires_at < now() OR (expires_at IS NULL AND sent_at < now() - interval '24 hours');

-- ---------- Revisión del punto 2: debe salir la tarea y 0 alertas vencidas ----------
SELECT 'tarea' AS tipo, jobname || ' · ' || schedule AS detalle FROM cron.job WHERE jobname = 'borrar-alertas-vencidas'
UNION ALL
SELECT 'alertas vencidas que quedan', count(*)::text FROM public.alerts WHERE expires_at < now();

-- ---------- Punto 3a. El vínculo siempre queda en los dos sentidos ----------
-- Un vínculo son dos filas (A→B y B→A). Al aceptar, la app creaba la segunda aparte: si la
-- señal fallaba en ese instante, uno recibía las alertas del otro pero el otro NO, sin aviso.
-- Ahora la base crea (o borra) la fila de vuelta sola, en el mismo momento.
CREATE OR REPLACE FUNCTION public.vinculo_en_dos_sentidos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'accepted' THEN
      -- SKIP LOCKED: si la otra fila ya se está borrando en paralelo, no se espera (sin bloqueos)
      DELETE FROM public.family_links WHERE id IN (
        SELECT id FROM public.family_links
         WHERE user_id = OLD.linked_user_id AND linked_user_id = OLD.user_id AND status = 'accepted'
         FOR UPDATE SKIP LOCKED);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    INSERT INTO public.family_links (user_id, linked_user_id, status)
    VALUES (NEW.linked_user_id, NEW.user_id, 'accepted')
    ON CONFLICT (user_id, linked_user_id) DO UPDATE SET status = 'accepted'
      WHERE public.family_links.status IS DISTINCT FROM 'accepted';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_vinculo_dos_sentidos ON public.family_links;
CREATE TRIGGER trg_vinculo_dos_sentidos
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.family_links
  FOR EACH ROW EXECUTE FUNCTION public.vinculo_en_dos_sentidos();

-- Arreglo de los vínculos que ya quedaron a medias (uno por uno: si alguno no se puede, sigue)
DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN SELECT a.user_id, a.linked_user_id FROM public.family_links a
            WHERE a.status = 'accepted' AND NOT EXISTS (
              SELECT 1 FROM public.family_links b
               WHERE b.user_id = a.linked_user_id AND b.linked_user_id = a.user_id AND b.status = 'accepted')
  LOOP
    BEGIN
      INSERT INTO public.family_links (user_id, linked_user_id, status)
      VALUES (f.linked_user_id, f.user_id, 'accepted')
      ON CONFLICT (user_id, linked_user_id) DO UPDATE SET status = 'accepted';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'No se pudo completar % -> %: %', f.linked_user_id, f.user_id, SQLERRM;
    END;
  END LOOP;
END $$;

-- ---------- Punto 3b. El límite de familiares igual que en la app ----------
-- Antes, un plan Premium o Familiar VENCIDO seguía teniendo 10 o 5 cupos en el servidor.
-- Gratis 1 · Familiar 5 · Premium 10, y solo mientras el plan esté vigente.
CREATE OR REPLACE FUNCTION public.limite_familiares(uid UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN u.premium_hasta IS NOT NULL AND u.premium_hasta <= NOW() THEN 1
    WHEN u.plan = 'familiar' THEN 5
    WHEN u.plan = 'premium' OR u.is_premium THEN 10
    ELSE 1
  END
  FROM public.users u WHERE u.id = uid
$$;

-- ---------- Punto 3c. Solicitudes que YO envié (para verlas y poder cancelarlas) ----------
-- Solo nombre y @usuario de la otra persona: nunca su teléfono antes de que acepte.
CREATE OR REPLACE FUNCTION public.mis_solicitudes_enviadas()
RETURNS TABLE(id uuid, linked_user_id uuid, full_name text, username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.linked_user_id, u.full_name, u.username
    FROM public.family_links f JOIN public.users u ON u.id = f.linked_user_id
   WHERE f.user_id = auth.uid() AND f.status = 'pending'
   ORDER BY f.created_at DESC NULLS LAST
$$;
REVOKE ALL ON FUNCTION public.mis_solicitudes_enviadas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mis_solicitudes_enviadas() TO authenticated;

-- ---------- Punto 3d. Nadie más puede tener tu @usuario (ni con mayúsculas) ----------
-- La base ya impedía repetir el usuario exacto, pero "Michael" y "michael" contaban distinto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users GROUP BY lower(username) HAVING count(*) > 1) THEN
    RAISE NOTICE 'Hay usuarios repetidos con mayúsculas/minúsculas: revisar antes de crear el índice';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_minusculas ON public.users (lower(username));
  END IF;
END $$;

-- ---------- Revisión del punto 3: deben salir 0 vínculos a medias, 0 usuarios repetidos y "sí" ----------
SELECT 'vinculos a medias' AS revision, count(*)::text AS resultado FROM public.family_links a
 WHERE a.status = 'accepted' AND NOT EXISTS (SELECT 1 FROM public.family_links b
   WHERE b.user_id = a.linked_user_id AND b.linked_user_id = a.user_id AND b.status = 'accepted')
UNION ALL
SELECT 'usuarios repetidos', count(*)::text FROM (
  SELECT lower(username) FROM public.users GROUP BY lower(username) HAVING count(*) > 1) r
UNION ALL
SELECT 'usuario unico sin importar mayusculas',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_username_minusculas') THEN 'sí' ELSE 'no' END;
