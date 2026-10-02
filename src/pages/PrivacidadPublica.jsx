import { useState } from 'react'
import { LEGAL, RESPONSABLE } from '../i18n/legalDocs'

// Página pública /privacidad: la MISMA Política de Tratamiento de Datos que se acepta en la app
// (antes tenía una copia vieja que decía que la ubicación solo se usaba al presionar una alerta).
const ETIQUETAS = {
  es: { resp: 'Responsable', tel: 'Teléfono', correo: 'Correo' },
  en: { resp: 'Data controller', tel: 'Phone', correo: 'Email' },
  pt: { resp: 'Responsável', tel: 'Telefone', correo: 'E-mail' },
}

function idiomaInicial() {
  try {
    const guardado = localStorage.getItem('app_lang')
    if (guardado && LEGAL[guardado]) return guardado
  } catch (_) {}
  const delNavegador = (navigator.language || '').slice(0, 2).toLowerCase()
  return LEGAL[delNavegador] ? delNavegador : 'es'
}

export default function PrivacidadPublica() {
  const [lang, setLang] = useState(idiomaInicial)
  const L = LEGAL[lang]
  const e = ETIQUETAS[lang]
  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1a1a2e' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 64px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 12 }}>
          {['es', 'en', 'pt'].map(l => (
            <button key={l} onClick={() => setLang(l)} aria-pressed={l === lang}
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: l === lang ? '#1a1a2e' : '#fff', color: l === lang ? '#fff' : '#1a1a2e', fontWeight: 700, cursor: 'pointer' }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Botón de Emergencias" style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 16 }} />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px', color: '#1a1a2e', textWrap: 'balance' }}>{L.DOCS_META[0].titulo}</h1>
          <p style={{ margin: 0, color: '#555', fontSize: '0.95rem' }}>Botón de Emergencias</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 24, fontSize: '0.875rem', color: '#444', lineHeight: 1.7 }}>
          <div><strong>{e.resp}:</strong> {RESPONSABLE.nombre}</div>
          <div><strong>{e.correo}:</strong> {RESPONSABLE.correo}</div>
          <div><strong>{e.tel}:</strong> {RESPONSABLE.telefono}</div>
        </div>
        {L.PRIVACIDAD.map((s, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 10px', color: '#c0392b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.titulo}</h2>
            <p style={{ margin: 0, lineHeight: 1.75, fontSize: '0.925rem', color: '#333', whiteSpace: 'pre-line' }}>{s.texto}</p>
          </div>
        ))}
        <p style={{ textAlign: 'center', marginTop: 40, color: '#777', fontSize: '0.8rem' }}>
          {RESPONSABLE.nombre} · {RESPONSABLE.correo} · {RESPONSABLE.telefono}
        </p>
      </div>
    </div>
  )
}
