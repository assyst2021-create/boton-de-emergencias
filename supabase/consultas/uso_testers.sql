-- Panel de uso de los testers (solo lectura: no cambia nada).
-- Muestra cuánto usa cada persona la app, sin teléfonos ni ubicaciones exactas.
SELECT
  u.username,
  a.email,
  u.plan,
  to_char(a.created_at AT TIME ZONE 'America/Bogota', 'DD-MM HH24:MI') AS registrado,
  to_char((SELECT MAX(s.updated_at) FROM auth.sessions s WHERE s.user_id = u.id)
          AT TIME ZONE 'America/Bogota', 'DD-MM HH24:MI') AS ultima_actividad,
  COALESCE(m.usadas, 0) AS alertas_este_mes,
  (SELECT COUNT(*) FROM public.family_links f
    WHERE f.user_id = u.id AND f.status = 'accepted') AS familiares,
  (SELECT COUNT(*) FROM public.family_links f
    WHERE f.linked_user_id = u.id AND f.status = 'pending') AS solicitudes_sin_responder,
  CASE WHEN u.fcm_token IS NOT NULL THEN '✅' ELSE '❌' END AS notificaciones,
  to_char((SELECT MAX(l.updated_at) FROM public.live_locations l WHERE l.user_id = u.id)
          AT TIME ZONE 'America/Bogota', 'DD-MM HH24:MI') AS ultima_vez_compartio_ubicacion
FROM public.users u
JOIN auth.users a ON a.id = u.id
LEFT JOIN public.alertas_mes m
  ON m.user_id = u.id AND m.mes = to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM')
ORDER BY (SELECT MAX(s.updated_at) FROM auth.sessions s WHERE s.user_id = u.id) DESC NULLS LAST;
