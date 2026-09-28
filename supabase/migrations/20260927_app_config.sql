-- Configuración que la app lee al abrir. version_minima = versionCode mínimo permitido:
-- si el celular tiene una versión menor, Google muestra la actualización OBLIGATORIA.
-- 0 = nunca obligar (solo aviso flexible).
CREATE TABLE IF NOT EXISTS public.app_config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leer configuracion" ON public.app_config;
CREATE POLICY "Leer configuracion" ON public.app_config FOR SELECT USING (true);

INSERT INTO public.app_config (clave, valor) VALUES ('version_minima', '0')
ON CONFLICT (clave) DO NOTHING;
