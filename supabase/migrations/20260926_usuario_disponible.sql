-- Responde solo true/false: permite verificar un usuario en el registro
-- (sin sesión iniciada) sin exponer datos de la tabla users.
CREATE OR REPLACE FUNCTION public.usuario_disponible(nombre TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(username) = lower(trim(both '@' from trim(nombre)))
  )
$$;

REVOKE ALL ON FUNCTION public.usuario_disponible(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_disponible(TEXT) TO anon, authenticated;
