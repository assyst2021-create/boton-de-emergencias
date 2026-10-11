-- Versión 95, punto 2: Recuperar celular
--  a) SEGURIDAD: abrir_recuperacion y cerrar_recuperacion las debe usar SOLO el servidor (la función
--     recuperar-celular). En la 87 se les quitó el permiso solo a PUBLIC, pero Supabase se lo da por
--     defecto a anon y authenticated: cualquiera con la llave pública de la app podía abrir una
--     recuperación falsa a nombre de otra persona (y subir una ubicación inventada) o detener la de
--     otra persona. Comprobado el 11-10 (cerrar_recuperacion sin sesión respondía 204).
--     También limite_familiares y contar_familiares: solo las usa por dentro la regla del límite.
--  b) Quien pide la recuperación escoge qué familiares ven la ubicación del celular (antes, todos).
--     Se guarda en la sesión de recuperación y la base la aplica a cada punto que sube el celular,
--     aunque el celular perdido tenga una versión vieja de la app.
--  c) El letrero "recuperación activa" solo lo ven el dueño, quien la pidió y los escogidos.
-- Se puede correr varias veces sin problema. Nada de esto toca las alertas de emergencia.

-- ---------- a) Seguridad ----------
REVOKE ALL ON FUNCTION public.cerrar_recuperacion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_recuperacion(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.limite_familiares(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contar_familiares(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
-- (abrir_recuperacion se rehace abajo, ya con sus permisos)

-- ---------- b) Con quién se comparte la ubicación del celular recuperado ----------
-- NULL = todo el grupo familiar del dueño (lo de siempre)
ALTER TABLE public.recuperacion_sesiones ADD COLUMN IF NOT EXISTS compartir_con uuid[];

-- La versión de 4 datos se reemplaza por una de 5 (el quinto es opcional: la función del servidor
-- que ya está publicada la sigue llamando igual y funciona como antes)
DROP FUNCTION IF EXISTS public.abrir_recuperacion(uuid, uuid, text, int);
CREATE OR REPLACE FUNCTION public.abrir_recuperacion(
  p_owner uuid, p_solicitante uuid, p_llave_hash text, p_horas int DEFAULT 24, p_con uuid[] DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_vence timestamptz;
BEGIN
  v_vence := now() + make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 24));
  -- Cerrar cualquier sesión anterior de ese dueño (no se acumulan)
  UPDATE public.recuperacion_sesiones
     SET estado = 'finalizada', ended_at = now()
   WHERE owner_id = p_owner AND estado = 'activa';
  INSERT INTO public.recuperacion_sesiones (owner_id, solicitante_id, vence_at, compartir_con)
  VALUES (p_owner, p_solicitante, v_vence, CASE WHEN cardinality(p_con) > 0 THEN p_con END);
  -- Llave del celular (la misma mecánica de la 85): se guarda solo la huella
  INSERT INTO public.gps_llaves (user_id, llave_hash, valida_hasta)
  VALUES (p_owner, p_llave_hash, v_vence)
  ON CONFLICT (user_id) DO UPDATE SET llave_hash = EXCLUDED.llave_hash, valida_hasta = EXCLUDED.valida_hasta;
  RETURN v_vence;
END $$;
REVOKE ALL ON FUNCTION public.abrir_recuperacion(uuid, uuid, text, int, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_recuperacion(uuid, uuid, text, int, uuid[]) TO service_role;

-- El celular sube su punto con la llave. Igual que en la 85, salvo una cosa: si hay una recuperación
-- activa, a quién se le muestra lo decide la sesión de recuperación (no lo que mande el celular)
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
          least(coalesce(hasta, now() + interval '1 hour'), now() + interval '25 hours'), con)
  ON CONFLICT (user_id) DO UPDATE SET
    latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, precision_m = EXCLUDED.precision_m,
    activo = true, updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at,
    compartir_con = EXCLUDED.compartir_con;
END $$;
REVOKE ALL ON FUNCTION public.subir_ubicacion(text, float8, float8, float8, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subir_ubicacion(text, float8, float8, float8, timestamptz, uuid[]) TO anon, authenticated;

-- ---------- c) Quién ve el letrero "recuperación activa" ----------
DROP POLICY IF EXISTS "Ver recuperacion del grupo" ON public.recuperacion_sesiones;
CREATE POLICY "Ver recuperacion del grupo" ON public.recuperacion_sesiones FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR solicitante_id = auth.uid()
    OR ((compartir_con IS NULL OR auth.uid() = ANY (compartir_con)) AND EXISTS (
      SELECT 1 FROM public.family_links fl
      WHERE fl.status = 'accepted'
        AND ((fl.user_id = auth.uid() AND fl.linked_user_id = owner_id)
          OR (fl.linked_user_id = auth.uid() AND fl.user_id = owner_id))
    ))
  );

-- ---------- Revisión (todo debe decir "no", menos la última línea) ----------
SELECT 'abrir_recuperacion sin sesión' AS revision, CASE WHEN has_function_privilege('anon', 'public.abrir_recuperacion(uuid, uuid, text, int, uuid[])', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END AS resultado
UNION ALL SELECT 'abrir_recuperacion con sesión', CASE WHEN has_function_privilege('authenticated', 'public.abrir_recuperacion(uuid, uuid, text, int, uuid[])', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'cerrar_recuperacion sin sesión', CASE WHEN has_function_privilege('anon', 'public.cerrar_recuperacion(uuid)', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'cerrar_recuperacion con sesión', CASE WHEN has_function_privilege('authenticated', 'public.cerrar_recuperacion(uuid)', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'limite_familiares sin sesión', CASE WHEN has_function_privilege('anon', 'public.limite_familiares(uuid)', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'abrir_recuperacion vieja (4 datos) sigue', CASE WHEN to_regprocedure('public.abrir_recuperacion(uuid, uuid, text, integer)') IS NOT NULL THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'columna recuperacion_sesiones.compartir_con', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'recuperacion_sesiones' AND column_name = 'compartir_con') THEN 'sí (bien)' ELSE 'NO (mal)' END;
