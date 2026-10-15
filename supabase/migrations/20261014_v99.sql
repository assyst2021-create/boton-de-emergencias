-- Versión 99
--  1) Actualización sola: las alertas y los familiares avisan al instante a la app (tiempo real).
--     Si ya estaban, no cambia nada. Igual que la ubicación desde la versión 85. La base solo le
--     manda a cada persona lo que ya puede ver (las mismas reglas de siempre).
--  2) Recuperar celular con el celular apagado, sin señal o en modo avión: la orden queda guardada
--     y el celular empieza a compartir apenas se conecta. Si la orden no alcanzó a salir (por ejemplo,
--     en ese momento el celular no podía recibir avisos), queda marcada y, al abrirse la app con señal,
--     se manda con una llave nueva. La función la usa SOLO el servidor (la función recuperar-celular).
-- Se puede correr varias veces sin problema. Nada de esto toca las alertas de emergencia ni los pagos.

-- ---------- 1) Tiempo real ----------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.family_links;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- 2) Mandar una orden de recuperación que no alcanzó a salir ----------
-- true = la orden salió (lo normal; también las sesiones de antes). false = no salió y se espera a que
-- la app del celular la pida.
ALTER TABLE public.recuperacion_sesiones ADD COLUMN IF NOT EXISTS orden_enviada boolean NOT NULL DEFAULT true;

-- Solo si hay una recuperación activa de esa persona cuya orden no salió y su celular todavía no ha
-- mandado ninguna ubicación desde entonces. Cambia la huella de la llave (la llave vieja deja de
-- servir) y devuelve hasta cuándo dura. Si no aplica, devuelve NULL y no cambia nada.
CREATE OR REPLACE FUNCTION public.reenviar_recuperacion(p_owner uuid, p_llave_hash text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inicio timestamptz; v_vence timestamptz;
BEGIN
  IF p_owner IS NULL OR length(coalesce(p_llave_hash, '')) <> 64 THEN RETURN NULL; END IF;
  SELECT s.iniciada_at, s.vence_at INTO v_inicio, v_vence FROM public.recuperacion_sesiones s
   WHERE s.owner_id = p_owner AND s.estado = 'activa' AND s.vence_at > now() AND NOT s.orden_enviada
   ORDER BY s.iniciada_at DESC LIMIT 1;
  IF v_vence IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.live_locations l
              WHERE l.user_id = p_owner AND l.activo AND l.updated_at >= v_inicio) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.gps_llaves (user_id, llave_hash, valida_hasta)
  VALUES (p_owner, p_llave_hash, v_vence)
  ON CONFLICT (user_id) DO UPDATE SET llave_hash = EXCLUDED.llave_hash, valida_hasta = EXCLUDED.valida_hasta;
  RETURN v_vence;
END $$;
REVOKE ALL ON FUNCTION public.reenviar_recuperacion(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reenviar_recuperacion(uuid, text) TO service_role;

-- ---------- Revisión (las 4 primeras deben decir "sí (bien)" y las 2 últimas "no") ----------
SELECT 'alertas en tiempo real' AS revision,
       CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'alerts') THEN 'sí (bien)' ELSE 'NO (mal)' END AS resultado
UNION ALL SELECT 'familiares en tiempo real',
       CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'family_links') THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'columna recuperacion_sesiones.orden_enviada',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'recuperacion_sesiones' AND column_name = 'orden_enviada') THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'función reenviar_recuperacion',
       CASE WHEN to_regprocedure('public.reenviar_recuperacion(uuid, text)') IS NOT NULL THEN 'sí (bien)' ELSE 'NO (mal)' END
UNION ALL SELECT 'reenviar_recuperacion sin sesión',
       CASE WHEN has_function_privilege('anon', 'public.reenviar_recuperacion(uuid, text)', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END
UNION ALL SELECT 'reenviar_recuperacion con sesión',
       CASE WHEN has_function_privilege('authenticated', 'public.reenviar_recuperacion(uuid, text)', 'EXECUTE') THEN 'SÍ (mal)' ELSE 'no' END;
