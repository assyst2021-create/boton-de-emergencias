-- Versión 95, punto 11 (2.ª parte): las otras 6 tablas de la app vieja "Mis Finanzas" (Michael lo
-- autorizó el 12-10: "eso de Mis Finanzas hay que borrarlo"). Desde afuera no se podían leer (0 filas
-- con la llave pública), pero guardan datos personales que nadie usa (movimientos: 78 filas de dinero).
-- Ninguna la usa el Botón de Emergencias. Sin CASCADE y en un solo bloque: si algo dependiera de
-- ellas, no se borra nada. Se puede correr varias veces.
DO $$
BEGIN
  DROP TABLE IF EXISTS public.items_compras, public.metas, public.movimientos,
                       public.pagos_fijos, public.recordatorios_pago, public.tareas;
END $$;

-- ---------- Revisión ----------
-- Las cuentas y los usuarios del Botón de Emergencias siguen iguales; las 6 tablas borradas; y si
-- alguna función vieja todavía las menciona, aparece al final (no se borra nada más sin revisarla).
SELECT que, detalle FROM (
  SELECT 0 AS n, 'personas registradas (cuentas)' AS que, (SELECT count(*)::text FROM auth.users) || ' (antes 18)' AS detalle
  UNION ALL
  SELECT 0, 'usuarios del Botón de Emergencias', (SELECT count(*)::text FROM public.users) || ' (antes 17)'
  UNION ALL
  SELECT 1, 'tablas de Mis Finanzas que quedan',
         coalesce((SELECT string_agg(c.relname, ', ') FROM pg_class c
                   WHERE c.relnamespace = 'public'::regnamespace
                     AND c.relname IN ('items_compras', 'metas', 'movimientos', 'pagos_fijos', 'recordatorios_pago', 'tareas', 'profiles')),
                  'ninguna (bien)')
  UNION ALL
  SELECT 2, 'función vieja que las menciona: ' || p.proname,
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid) THEN 'la usa un disparador' ELSE 'nadie la usa' END
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosrc ~* '\m(items_compras|movimientos|pagos_fijos|recordatorios_pago)\M|public\.(metas|tareas)\M'
) r
ORDER BY n, que;
