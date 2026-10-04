import { useLanguage } from '../i18n/LanguageContext'
import { RESPONSABLE } from '../i18n/legalMeta'

/**
 * "¿Olvidaste tu contraseña?": la app no manda correos automáticos para cambiarla (el correo gratuito
 * de Supabase solo llega a los miembros del proyecto y máximo 2 por hora). La persona le escribe al
 * responsable desde el correo con el que se registró, como dicen los Términos de Uso (punto 3).
 */
export default function AyudaClave({ email = '' }) {
  const { t } = useLanguage()
  const asunto = encodeURIComponent(t('claveOlvidoAsunto'))
  const cuerpo = encodeURIComponent(t('claveOlvidoCuerpo').replace('{email}', email.trim()))
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10,
      background: 'var(--card)', border: '1.5px solid var(--border)', fontSize: '0.85rem',
      lineHeight: 1.5, color: 'var(--text)', textAlign: 'left',
    }}>
      <span>{t('claveOlvidoAyuda').replace('{correo}', RESPONSABLE.correo)}</span>
      <a href={`mailto:${RESPONSABLE.correo}?subject=${asunto}&body=${cuerpo}`}
        style={{ fontWeight: 700, color: 'var(--enlace)', textDecoration: 'underline' }}>
        ✉️ {t('claveOlvidoBtn')}
      </a>
    </div>
  )
}
