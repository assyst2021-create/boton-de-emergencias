-- Revisión de seguridad (versión 95, punto 11). SOLO MIRA: no cambia nada. Se puede correr cuando sea.
-- 1 tabla: si tiene reglas por fila (RLS) y qué pueden hacer quien no tiene sesión (anon) y quien sí.
-- 2 regla: cada regla (policy) de cada tabla: para qué acción, para quién y qué revisa.
-- 3 función: funciones de la base; las "con poderes de dueño" saltan las reglas: no deben poder
--   llamarse sin sesión salvo las que están hechas para eso, y deben fijar su search_path.
-- 4 disparador auth: lo que corre cuando alguien se registra.
-- 5 vista / 6 archivos / 7 profiles (tabla vieja que la app no usa).
SELECT seccion, objeto, detalle FROM (
  SELECT '1 tabla' AS seccion, c.relname::text AS objeto,
    CASE WHEN c.relrowsecurity THEN 'RLS sí' ELSE 'RLS NO (mal)' END
    || ' · sin sesión: ' || coalesce(nullif(concat_ws(',',
         CASE WHEN has_table_privilege('anon', c.oid, 'SELECT') THEN 'leer' END,
         CASE WHEN has_table_privilege('anon', c.oid, 'INSERT') THEN 'crear' END,
         CASE WHEN has_table_privilege('anon', c.oid, 'UPDATE') THEN 'cambiar' END,
         CASE WHEN has_table_privilege('anon', c.oid, 'DELETE') THEN 'borrar' END), ''), 'nada')
    || ' · con sesión: ' || coalesce(nullif(concat_ws(',',
         CASE WHEN has_table_privilege('authenticated', c.oid, 'SELECT') THEN 'leer' END,
         CASE WHEN has_table_privilege('authenticated', c.oid, 'INSERT') THEN 'crear' END,
         CASE WHEN has_table_privilege('authenticated', c.oid, 'UPDATE') THEN 'cambiar' END,
         CASE WHEN has_table_privilege('authenticated', c.oid, 'DELETE') THEN 'borrar' END), ''), 'nada')
    || ' · reglas: ' || (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
    AS detalle
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')

  UNION ALL
  SELECT '2 regla', p.tablename || ' · ' || p.policyname,
    p.cmd || ' · ' || array_to_string(p.roles, ',')
    || CASE WHEN p.permissive = 'PERMISSIVE' THEN '' ELSE ' · RESTRICTIVA' END
    || ' · usa: ' || left(regexp_replace(coalesce(p.qual, '—'), '\s+', ' ', 'g'), 140)
    || coalesce(' · revisa: ' || left(regexp_replace(p.with_check, '\s+', ' ', 'g'), 100), '')
  FROM pg_policies p
  WHERE p.schemaname = 'public'

  UNION ALL
  SELECT '3 función', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    CASE WHEN p.prosecdef THEN 'con poderes de dueño' ELSE 'normal' END
    || ' · sin sesión: ' || CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'SÍ' ELSE 'no' END
    || ' · con sesión: ' || CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'sí' ELSE 'no' END
    || CASE WHEN p.prosecdef AND coalesce(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'
            THEN ' · SIN search_path' ELSE '' END
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'

  UNION ALL
  SELECT '4 disparador auth', t.tgname::text, 'función ' || p.proname
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal

  UNION ALL
  SELECT '5 vista', c.relname::text,
    coalesce(array_to_string(c.reloptions, ','), 'sin opciones')
    || ' · sin sesión lee: ' || CASE WHEN has_table_privilege('anon', c.oid, 'SELECT') THEN 'SÍ' ELSE 'no' END
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')

  UNION ALL
  SELECT '6 archivos', w.nombre, w.tipo
  FROM xmltable('/table/row' PASSING query_to_xml(
         CASE WHEN to_regclass('storage.buckets') IS NULL
              THEN 'SELECT NULL::text AS nombre, NULL::text AS tipo WHERE false'
              ELSE 'SELECT name::text AS nombre, CASE WHEN public THEN ''PÚBLICA'' ELSE ''privada'' END AS tipo FROM storage.buckets' END,
         false, false, '')
       COLUMNS nombre text, tipo text) w

  UNION ALL
  SELECT '7 profiles', 'filas y columnas',
    CASE WHEN to_regclass('public.profiles') IS NULL THEN 'no existe'
    ELSE (SELECT (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM public.profiles', false, true, '')))[1]::text)
         || ' filas · ' || (SELECT string_agg(column_name::text, ', ' ORDER BY ordinal_position)
                            FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles') END
  UNION ALL
  SELECT '7 profiles', 'la mencionan',
    coalesce((SELECT string_agg(DISTINCT n.nspname || '.' || p.proname, ', ')
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE p.prosrc ILIKE '%profiles%' AND n.nspname IN ('public', 'auth')), 'ninguna función')
) revision
ORDER BY 1, 2;
