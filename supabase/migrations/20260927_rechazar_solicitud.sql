-- Quien RECIBE una solicitud también puede borrarla (rechazar) o borrar el vínculo (desvincular).
-- Antes solo podía borrar quien la envió, y "Rechazar" no hacía nada.
DROP POLICY IF EXISTS "Borrar mis links" ON public.family_links;
CREATE POLICY "Borrar mis links" ON public.family_links FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = linked_user_id);
