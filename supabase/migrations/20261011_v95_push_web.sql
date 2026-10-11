-- Versión 95, punto 3: notificaciones de la página web (Web Push)
--  a) SEGURIDAD: la regla "push_sub_service" (SELECT para TODOS, sin sesión) dejaba leer las
--     suscripciones de notificaciones de la página de todas las personas (comprobado el 11-10: 118
--     filas visibles con la llave pública). La función del servidor usa service_role, que no
--     necesita reglas: se quita. Cada persona sigue viendo y guardando la suya ("push_sub_own").
--  b) Revisión (solo mira): qué disparadores tiene la tabla de alertas y a qué función llaman.
-- Se puede correr varias veces sin problema. No toca las alertas ni las notificaciones de la app.

DROP POLICY IF EXISTS "push_sub_service" ON public.push_subscriptions;

-- ---------- Revisión ----------
SELECT t.tgname AS disparador,
       CASE t.tgenabled WHEN 'D' THEN 'apagado' ELSE 'encendido' END AS estado,
       CASE WHEN t.tgtype & 4 = 4 THEN 'al crear' ELSE '' END
         || CASE WHEN t.tgtype & 16 = 16 THEN ' al cambiar' ELSE '' END AS cuando,
       coalesce(substring(encode(t.tgargs, 'escape') from 'functions/v1/([a-z0-9_-]+)'),
                substring(p.prosrc from 'functions/v1/([a-z0-9_-]+)'),
                n.nspname || '.' || p.proname) AS llama_a
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE t.tgrelid = 'public.alerts'::regclass AND NOT t.tgisinternal
UNION ALL
SELECT '(regla) push_sub_service', CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_sub_service') THEN 'SIGUE (mal)' ELSE 'quitada (bien)' END, '', ''
ORDER BY 1;
