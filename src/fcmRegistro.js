/**
 * Registra el celular en Firebase (FCM) y guarda el token en users.fcm_token.
 * La Edge Function enviar-notificacion-fcm usa ese token para avisar a la
 * familia aunque la app esté cerrada.
 */
const EN_CAPACITOR = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
const CANAL = 'alertas_v3'

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
            channelId: CANAL,
            sound: 'default',
            smallIcon: 'ic_stat_notification',
            iconColor: '#e8302a',
            schedule: { at: new Date(Date.now() + 100) },
          }],
        }).catch(() => {})
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
