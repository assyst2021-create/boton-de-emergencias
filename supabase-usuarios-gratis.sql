-- ============================================================
--  Botón de Emergencias — Acceso Premium de cortesía
--
--  Da acceso completo y sin vencimiento a usuarios concretos:
--  hasta 10 familiares, alertas ilimitadas y ubicación en vivo.
--
--  Requisito: haber ejecutado antes supabase-migracion-2.sql
--  (esa migración crea la columna premium_hasta).
--
--  Cómo ejecutarlo:
--    Supabase → SQL Editor → pegar todo → Run
--  Se puede repetir sin problema.
-- ============================================================


-- ------------------------------------------------------------
--  Para agregar o quitar personas, edita SOLO esta lista.
--  premium_hasta en NULL significa que no vence nunca.
-- ------------------------------------------------------------
UPDATE public.users AS u
   SET is_premium    = TRUE,
       premium_hasta = NULL,
       alertas_usadas = 0
  FROM auth.users AS a
 WHERE a.id = u.id
   AND lower(a.email) IN (
     'michael.199@live.com',
     'vanesa2501013@hotmail.com'
   );


-- ------------------------------------------------------------
--  Comprobación: deben salir las dos filas con premium = true
-- ------------------------------------------------------------
SELECT a.email,
       u.username,
       u.full_name,
       u.is_premium,
       u.premium_hasta,
       u.alertas_usadas
  FROM public.users AS u
  JOIN auth.users  AS a ON a.id = u.id
 WHERE lower(a.email) IN (
   'michael.199@live.com',
   'vanesa2501013@hotmail.com'
 );


-- ============================================================
--  Alternativa: si prefieres identificarlos por nombre de
--  usuario en vez de correo, usa esto y comenta lo de arriba.
-- ============================================================
-- UPDATE public.users
--    SET is_premium = TRUE, premium_hasta = NULL, alertas_usadas = 0
--  WHERE lower(username) IN ('michael1617', 'vanesa');


-- ============================================================
--  Para quitarle la cortesía a alguien:
-- ============================================================
-- UPDATE public.users AS u
--    SET is_premium = FALSE, premium_hasta = NULL
--   FROM auth.users AS a
--  WHERE a.id = u.id AND lower(a.email) = 'correo@ejemplo.com';
