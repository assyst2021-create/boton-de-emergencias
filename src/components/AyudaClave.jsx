import { useState, useEffect } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { RESPONSABLE } from '../i18n/legalMeta'
import { supabase } from '../supabase'
import { mensajeErrorClave } from '../clave'

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ESPERA_REENVIO_S = 60

/**
 * "¿No recuerdas tu contraseña?" (versión 95): dos caminos, en todos los lugares donde se pide.
 * 1. Un código de 6 números al correo con el que la persona se registró: crea una contraseña nueva
 *    sola, sin escribirle a nadie. Al confirmar el código, Supabase avisa PASSWORD_RECOVERY y la app
 *    abre "Crea tu nueva contraseña" (NuevaContrasena).
 * 2. Si ya no tiene acceso a ese correo: escribirle al responsable, como dicen los Términos (punto 3).
 * Pedir un código deja 24 h sin poder apagar Recuperar celular, cerrar sesión con Recuperar activo
 * ni eliminar la cuenta (clave.js, HORAS_BLOQUEO_CODIGO): con aviso24 se avisa antes de pedirlo.
 * No usa <form>: en Opciones va dentro del formulario de cada pantalla (Enter se maneja aquí).
 * fijo = con la sesión abierta el correo es el de la cuenta y no se cambia.
 */
export default function AyudaClave({ email = '', fijo = false, aviso24 = false }) {
  const { t } = useLanguage()
  const [escrito, setEscrito] = useState(email.trim())
  // Con la sesión abierta es siempre el de la cuenta (puede llegar después de abrir la ayuda)
  const correo = fijo ? email.trim() : escrito
  const [enviado, setEnviado] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [espera, setEspera] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // Cuenta regresiva para pedir otro código
  useEffect(() => {
    if (espera <= 0) return
    const id = setTimeout(() => setEspera(s => s - 1), 1000)
    return () => clearTimeout(id)
  }, [espera])

  async function enviarCodigo() {
    if (cargando || espera > 0) return
    const destino = correo.toLowerCase().trim()
    if (!CORREO_VALIDO.test(destino)) { setError(t('claveCodigoCorreoMal')); return }
    setCargando(true); setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(destino)
      .then(r => r, e => ({ error: e }))
    setCargando(false)
    if (err) {
      setError(mensajeErrorClave(err, t, 'claveCodigoErrorEnvio'))
      // Supabase pide esperar entre correos: igual se puede usar el código que ya llegó
      if (/rate|only request/i.test(`${err.code} ${err.message}`)) { setEnviado(true); setEspera(ESPERA_REENVIO_S) }
      return
    }
    if (!fijo) setEscrito(destino)
    setEnviado(true); setCodigo(''); setEspera(ESPERA_REENVIO_S)
  }

  async function confirmarCodigo() {
    if (cargando) return
    const token = codigo.replace(/\D/g, '')
    if (token.length < 6) { setError(t('claveCodigoFalta')); return }
    setCargando(true); setError('')
    const { error: err } = await supabase.auth.verifyOtp({ email: correo.toLowerCase().trim(), token, type: 'recovery' })
      .then(r => r, e => ({ error: e }))
    setCargando(false)
    if (!err) return  // La app abre "Crea tu nueva contraseña"
    const texto = `${err.code || ''} ${err.message || ''}`
    if (/fetch|network|failed to|timeout/i.test(texto)) setError(t('errorConexion'))
    else if (/rate limit|too many/i.test(texto)) setError(t('claveCodigoMuchos'))
    else setError(t('claveCodigoMal'))
  }

  // Enter dentro de un campo hace lo de su botón, no envía el formulario de la pantalla
  const alEnter = accion => e => { if (e.key === 'Enter') { e.preventDefault(); accion() } }

  const asunto = encodeURIComponent(t('claveOlvidoAsunto'))
  const cuerpo = encodeURIComponent(t('claveOlvidoCuerpo').replace('{email}', correo.trim()))
  const caja = {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10,
    background: 'var(--card)', border: '1.5px solid var(--border)', fontSize: '0.85rem',
    lineHeight: 1.5, color: 'var(--text)', textAlign: 'left',
  }
  const campo = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10,
    border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '1rem',
  }
  const boton = {
    padding: '11px 12px', borderRadius: 10, border: 'none', background: 'var(--rojo)', color: '#fff',
    fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', opacity: cargando ? 0.7 : 1,
  }
  const enlace = {
    background: 'none', border: 'none', padding: 0, color: 'var(--enlace)', fontWeight: 700,
    textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={caja}>
        <strong style={{ fontSize: '0.95rem' }}>📩 {t('claveCodigoTitulo')}</strong>
        {!enviado ? (
          <>
            <span>{t('claveCodigoDesc')}</span>
            {aviso24 && <span style={{ color: 'var(--text2)' }}>⚠️ {t('claveCodigoAviso24')}</span>}
            {fijo
              ? <span style={{ fontWeight: 700, wordBreak: 'break-all' }}>{correo}</span>
              : <input type="email" style={campo} placeholder={t('claveCodigoCorreoPh')} value={correo}
                  onChange={e => { setEscrito(e.target.value); setError('') }} onKeyDown={alEnter(enviarCodigo)}
                  autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} />}
            <button type="button" style={boton} disabled={cargando || (fijo && !correo)} onClick={enviarCodigo}>
              {cargando ? t('procesando') : `📩 ${t('claveCodigoEnviar')}`}
            </button>
          </>
        ) : (
          <>
            <span>{t('claveCodigoEnviado').replace('{email}', correo)}</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} style={{ ...campo, letterSpacing: 4, fontWeight: 700 }}
              placeholder={t('claveCodigoPh')} value={codigo} onKeyDown={alEnter(confirmarCodigo)}
              onChange={e => { setCodigo(e.target.value.replace(/\D/g, '')); setError('') }} />
            <button type="button" style={boton} disabled={cargando} onClick={confirmarCodigo}>
              {cargando ? t('procesando') : t('claveCodigoContinuar')}
            </button>
            <button type="button" style={{ ...enlace, opacity: espera > 0 ? 0.6 : 1 }} disabled={espera > 0 || cargando} onClick={enviarCodigo}>
              {espera > 0 ? t('claveCodigoReenviarEn').replace('{s}', String(espera)) : t('claveCodigoReenviar')}
            </button>
            {!fijo && (
              <button type="button" style={enlace} disabled={cargando} onClick={() => { setEnviado(false); setCodigo(''); setError('') }}>
                {t('claveCodigoOtroCorreo')}
              </button>
            )}
          </>
        )}
        {error && (
          <span role="alert" style={{ background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.35)', color: '#e74c3c', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </span>
        )}
      </div>

      <div style={caja}>
        <strong style={{ fontSize: '0.95rem' }}>✉️ {t('claveSinCorreoTitulo')}</strong>
        <span>{t('claveOlvidoAyuda').replace('{correo}', RESPONSABLE.correo)}</span>
        <a href={`mailto:${RESPONSABLE.correo}?subject=${asunto}&body=${cuerpo}`}
          style={{ fontWeight: 700, color: 'var(--enlace)', textDecoration: 'underline' }}>
          ✉️ {t('claveOlvidoBtn')}
        </a>
      </div>
    </div>
  )
}
