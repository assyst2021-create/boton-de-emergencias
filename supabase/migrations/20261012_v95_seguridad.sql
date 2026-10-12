-- Versión 95, punto 11 (seguridad). Se puede correr varias veces sin problema.
--
-- a) Cada aviso sale una sola vez: enviar-notificacion-fcm y send-push-alert anotan aquí cada aviso
--    real (alerta, mapa, "está compartiendo", "se está moviendo", página web). Con la llave pública
--    cualquiera podía repetir la llamada e inundar a una familia con el mismo aviso; ahora no sale.
--    Solo el servidor la usa: sin reglas para la app y sin permisos para anon/authenticated.
CREATE TABLE IF NOT EXISTS public.avisos_enviados (
  clave      text PRIMARY KEY,
  enviado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.avisos_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_enviados FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.avisos_enviados TO service_role;

-- Se borran a los 3 días (las alertas duran 24 h)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'limpiar-avisos-enviados';
  PERFORM cron.schedule('limpiar-avisos-enviados', '41 4 * * *',
    $c$DELETE FROM public.avisos_enviados WHERE enviado_at < now() - interval '3 days'$c$);
END $$;

-- b) Funciones "con poderes de dueño" (SECURITY DEFINER): sin sesión NO se pueden llamar (lo marcaba
--    el Security Advisor). Supabase le da permiso a anon a toda función nueva, por eso no bastaba con
--    quitárselo a PUBLIC. Quedan abiertas solo las 3 hechas para eso:
--      usuario_disponible (al registrarse, antes de tener cuenta) y subir_ubicacion / apagar_ubicacion
--      (el servicio de ubicación del celular, con su llave propia).
--    Quien ya podía con sesión (authenticated) y el servidor (service_role) siguen pudiendo: se les
--    da el permiso directo antes de quitar el de PUBLIC. Los disparadores no cambian (el permiso no
--    se revisa cuando un disparador corre).
-- c) search_path fijo en las funciones que no lo tenían (protege de que alguien "cambie" a qué tabla
--    o función apuntan). Con extensions para las que usen alguna función de una extensión.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS firma
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.prosecdef
      AND p.proname NOT IN ('usuario_disponible', 'subir_ubicacion', 'apagar_ubicacion')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.firma);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.firma);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.firma);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS firma
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
      AND coalesce(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.firma);
  END LOOP;
END $$;

-- ---------- Revisión: las 6 primeras deben decir "bien"; la última es la tabla vieja profiles ----------
SELECT que, estado FROM (
  SELECT 1 AS n, 'tabla avisos_enviados' AS que,
         CASE WHEN to_regclass('public.avisos_enviados') IS NOT NULL
                   AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.avisos_enviados'::regclass)
              THEN 'existe y con reglas (bien)' ELSE 'NO' END AS estado
  UNION ALL
  SELECT 2, 'la app puede leer avisos_enviados',
         CASE WHEN has_table_privilege('anon', 'public.avisos_enviados', 'SELECT') OR has_table_privilege('authenticated', 'public.avisos_enviados', 'SELECT')
              THEN 'sí (mal)' ELSE 'no (bien)' END
  UNION ALL
  SELECT 3, 'limpieza diaria',
         CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar-avisos-enviados') THEN 'programada (bien)' ELSE 'NO' END
  UNION ALL
  SELECT 4, 'funciones con poderes de dueño que se llaman sin sesión',
         coalesce((SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p
                   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.prosecdef
                     AND has_function_privilege('anon', p.oid, 'EXECUTE')), 'ninguna')
         || ' (bien si son solo apagar_ubicacion, subir_ubicacion, usuario_disponible)'
  UNION ALL
  SELECT 5, 'la app (con sesión) sigue pudiendo usar sus funciones',
         CASE WHEN (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p
                    WHERE p.pronamespace = 'public'::regnamespace
                      AND p.proname IN ('alertas_usadas_mes', 'buscar_usuario', 'crear_llave_gps', 'disparar_mis_alertas_auto',
                                        'mis_solicitudes_enviadas', 'programar_alerta_auto', 'set_recuperacion', 'ubicar_alerta', 'usuario_disponible'))
              THEN 'sí (bien)' ELSE 'NO (mal)' END
  UNION ALL
  SELECT 6, 'funciones sin search_path fijo',
         coalesce((SELECT string_agg(p.proname, ', ') FROM pg_proc p
                   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
                     AND coalesce(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'
                     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')), 'ninguna (bien)')
  UNION ALL
  SELECT 7, 'tabla vieja profiles',
         CASE WHEN to_regclass('public.profiles') IS NULL THEN 'no existe'
         ELSE (SELECT (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM public.profiles', false, true, '')))[1]::text)
              || ' filas · columnas: ' || (SELECT string_agg(column_name::text, ', ' ORDER BY ordinal_position)
                                           FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles')
              || ' · la mencionan: ' || coalesce((SELECT string_agg(DISTINCT n.nspname || '.' || p.proname, ', ')
                                                  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                                  WHERE p.prosrc ILIKE '%profiles%' AND n.nspname IN ('public', 'auth')), 'nadie')
              || ' · disparadores al registrarse: ' || coalesce((SELECT string_agg(t.tgname || '→' || p.proname, ', ')
                                                                 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                                                                 WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal), 'ninguno')
         END
) revision
ORDER BY n;
