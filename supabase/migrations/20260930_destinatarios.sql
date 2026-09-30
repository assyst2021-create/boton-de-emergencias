-- ============================================================
-- VERSIÓN 84 (30-09-2026): elegir a quién le llega la alerta y con quién se comparte
-- la ubicación en vivo. NULL = todo el grupo familiar (como hasta ahora), así que las
-- alertas y ubicaciones que ya existen, y las apps viejas, siguen igual.
-- ============================================================

-- 1. Columnas nuevas
ALTER TABLE public.alerts           ADD COLUMN IF NOT EXISTS destinatarios uuid[];
ALTER TABLE public.scheduled_alerts ADD COLUMN IF NOT EXISTS destinatarios uuid[];
ALTER TABLE public.live_locations   ADD COLUMN IF NOT EXISTS compartir_con uuid[];

-- 2. Una alerta solo la ve quien la envió o quien fue elegido.
--    RESTRICTIVE: se suma a las reglas que ya existen (no las reemplaza).
DROP POLICY IF EXISTS "Alertas solo para destinatarios" ON public.alerts;
CREATE POLICY "Alertas solo para destinatarios" ON public.alerts
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR destinatarios IS NULL OR auth.uid() = ANY (destinatarios));

-- 3. La ubicación en vivo solo la ve quien la comparte o quien fue elegido.
DROP POLICY IF EXISTS "Ubicacion solo para elegidos" ON public.live_locations;
CREATE POLICY "Ubicacion solo para elegidos" ON public.live_locations
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR compartir_con IS NULL OR auth.uid() = ANY (compartir_con));

-- 4. Comprobación: deben salir las 3 columnas y las 2 reglas
SELECT 'columna' AS tipo, table_name || '.' || column_name AS nombre
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (('alerts','destinatarios'), ('scheduled_alerts','destinatarios'), ('live_locations','compartir_con'))
UNION ALL
SELECT 'regla', tablename || ': ' || policyname
FROM pg_policies
WHERE policyname IN ('Alertas solo para destinatarios', 'Ubicacion solo para elegidos');
