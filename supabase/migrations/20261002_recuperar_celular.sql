-- Versión 87: "Recuperar celular" (solo Android). Antirrobo con consentimiento:
--  - El DUEÑO activa por adelantado, en su propio celular, que un familiar pueda recuperarlo.
--  - Un familiar YA VINCULADO, con el correo/usuario y la CONTRASEÑA del dueño, pide recuperar.
--  - El servidor verifica todo, crea una sesión temporal (24 h) y una llave para que el celular
--    suba su ubicación (la misma llave segura de la 85). Nada de esto toca las alertas.
-- Se puede correr varias veces sin problema.

-- ---------- 1. El dueño activa la recuperación (consentimiento previo) ----------
-- No está en proteger_campos_usuario, así que el dueño la puede prender/apagar desde la app.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS recuperacion_activa boolean NOT NULL DEFAULT false;

-- IMPORTANTE: la seguridad del 27-09 da permiso de SELECT columna por columna. Una columna nueva
-- queda SIN permiso, y entonces TODA la lectura del perfil falla (la app mostraría "Plan Básico"
-- por error). Se vuelve a dar permiso a todas las columnas seguras, incluida la nueva.
DO $$
DECLARE cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users'
    AND column_name NOT IN ('fcm_token', 'play_purchase_token');
  EXECUTE format('GRANT SELECT (%s) ON public.users TO authenticated', cols);
END $$;

-- ---------- 2. Sesiones de recuperación ----------
CREATE TABLE IF NOT EXISTS public.recuperacion_sesiones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  iniciada_at   timestamptz NOT NULL DEFAULT now(),
  vence_at      timestamptz NOT NULL,
  estado        text NOT NULL DEFAULT 'activa',   -- 'activa' | 'finalizada'
  ended_at      timestamptz
);
CREATE INDEX IF NOT EXISTS recuperacion_sesiones_owner ON public.recuperacion_sesiones (owner_id, estado);
ALTER TABLE public.recuperacion_sesiones ENABLE ROW LEVEL SECURITY;

-- El dueño y sus familiares aceptados pueden VER el estado de la recuperación (para "Recuperación activa").
DROP POLICY IF EXISTS "Ver recuperacion del grupo" ON public.recuperacion_sesiones;
CREATE POLICY "Ver recuperacion del grupo" ON public.recuperacion_sesiones FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR solicitante_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.family_links fl
      WHERE fl.status = 'accepted'
        AND ((fl.user_id = auth.uid() AND fl.linked_user_id = owner_id)
          OR (fl.linked_user_id = auth.uid() AND fl.user_id = owner_id))
    )
  );
-- Crear/cerrar sesiones solo lo hace el servidor (Edge Function con service role): sin políticas de INSERT/UPDATE.

-- ---------- 3. Bloqueo contra intentos de adivinar la contraseña ----------
-- Se guarda por "clave" (correo o usuario en minúsculas), porque al fallar aún no sabemos el owner_id.
-- Sin políticas: solo el servidor la lee y escribe.
CREATE TABLE IF NOT EXISTS public.recuperacion_bloqueo (
  clave           text PRIMARY KEY,
  intentos        int NOT NULL DEFAULT 0,
  bloqueado_hasta timestamptz
);
ALTER TABLE public.recuperacion_bloqueo ENABLE ROW LEVEL SECURITY;

-- ---------- Interruptor del dueño (RPC claro, por si el update directo cambiara de reglas) ----------
CREATE OR REPLACE FUNCTION public.set_recuperacion(activa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTORIZADO' USING ERRCODE = '28000'; END IF;
  -- "Recuperar celular" es una función de Plan Premium: solo Premium puede ACTIVARLA
  -- (apagarla siempre se permite). Familiar no cuenta, igual que en el resto de la app.
  IF COALESCE(activa, false) AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND plan IS DISTINCT FROM 'familiar'
      AND (plan = 'premium' OR is_premium)
      AND (premium_hasta IS NULL OR premium_hasta > now())
  ) THEN
    RAISE EXCEPTION 'SOLO_PREMIUM' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users SET recuperacion_activa = COALESCE(activa, false) WHERE id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.set_recuperacion(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_recuperacion(boolean) TO authenticated;

-- ---------- Crear/cerrar la sesión + la llave, en una sola operación del servidor ----------
-- La llama la Edge Function (service role) DESPUÉS de verificar contraseña, vínculo y autorización.
CREATE OR REPLACE FUNCTION public.abrir_recuperacion(
  p_owner uuid, p_solicitante uuid, p_llave_hash text, p_horas int DEFAULT 24)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_vence timestamptz;
BEGIN
  v_vence := now() + make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 24));
  -- Cerrar cualquier sesión anterior de ese dueño (no se acumulan)
  UPDATE public.recuperacion_sesiones
     SET estado = 'finalizada', ended_at = now()
   WHERE owner_id = p_owner AND estado = 'activa';
  INSERT INTO public.recuperacion_sesiones (owner_id, solicitante_id, vence_at)
  VALUES (p_owner, p_solicitante, v_vence);
  -- Llave del celular (la misma mecánica de la 85): se guarda solo la huella
  INSERT INTO public.gps_llaves (user_id, llave_hash, valida_hasta)
  VALUES (p_owner, p_llave_hash, v_vence)
  ON CONFLICT (user_id) DO UPDATE SET llave_hash = EXCLUDED.llave_hash, valida_hasta = EXCLUDED.valida_hasta;
  RETURN v_vence;
END $$;
REVOKE ALL ON FUNCTION public.abrir_recuperacion(uuid, uuid, text, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cerrar_recuperacion(p_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.recuperacion_sesiones
     SET estado = 'finalizada', ended_at = now()
   WHERE owner_id = p_owner AND estado = 'activa';
  UPDATE public.live_locations SET activo = false WHERE user_id = p_owner;
  DELETE FROM public.gps_llaves WHERE user_id = p_owner;
END $$;
REVOKE ALL ON FUNCTION public.cerrar_recuperacion(uuid) FROM PUBLIC;

-- Revisión: columna, 2 tablas, 3 funciones
SELECT 'columna' AS tipo, 'users.recuperacion_activa' AS nombre
UNION ALL SELECT 'tabla', relname FROM pg_class WHERE relname IN ('recuperacion_sesiones', 'recuperacion_bloqueo')
UNION ALL SELECT 'funcion', proname FROM pg_proc WHERE proname IN ('set_recuperacion', 'abrir_recuperacion', 'cerrar_recuperacion');
