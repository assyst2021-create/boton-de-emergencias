-- Usuarios con plan Premium o Familiar (solo lectura: no cambia nada).
-- "origen" dice si lo pagó por Google Play o se lo regalamos desde aquí.
SELECT
  a.email,
  u.username,
  u.plan,
  CASE WHEN u.play_purchase_token IS NOT NULL THEN 'Compra Google Play' ELSE 'Regalo' END AS origen,
  CASE WHEN u.premium_hasta IS NULL THEN 'sin vencimiento'
       ELSE to_char(u.premium_hasta AT TIME ZONE 'America/Bogota', 'DD-MM-YYYY') END AS vence,
  CASE WHEN u.premium_hasta IS NULL OR u.premium_hasta > NOW() THEN '✅ Activo' ELSE '❌ Vencido' END AS estado
FROM public.users u
JOIN auth.users a ON a.id = u.id
WHERE u.plan IN ('premium', 'familiar') OR u.is_premium
ORDER BY estado, u.plan, a.email;
