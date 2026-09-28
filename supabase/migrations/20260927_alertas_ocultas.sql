-- Alertas que cada usuario borró con la X de su historial.
-- Se guarda por persona: borrarla uno no la borra del historial de los demás familiares.
-- Cuando la alerta se autoborra a las 24 h, su registro aquí se va solo (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS public.alertas_ocultas (
  user_id  UUID NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, alert_id)
);
ALTER TABLE public.alertas_ocultas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mis alertas ocultas" ON public.alertas_ocultas;
CREATE POLICY "Mis alertas ocultas" ON public.alertas_ocultas FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Quien ENVIÓ una alerta puede borrarla por completo
DROP POLICY IF EXISTS "Borrar mis alertas" ON public.alerts;
CREATE POLICY "Borrar mis alertas" ON public.alerts FOR DELETE
  USING (auth.uid() = sender_id);
