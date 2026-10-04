-- Contraseña temporal para alguien que olvidó la suya y te escribió (Términos de Uso, punto 3).
-- ANTES: confirma que el correo te llegó DESDE el mismo correo con el que esa persona se registró.
-- 1. Cambia los dos datos de abajo: la contraseña temporal (mínimo 6 caracteres) y el correo.
-- 2. Run. Debe salir UNA fila con el correo y la hora del cambio (si no sale ninguna, el correo está mal escrito).
-- 3. Respóndele a ese mismo correo con la contraseña temporal y pídele que entre a la app y la cambie
--    en Opciones → Cambiar contraseña.
UPDATE auth.users
   SET encrypted_password = extensions.crypt('Temporal-2026', extensions.gen_salt('bf', 10)),
       updated_at = now()
 WHERE lower(email) = lower('correo-de-la-persona@ejemplo.com')
RETURNING email, updated_at;
