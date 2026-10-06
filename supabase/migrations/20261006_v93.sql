-- =====================================================================================
-- Versión 93 (APK 67 / AAB 27) — tus alertas y tu ubicación SOLO para quien está en TU lista
-- =====================================================================================
-- Un vínculo familiar son dos filas (A→B y B→A). Si quedó a medias (B tiene a A en su lista, pero
-- A no tiene a B: pasaba cuando la reparación de la versión 89 chocó con el límite del plan), B no
-- aparece en la lista de A, A no lo puede desmarcar y aun así B veía las alertas y la ubicación de A
-- (le pasó a Michael con una amiga). Desde ahora, para ver una alerta o una ubicación hay que estar
-- en la lista de quien la envía. La función de notificaciones hace lo mismo con los avisos.
-- No se borra ningún vínculo.

-- ¿Quien pregunta está en la lista de familiares de esa persona? (se lee sin las reglas de la tabla)
CREATE OR REPLACE FUNCTION public.me_tiene_en_su_lista(emisor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_links
     WHERE user_id = emisor AND linked_user_id = auth.uid() AND status = 'accepted'
  )
$$;
REVOKE ALL ON FUNCTION public.me_tiene_en_su_lista(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_tiene_en_su_lista(uuid) TO authenticated;

-- Alertas (Historial): las mías, o las de alguien que me tiene en su lista
DROP POLICY IF EXISTS "Alertas solo para mi lista" ON public.alerts;
CREATE POLICY "Alertas solo para mi lista" ON public.alerts
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR public.me_tiene_en_su_lista(sender_id));

-- Ubicación en vivo (mapa): la mía, o la de alguien que me tiene en su lista
DROP POLICY IF EXISTS "Ubicacion solo para mi lista" ON public.live_locations;
CREATE POLICY "Ubicacion solo para mi lista" ON public.live_locations
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.me_tiene_en_su_lista(user_id));

-- ---------- Revisión ----------
SELECT 'regla' AS revision, policyname::text AS resultado FROM pg_policies
 WHERE policyname IN ('Alertas solo para mi lista', 'Ubicacion solo para mi lista')
UNION ALL
SELECT 'vínculos a medias (ya no reciben nada del otro)', count(*)::text
  FROM public.family_links a
 WHERE a.status = 'accepted' AND NOT EXISTS (
   SELECT 1 FROM public.family_links b
    WHERE b.user_id = a.linked_user_id AND b.linked_user_id = a.user_id AND b.status = 'accepted');
