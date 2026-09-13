const VAPID_PUBLIC = 'BCI3dnwVQ3MoJAGxg3VcDHGkXQsB-3-RAVXOG8YRaFbSfpgrJ3QsiC6MzPnGW6ARqp86MobCsvjWw2mku6dL3LE'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

export async function suscribirPush(supabase, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  if (Notification.permission !== 'granted') return null

  try {
    const registro = await navigator.serviceWorker.ready
    // Cancelar suscripción vieja si existe (puede tener VAPID key diferente)
    const subVieja = await registro.pushManager.getSubscription()
    if (subVieja) await subVieja.unsubscribe()

    const sub = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, { onConflict: 'user_id,endpoint' })
    if (error) console.warn('[push] error guardando suscripción:', error)
    else console.log('[push] suscripción guardada OK')
    return sub
  } catch (e) {
    console.warn('[push] no se pudo suscribir:', e)
    return null
  }
}
