-- ============================================================
--  Diagnóstico: por qué no deja compartir la ubicación
--  Pegar en Supabase → SQL Editor → Run y mandarme el resultado.
-- ============================================================

-- 1. ¿Se ejecutó la migración 2?
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='users' AND column_name='alertas_usadas')  AS col_alertas_usadas,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='users' AND column_name='premium_hasta')   AS col_premium_hasta,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name='live_locations')                          AS tabla_live_locations,
  (SELECT COUNT(*) FROM pg_policies
     WHERE tablename='live_locations')                           AS politicas_live,
  (SELECT COUNT(*) FROM pg_proc
     WHERE proname='sumar_alerta_usada')                         AS funcion_contador;
-- Esperado: 1, 1, 1, 2, 1
-- Si algo sale 0, falta correr supabase-migracion-2.sql


-- 2. ¿Cómo quedaron los dos usuarios?
SELECT a.email,
       u.username,
       u.is_premium,
       u.premium_hasta,
       u.alertas_usadas
  FROM public.users u
  JOIN auth.users  a ON a.id = u.id
 ORDER BY a.created_at;
-- Esperado en tus dos cuentas: is_premium = true y premium_hasta vacío


-- 3. ¿Realtime está publicando la tabla?
SELECT COUNT(*) AS live_en_realtime
  FROM pg_publication_tables
 WHERE pubname='supabase_realtime' AND tablename='live_locations';
-- Esperado: 1. Si es 0, el mapa no recibiría los movimientos.
