-- Contador mensual de alertas manuales. Las alertas se autoborran a las 24 h,
-- así que contarlas en la tabla alerts daba menos de las reales (el plan Gratis pasaba de 6).
CREATE TABLE IF NOT EXISTS public.alertas_mes (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mes     TEXT NOT NULL,              -- 'AAAA-MM' en hora de Colombia
  usadas  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, mes)
);
ALTER TABLE public.alertas_mes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver mi contador" ON public.alertas_mes;
CREATE POLICY "Ver mi contador" ON public.alertas_mes FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.contar_alerta_mes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mes TEXT := to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM');
  v_usadas INT;
  v_pago BOOLEAN;
BEGIN
  IF COALESCE(NEW.is_auto, false) THEN RETURN NEW; END IF;

  INSERT INTO public.alertas_mes (user_id, mes, usadas) VALUES (NEW.sender_id, v_mes, 1)
  ON CONFLICT (user_id, mes) DO UPDATE SET usadas = alertas_mes.usadas + 1
  RETURNING usadas INTO v_usadas;

  SELECT (u.plan IN ('premium', 'familiar') OR u.is_premium)
         AND (u.premium_hasta IS NULL OR u.premium_hasta > NOW())
    INTO v_pago FROM public.users u WHERE u.id = NEW.sender_id;

  IF NOT COALESCE(v_pago, false) AND v_usadas > 6 THEN
    RAISE EXCEPTION 'LIMITE_ALERTAS' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contar_alerta_mes ON public.alerts;
CREATE TRIGGER trg_contar_alerta_mes
  BEFORE INSERT ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.contar_alerta_mes();

-- Lo que la app consulta al abrir: cuántas alertas manuales lleva este mes
CREATE OR REPLACE FUNCTION public.alertas_usadas_mes()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT usadas FROM public.alertas_mes
    WHERE user_id = auth.uid()
      AND mes = to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM')), 0)
$$;
REVOKE ALL ON FUNCTION public.alertas_usadas_mes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alertas_usadas_mes() TO authenticated;

-- La app necesita poder marcar como enviada su propia alerta programada (evita el bucle de alertas)
DROP POLICY IF EXISTS "Actualizar mis alertas programadas" ON public.scheduled_alerts;
CREATE POLICY "Actualizar mis alertas programadas" ON public.scheduled_alerts FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
