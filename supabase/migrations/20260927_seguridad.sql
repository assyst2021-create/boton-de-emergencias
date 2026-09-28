-- ============================================================
-- SEGURIDAD (27-09-2026). Cierra 4 huecos que solo se podían
-- aprovechar saltándose la app (llamando directo a la base):
--   1. Teléfonos de todos los usuarios visibles para cualquiera
--   2. Ponerse Premium sin pagar editando su propio plan
--   3. "Vincularse" a alguien sin su permiso y ver sus alertas con GPS
--   4. Saltarse el límite de 6 alertas marcándolas como automáticas
-- Las funciones del servidor (service_role) y el SQL Editor no se ven afectados.
-- ============================================================

-- ---------- 1. Datos de usuarios: solo los míos y los de mis familiares ----------

-- Buscar por @usuario exacto devolviendo solo id, nombre y usuario (nunca el teléfono)
CREATE OR REPLACE FUNCTION public.buscar_usuario(nombre TEXT)
RETURNS TABLE(id UUID, full_name TEXT, username TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.id, u.full_name, u.username
  FROM public.users u
  WHERE auth.uid() IS NOT NULL
    AND lower(u.username) = lower(trim(both '@' from trim(nombre)))
    AND u.id <> auth.uid()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.buscar_usuario(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_usuario(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Ver otros usuarios" ON public.users;
DROP POLICY IF EXISTS "Ver familiares" ON public.users;
CREATE POLICY "Ver familiares" ON public.users FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.family_links fl
      WHERE (fl.status = 'accepted' AND (
               (fl.user_id = auth.uid() AND fl.linked_user_id = users.id)
            OR (fl.linked_user_id = auth.uid() AND fl.user_id = users.id)))
         -- quien me envió una solicitud: para ver su nombre y poder aceptarla
         OR (fl.status = 'pending' AND fl.user_id = users.id AND fl.linked_user_id = auth.uid())
    )
  );

-- Tokens internos (notificaciones y pagos) no se pueden leer desde la app, ni siquiera los propios
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

-- ---------- 2. El plan solo lo cambia el servidor (después de verificar el pago) ----------
CREATE OR REPLACE FUNCTION public.proteger_campos_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;   -- servidor o SQL Editor

  IF TG_OP = 'INSERT' THEN
    NEW.is_premium := false;
    NEW.premium_hasta := NULL;
    NEW.play_purchase_token := NULL;
    IF NEW.plan IN ('premium', 'familiar') THEN NEW.plan := 'basico'; END IF;
    RETURN NEW;
  END IF;

  NEW.is_premium := OLD.is_premium;
  NEW.premium_hasta := OLD.premium_hasta;
  NEW.play_purchase_token := OLD.play_purchase_token;
  -- Desde la app solo se permite pasar a 'basico', y no si tiene un plan pago vigente
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    IF NOT (NEW.plan = 'basico' AND NOT (
         (OLD.plan IN ('premium', 'familiar') OR OLD.is_premium)
         AND (OLD.premium_hasta IS NULL OR OLD.premium_hasta > NOW()))) THEN
      NEW.plan := OLD.plan;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proteger_campos_usuario ON public.users;
CREATE TRIGGER trg_proteger_campos_usuario
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_usuario();

-- ---------- 3. Vínculos: solo aceptando una solicitud real ----------
CREATE OR REPLACE FUNCTION public.proteger_vinculos()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;   -- servidor o SQL Editor

  IF NEW.user_id = NEW.linked_user_id THEN
    RAISE EXCEPTION 'VINCULO_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  -- Un vínculo existente no se puede "mover" hacia otra persona
  IF TG_OP = 'UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id
                        OR NEW.linked_user_id IS DISTINCT FROM OLD.linked_user_id) THEN
    RAISE EXCEPTION 'VINCULO_INVALIDO' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    IF TG_OP = 'UPDATE' AND auth.uid() = NEW.linked_user_id AND OLD.status = 'pending' THEN
      NULL;  -- quien recibió la solicitud la acepta
    ELSIF EXISTS (SELECT 1 FROM public.family_links
                  WHERE user_id = NEW.linked_user_id AND linked_user_id = NEW.user_id
                    AND status = 'accepted') THEN
      NULL;  -- la fila de vuelta, cuando la otra persona ya aceptó
    ELSE
      RAISE EXCEPTION 'VINCULO_INVALIDO' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proteger_vinculos ON public.family_links;
CREATE TRIGGER trg_proteger_vinculos
  BEFORE INSERT OR UPDATE ON public.family_links
  FOR EACH ROW EXECUTE FUNCTION public.proteger_vinculos();

-- Quien envió la solicitud puede actualizar su propia fila (la regla de arriba impide que se auto-acepte)
DROP POLICY IF EXISTS "Actualizar mis links propios" ON public.family_links;
CREATE POLICY "Actualizar mis links propios" ON public.family_links FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- 4. Alertas automáticas solo para planes pagos ----------
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
    -- La segunda alerta automática es de pago: en plan Gratis se descarta sin error
    IF NOT COALESCE(v_pago, false) THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.alertas_mes (user_id, mes, usadas) VALUES (NEW.sender_id, v_mes, 1)
  ON CONFLICT (user_id, mes) DO UPDATE SET usadas = alertas_mes.usadas + 1
  RETURNING usadas INTO v_usadas;

  IF NOT COALESCE(v_pago, false) AND v_usadas > 6 THEN
    RAISE EXCEPTION 'LIMITE_ALERTAS' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;
