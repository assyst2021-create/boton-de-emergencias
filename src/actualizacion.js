import { registerPlugin } from '@capacitor/core'

// Complemento nativo @capawesome/capacitor-app-update (instalado en BotonAPK)
const AppUpdate = registerPlugin('AppUpdate')
const EN_ANDROID = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

const DISPONIBLE = 2        // AppUpdateAvailability.UPDATE_AVAILABLE
const EN_PROGRESO = 3       // AppUpdateAvailability.UPDATE_IN_PROGRESS (una obligatoria que quedó a medias)
const DESCARGADA = 11       // FlexibleUpdateInstallStatus.DOWNLOADED

let revisando = false
let escuchando = false

/** Versión mínima que se exige; se cambia en Supabase (tabla app_config) sin sacar otro APK. */
async function versionMinima(supabase) {
  try {
    const { data } = await supabase.from('app_config').select('valor').eq('clave', 'version_minima').maybeSingle()
    return parseInt(data?.valor || '0', 10) || 0
  } catch (_) { return 0 }
}

/**
 * Pregunta a Google Play si hay una versión más nueva.
 * - Si la instalada es menor que la versión mínima: pantalla obligatoria de Google.
 * - Si no: descarga flexible, y al terminar llama a alListo() para ofrecer "Reiniciar".
 * Solo funciona con la app instalada desde Google Play.
 */
export async function revisarActualizacion(supabase, alListo) {
  if (!EN_ANDROID || revisando) return
  revisando = true
  try {
    const info = await AppUpdate.getAppUpdateInfo()
    if (!info) return

    if (info.updateAvailability === EN_PROGRESO) {
      await AppUpdate.performImmediateUpdate().catch(() => {})
      return
    }
    if (info.installStatus === DESCARGADA) { alListo?.(); return }
    if (info.updateAvailability !== DISPONIBLE) return

    const actual = parseInt(info.currentVersionCode || '0', 10)
    const minima = await versionMinima(supabase)

    if (actual < minima && info.immediateUpdateAllowed) {
      await AppUpdate.performImmediateUpdate().catch(() => {})
      return
    }
    if (info.flexibleUpdateAllowed) {
      if (!escuchando) {
        escuchando = true
        AppUpdate.addListener('onFlexibleUpdateStateChange', estado => {
          if (estado?.installStatus === DESCARGADA) alListo?.()
        })
      }
      await AppUpdate.startFlexibleUpdate().catch(() => {})
    }
  } catch (_) {
    // Sin Play Store (APK instalado a mano) o sin internet: no se hace nada
  } finally {
    revisando = false
  }
}

/** Instala la versión ya descargada y reinicia la app. */
export function instalarActualizacion() {
  return AppUpdate.completeFlexibleUpdate().catch(() => {})
}
