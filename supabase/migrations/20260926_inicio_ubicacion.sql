-- Guarda la hora en que un familiar EMPEZÓ a compartir su ubicación,
-- para mostrar "Compartiendo de 4:30 PM a 6:30 PM" en la ficha.
-- La llena la base sola: la app y el servicio GPS nativo no cambian.

ALTER TABLE public.live_locations ADD COLUMN IF NOT EXISTS iniciado_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.marcar_inicio_ubicacion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.activo AND (TG_OP = 'INSERT' OR NOT OLD.activo OR OLD.iniciado_at IS NULL) THEN
    NEW.iniciado_at := NOW();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.iniciado_at := OLD.iniciado_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inicio_ubicacion ON public.live_locations;
CREATE TRIGGER trg_inicio_ubicacion
  BEFORE INSERT OR UPDATE ON public.live_locations
  FOR EACH ROW EXECUTE FUNCTION public.marcar_inicio_ubicacion();
