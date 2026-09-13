-- Tabla para guardar suscripciones Web Push de cada usuario
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Solo el propio usuario puede ver/modificar su suscripción
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_sub_own" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- El service role (Edge Function) puede leer todas para enviar notificaciones
CREATE POLICY "push_sub_service" ON push_subscriptions
  FOR SELECT USING (true);
