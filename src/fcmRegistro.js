/**
 * Registra el celular en Firebase (FCM) y guarda el token en users.fcm_token.
 * La Edge Function enviar-notificacion-fcm usa ese token para avisar a la
 * familia aunque la app esté cerrada.
 */
const EN_CAPACITOR = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
const CANAL = 'alertas_v3'

const RUTAS_AVISO = { historial: '/historial', ubicacion: '/ubicacion' }
/** Pide a la app que abra una pestaña. Si todavía no está lista, la ruta queda pendiente. */
function irA(ruta) {
  const destino = RUTAS_AVISO[ruta]
  if (!destino) return
  window.__rutaPendiente = destino
  window.dispatchEvent(new Event('irARuta'))
}

let escuchando = false
let usuarioActual = null
let tokenActual = null
let supa = null

async function guardarToken() {
  if (supa && usuarioActual && tokenActual) {
    await supa.from('users').update({ fcm_token: tokenActual }).eq('id', usuarioActual)
  }
}

export async function registrarFCM(supabase, userId) {
  if (!EN_CAPACITOR || !userId) return
  const { PushNotifications, LocalNotifications } = window.Capacitor.Plugins
  if (!PushNotifications) return
  supa = supabase

  // Otra cuenta en el mismo celular: el token pasa a la cuenta nueva
  if (usuarioActual !== userId) {
    usuarioActual = userId
    if (tokenActual) guardarToken()
  }

  try {
    // Los oyentes se registran una sola vez: repetirlos duplicaba las notificaciones
    if (!escuchando) {
      escuchando = true
      await PushNotifications.addListener('registration', async ({ value }) => {
        if (!value) return
        tokenActual = value
        await guardarToken()
      })
      await PushNotifications.addListener('registrationError', err => {
        console.warn('[fcm] error de registro:', err)
      })
      // Con la app abierta Android no pinta la notificación FCM: se muestra como local, con sonido
      await PushNotifications.addListener('pushNotificationReceived', async n => {
        if (!LocalNotifications) return
        await LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Math.random() * 2147483647),
            title: n.title || '',
            body: n.body || '',
            // Se ve completa al desplegarla (estado, hora y ubicación)
            largeBody: n.body || '',
            channelId: CANAL,
            sound: 'default',
            smallIcon: 'ic_stat_notification',
            iconColor: '#e8302a',
            extra: { ruta: n.data?.ruta || '' },
            // Sin "schedule": se muestra al instante. Programada (aunque fuera en 0,1 s) usaba una alarma,
            // y sin el permiso de alarmas exactas (negado por defecto en Android 14) podía demorarse
          }],
        }).catch(() => {})
      })
      // Al tocar la notificación se abre donde está la información: la alerta en el Historial,
      // la ubicación en En vivo (también con la app cerrada: el aviso queda guardado)
      await PushNotifications.addListener('pushNotificationActionPerformed', a => {
        irA(a?.notification?.data?.ruta)
      })
      await LocalNotifications?.addListener?.('localNotificationActionPerformed', a => {
        irA(a?.notification?.extra?.ruta)
      })
    }

    let { receive } = await PushNotifications.checkPermissions()
    if (receive !== 'granted') ({ receive } = await PushNotifications.requestPermissions())
    if (receive !== 'granted') return

    await PushNotifications.register()
  } catch (e) {
    console.warn('[fcm] no se pudo registrar:', e)
  }
}

/** Al cerrar sesión: este celular deja de recibir las alertas de esa cuenta. */
export async function olvidarFCM(supabase, userId) {
  if (!userId) return
  try { await supabase.from('users').update({ fcm_token: null }).eq('id', userId) } catch (_) {}
  if (usuarioActual === userId) usuarioActual = null
}
