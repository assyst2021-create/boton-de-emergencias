-- ============================================================
-- BOTON DE EMERGENCIAS PARA SISMOS — Schema Supabase
-- Ejecutar en SQL Editor de tu proyecto Supabase
-- ============================================================

-- 1. Tabla de usuarios (complementa auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vínculos familiares
CREATE TABLE IF NOT EXISTS public.family_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  linked_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, linked_user_id)
);

-- 3. Alertas (auto-borrado a las 24 horas)
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status_type TEXT NOT NULL CHECK (status_type IN ('red','orange','green')),
  latitude FLOAT,
  longitude FLOAT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- 4. Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_alerts_sender ON public.alerts(sender_id);
CREATE INDEX IF NOT EXISTS idx_alerts_expires ON public.alerts(expires_at);
CREATE INDEX IF NOT EXISTS idx_links_user ON public.family_links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_linked ON public.family_links(linked_user_id);

-- 5. RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Políticas: usuarios
CREATE POLICY "Perfil propio" ON public.users FOR ALL USING (auth.uid() = id);
CREATE POLICY "Ver otros usuarios" ON public.users FOR SELECT USING (true);

-- Políticas: family_links
CREATE POLICY "Ver mis links" ON public.family_links FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = linked_user_id);
CREATE POLICY "Crear mis links" ON public.family_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Actualizar mis links" ON public.family_links FOR UPDATE
  USING (auth.uid() = linked_user_id);
CREATE POLICY "Borrar mis links" ON public.family_links FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas: alerts
CREATE POLICY "Insertar mis alertas" ON public.alerts FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Ver alertas de familiares" ON public.alerts FOR SELECT
  USING (
    auth.uid() = sender_id OR
    EXISTS (
      SELECT 1 FROM public.family_links
      WHERE user_id = auth.uid()
        AND linked_user_id = alerts.sender_id
        AND status = 'accepted'
    )
  );

-- 6. Cron job para borrar alertas vencidas (requiere pg_cron habilitado en Supabase)
-- Activar en: Dashboard → Database → Extensions → pg_cron
SELECT cron.schedule(
  'borrar-alertas-vencidas',
  '0 * * * *',
  $$DELETE FROM public.alerts WHERE expires_at < NOW();$$
);
