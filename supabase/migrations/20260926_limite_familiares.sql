-- Límite de familiares según el plan de CADA persona (gratis 1, familiar 5, premium 10).
-- Se aplica en la base de datos para que nadie lo salte, sin importar el plan del otro.

CREATE OR REPLACE FUNCTION public.limite_familiares(uid UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN u.plan = 'premium'
      OR (u.is_premium AND (u.premium_hasta IS NULL OR u.premium_hasta > NOW())) THEN 10
    WHEN u.plan = 'familiar' THEN 5
    ELSE 1
  END
  FROM public.users u WHERE u.id = uid
$$;

-- Personas distintas con vínculo aceptado, sin contar la pareja (a, b) que se está evaluando.
CREATE OR REPLACE FUNCTION public.contar_familiares(uid UUID, excluir_a UUID, excluir_b UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(DISTINCT otro)::INT FROM (
    SELECT CASE WHEN user_id = uid THEN linked_user_id ELSE user_id END AS otro
    FROM public.family_links
    WHERE status = 'accepted' AND (user_id = uid OR linked_user_id = uid)
  ) s
  WHERE otro NOT IN (excluir_a, excluir_b)
$$;

CREATE OR REPLACE FUNCTION public.validar_limite_familiares()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Enviar solicitud: el que envía debe tener cupo
  IF NEW.status = 'pending' AND TG_OP = 'INSERT' THEN
    IF public.contar_familiares(NEW.user_id, NEW.user_id, NEW.linked_user_id)
       >= public.limite_familiares(NEW.user_id) THEN
      RAISE EXCEPTION 'LIMITE_FAMILIARES' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Aceptar: AMBAS personas deben tener cupo según su propio plan
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    IF public.contar_familiares(NEW.user_id, NEW.user_id, NEW.linked_user_id)
       >= public.limite_familiares(NEW.user_id)
    OR public.contar_familiares(NEW.linked_user_id, NEW.user_id, NEW.linked_user_id)
       >= public.limite_familiares(NEW.linked_user_id) THEN
      RAISE EXCEPTION 'LIMITE_FAMILIARES' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limite_familiares ON public.family_links;
CREATE TRIGGER trg_limite_familiares
  BEFORE INSERT OR UPDATE ON public.family_links
  FOR EACH ROW EXECUTE FUNCTION public.validar_limite_familiares();
