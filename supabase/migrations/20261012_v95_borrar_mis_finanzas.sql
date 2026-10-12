-- Versión 95, punto 11 (seguridad y privacidad): se borra lo que quedó de la app vieja "Mis Finanzas",
-- que usó este mismo proyecto en julio. Michael lo autorizó el 12-10 ("eso ya no existe").
--  - public.profiles: 18 filas con correo, nombre y rol (datos personales duplicados que la app no usa).
--  - public.handle_new_user + disparador on_auth_user_created: copiaba a profiles a cada persona que se
--    registra. Primero se deja sin hacer nada (si no, al borrar la tabla el registro fallaría); si se
--    puede, se quita el disparador y la función.
-- Todo va en un solo bloque: si algo no se puede, NO se cambia nada. Se puede correr varias veces.
DO $$
DECLARE codigo text; quitado boolean := false;
BEGIN
  SELECT p.prosrc INTO codigo FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'handle_new_user';

  IF codigo IS NOT NULL THEN
    -- Solo si la función hace únicamente la copia a profiles (si hiciera algo más, no se toca)
    IF codigo !~* 'profiles' OR codigo ~* '(public\.users|\mupdate\s+(public\.)?\w+\s+set|delete\s+from|family|alerts)'
       OR (length(codigo) - length(replace(upper(codigo), 'INSERT', ''))) / 6 <> 1 THEN
      RAISE EXCEPTION 'handle_new_user hace algo más que copiar a profiles: no cambié nada';
    END IF;
    -- 1. Que deje de copiar (el registro sigue funcionando igual)
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
      LANGUAGE plpgsql SET search_path = public AS $b$ BEGIN RETURN NEW; END $b$
    $f$;
    -- 2. Quitar el disparador y la función (si Supabase no deja tocar auth.users, quedan sin hacer nada)
    BEGIN
      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
      quitado := true;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'El disparador queda, pero ya no hace nada';
    END;
    IF quitado AND NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                               WHERE p.proname = 'handle_new_user' AND p.pronamespace = 'public'::regnamespace) THEN
      DROP FUNCTION public.handle_new_user();
    END IF;
  END IF;

  -- 3. La tabla (sin CASCADE: si algo dependiera de ella, nada se borra)
  DROP TABLE IF EXISTS public.profiles;
END $$;

-- ---------- Revisión ----------
-- Las 2 primeras: las personas registradas en el Botón de Emergencias siguen todas (no se tocan).
-- Las 2 siguientes deben decir "bien". Después, cada tabla que la app NO usa (para revisar si es de
-- "Mis Finanzas"); si no sale ninguna, todo quedó limpio.
SELECT que, detalle FROM (
  SELECT 0 AS n, 'personas registradas (cuentas)' AS que, (SELECT count(*)::text FROM auth.users) || ' (antes 18)' AS detalle
  UNION ALL
  SELECT 0, 'usuarios del Botón de Emergencias', (SELECT count(*)::text FROM public.users) || ' (antes 17)'
  UNION ALL
  SELECT 1 AS n, 'tabla profiles' AS que,
         CASE WHEN to_regclass('public.profiles') IS NULL THEN 'borrada (bien)' ELSE 'SIGUE' END AS detalle
  UNION ALL
  SELECT 2, 'copia al registrarse',
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace)
              THEN 'quitada (bien)'
              WHEN (SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace) !~* 'profiles'
              THEN 'ya no hace nada (bien)'
              ELSE 'SIGUE COPIANDO' END
  UNION ALL
  SELECT 3, 'tabla que la app no usa: ' || c.relname,
         (SELECT (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text)
         || ' filas · columnas: ' || (SELECT string_agg(a.attname::text, ', ' ORDER BY a.attnum) FROM pg_attribute a
                                       WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
    AND c.relname NOT IN ('aceptaciones_legales', 'alertas_mes', 'alertas_ocultas', 'alerts', 'app_config',
                          'avisos_enviados', 'compras_pendientes', 'family_links', 'gps_llaves', 'live_locations',
                          'push_subscriptions', 'recuperacion_bloqueo', 'recuperacion_sesiones', 'scheduled_alerts',
                          'suscripciones_revision', 'testers_regalo', 'users')
) r
ORDER BY n, que;
