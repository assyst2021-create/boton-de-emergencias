-- ============================================================
--  Botón de Emergencias — Migración 2
--  Plan gratuito con límite + ubicación en tiempo real
--
--  Cómo ejecutarlo:
--    Supabase → SQL Editor → pegar todo → Run
--  Es seguro repetirlo: no borra datos ni duplica nada.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Contador de alertas del plan gratuito
--    Las alertas se autoborran a las 24 h, así que no sirve
--    contarlas de la tabla alerts: hace falta un contador propio.
-- ------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS alertas_usadas INTEGER NOT NULL DEFAULT 0;

-- Marca desde cuándo es premium, para saber cuándo renovar.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS premium_hasta TIMESTAMPTZ;


-- ------------------------------------------------------------
-- 2. Ubicación en tiempo real
--    Una sola fila por persona, que se va sobrescribiendo.
--    Así la tabla no crece aunque se actualice cada segundo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.live_locations (
  user_id     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  precision_m DOUBLE PRECISION,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_live_expires ON public.live_locations(expires_at);

ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 3. Permisos de la ubicación en tiempo real
--    Cada quien escribe la suya. La ven solo los familiares a
--    quienes esa persona les envía alertas, y solo mientras
--    esté activa y sin vencer.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Escribir mi ubicacion" ON public.live_locations;
CREATE POLICY "Escribir mi ubicacion" ON public.live_locations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ver ubicacion de quien me eligio" ON public.live_locations;
CREATE POLICY "Ver ubicacion de quien me eligio" ON public.live_locations
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      activo = TRUE
      AND expires_at > NOW()
      AND EXISTS (
        SELECT 1 FROM public.family_links
        WHERE user_id = live_locations.user_id
          AND linked_user_id = auth.uid()
          AND status = 'accepted'
      )
    )
  );


-- ------------------------------------------------------------
-- 4. Realtime: sin esto el mapa no recibe los movimientos
-- ------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Necesario para que los UPDATE lleguen completos al que escucha.
ALTER TABLE public.live_locations REPLICA IDENTITY FULL;


-- ------------------------------------------------------------
-- 5. Limpieza de ubicaciones vencidas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.limpiar_ubicaciones_vencidas()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.live_locations WHERE expires_at < NOW();
$$;


-- ------------------------------------------------------------
-- 6. Sumar una alerta al contador del plan gratuito
--    Se hace en el servidor para que dos alertas seguidas no
--    se pisen entre sí, y para que nadie pueda falsear el conteo
--    desde el teléfono.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sumar_alerta_usada()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total INTEGER;
BEGIN
  UPDATE public.users
     SET alertas_usadas = alertas_usadas + 1
   WHERE id = auth.uid()
  RETURNING alertas_usadas INTO total;
  RETURN total;
END $$;

REVOKE ALL ON FUNCTION public.sumar_alerta_usada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sumar_alerta_usada() TO authenticated;


-- ------------------------------------------------------------
-- 7. Comprobación
-- ------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'alertas_usadas') AS col_alertas_usadas,
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'live_locations') AS tabla_live_locations,
  (SELECT COUNT(*) FROM pg_policies
    WHERE tablename = 'live_locations') AS politicas_live;
-- Debe devolver: 1, 1, 2
