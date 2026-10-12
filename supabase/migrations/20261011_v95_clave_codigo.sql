-- Versión 95, punto 7: la contraseña se puede cambiar con un código de 6 números que llega al correo.
-- SEGURIDAD: quien tenga el celular desbloqueado y el correo abierto en él (por ejemplo, un ladrón)
-- podría pedir un código y apagar "Permitir recuperar mi celular". Por eso, durante 24 horas después de
-- pedir un código (auth.users.recovery_sent_at, lo anota Supabase al enviarlo) NO se puede apagar.
-- Encenderla sí. Lo mismo hace la función eliminar-cuenta; cerrar sesión con la opción activa lo
-- revisa la app. Igual que la versión 89 + esa revisión. Se puede correr varias veces sin problema.
CREATE OR REPLACE FUNCTION public.set_recuperacion(activa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hasta timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTORIZADO' USING ERRCODE = '28000'; END IF;
  -- Activarla es del plan Premium (apagarla siempre se permite, salvo lo de abajo)
  IF COALESCE(activa, false) AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND plan IS DISTINCT FROM 'familiar'
      AND (plan = 'premium' OR is_premium)
      AND (premium_hasta IS NULL OR premium_hasta > now())
  ) THEN
    RAISE EXCEPTION 'SOLO_PREMIUM' USING ERRCODE = '42501';
  END IF;
  -- Apagarla: no durante las 24 h siguientes a pedir un código para cambiar la contraseña.
  -- La app lee la fecha del mensaje ("CODIGO_RECIENTE <hasta>") para decir desde cuándo se puede.
  IF NOT COALESCE(activa, false) THEN
    SELECT u.recovery_sent_at + interval '24 hours' INTO v_hasta FROM auth.users u WHERE u.id = auth.uid();
    IF v_hasta > now() THEN
      RAISE EXCEPTION 'CODIGO_RECIENTE %', to_char(v_hasta AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE public.users SET recuperacion_activa = COALESCE(activa, false) WHERE id = auth.uid();
  IF NOT COALESCE(activa, false) AND EXISTS (
    SELECT 1 FROM public.recuperacion_sesiones WHERE owner_id = auth.uid() AND estado = 'activa'
  ) THEN
    PERFORM public.cerrar_recuperacion(auth.uid());
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_recuperacion(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recuperacion(boolean) TO authenticated;

-- ---------- Revisión: debe decir "con las 24 horas (bien)" y "no" en quien la puede usar sin sesión ----------
SELECT 'set_recuperacion' AS que,
       CASE WHEN prosrc LIKE '%CODIGO_RECIENTE%' AND prosrc LIKE '%cerrar_recuperacion%'
            THEN 'con las 24 horas (bien)' ELSE 'vieja' END AS estado
  FROM pg_proc WHERE proname = 'set_recuperacion' AND pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'sin sesión la puede usar', CASE WHEN has_function_privilege('anon', 'public.set_recuperacion(boolean)', 'EXECUTE') THEN 'sí (mal)' ELSE 'no (bien)' END;
