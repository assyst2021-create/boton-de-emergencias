import { useState } from 'react'
import styles from './Disclaimer.module.css'
import aStyles from './AvisoLegal.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { LEGAL } from '../i18n/legalDocs'

const DOC_COLOR = '#2980b9'

function getDocsForLang(lang) {
  const L = LEGAL[lang] || LEGAL.es
  return [
    { id: 'privacidad', titulo: L.DOCS_META[0].titulo, sub: L.DOCS_META[0].sub, secciones: L.PRIVACIDAD },
    { id: 'terminos',   titulo: L.DOCS_META[1].titulo, sub: L.DOCS_META[1].sub, secciones: L.TERMINOS  },
    { id: 'contrato',   titulo: L.DOCS_META[2].titulo, sub: L.DOCS_META[2].sub, secciones: L.CONTRATO  },
    { id: 'aviso',      titulo: L.DOCS_META[3].titulo, sub: L.DOCS_META[3].sub, secciones: L.AVISO     },
  ]
}

function DocModal({ doc, cerrarLabel, onCerrar }) {
  return (
    <div className={aStyles.modal}>
      <div className={aStyles.modalScroll}>
        <div className={aStyles.modalHeader} style={{ background: DOC_COLOR }} />
        <div className={aStyles.modalBody}>
          <p className={aStyles.modalDocTitulo}>{doc.titulo}</p>
          {doc.secciones.map((s, i) => (
            <div key={i} className={aStyles.modalSeccion}>
              <p className={aStyles.modalSeccionTitulo}>{s.titulo}</p>
              <p className={aStyles.modalSeccionTexto} style={{ whiteSpace: 'pre-line' }}>{s.texto}</p>
            </div>
          ))}
        </div>
        <div className={aStyles.modalFooter}>
          <button className={aStyles.btnCerrar} style={{ background: DOC_COLOR }} onClick={onCerrar}>
            {cerrarLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AvisoLegal({ onAceptar, soloVer = false }) {
  const { t, lang } = useLanguage()
  const DOCS = getDocsForLang(lang)
  const allTrue = { privacidad: true, terminos: true, contrato: true, aviso: true }
  const [checks, setChecks] = useState(soloVer ? allTrue : { privacidad: false, terminos: false, contrato: false, aviso: false })
  const [docAbierto, setDocAbierto] = useState(null)

  function cerrarDoc() {
    if (docAbierto && !soloVer) {
      setChecks(prev => ({ ...prev, [docAbierto]: true }))
    }
    setDocAbierto(null)
  }

  const leidos = Object.values(checks).filter(Boolean).length
  const todosAceptados = leidos === 4
  const docActivo = DOCS.find(d => d.id === docAbierto)

  return (
    <div className={styles.wrap}>
      <div className={aStyles.outerScroll}>

        {/* Hero con logo */}
        <div className={aStyles.hero}>
          <img src="/logo-empresa.png" alt={t('appNombre')} className={aStyles.heroLogo} />
          <h1 className={aStyles.bienvenidaTitulo}>{t('bienvenidoA')}<br />{t('appNombre')}</h1>
          <p className={aStyles.bienvenidaSub}>{t('bienvenidoTagline')}</p>
        </div>

        {/* Caja informativa */}
        <div className={aStyles.bienvenidaCaja}>
          <p className={aStyles.bienvenidaTexto}>{t('bienvenidoAppDesc')}</p>

          <p className={aStyles.bienvenidaSubtitulo}>{t('bienvenidoPuedes')}</p>
          <ul className={aStyles.bienvenidaLista}>
            <li>{t('bienvenidoLi1')}</li>
            <li>{t('bienvenidoLi2')}</li>
            <li>{t('bienvenidoLi3')}</li>
            <li>{t('bienvenidoLi4')}</li>
            <li>{t('bienvenidoLi5')}</li>
          </ul>

          <p className={aStyles.bienvenidaSubtitulo}>{t('bienvenidoAntes')}</p>
          <ul className={aStyles.bienvenidaLista}>
            <li>{t('bienvenidoAnLi1')}</li>
            <li>{t('bienvenidoAnLi2')}</li>
            <li>{t('bienvenidoAnLi3')}</li>
            <li>{t('bienvenidoAnLi4')}</li>
          </ul>

          <p className={aStyles.bienvenidaAviso}>{t('bienvenidoAviso')}</p>
        </div>

        {/* Sección documentos */}
        <div className={aStyles.seccionDocs}>
          <p className={aStyles.instruccionTitulo}>{t('docsTitulo')}</p>
          <p className={aStyles.instruccionSub}>{t('docsInstruccion')}</p>

          <div className={aStyles.progreso}>
            <div className={aStyles.progresoBarra}>
              <div className={aStyles.progresoFill} style={{ width: `${(leidos / 4) * 100}%` }} />
            </div>
            <p className={aStyles.progresoTexto}>{leidos} {t('docsDeLeidos')}</p>
          </div>

          <div className={aStyles.lista}>
            {DOCS.map((doc) => {
              const listo = checks[doc.id]
              return (
                <button
                  key={doc.id}
                  className={`${aStyles.docCard} ${listo ? aStyles.docCardDone : ''}`}
                  style={{ borderLeftColor: listo ? '#2ecc71' : DOC_COLOR }}
                  onClick={() => setDocAbierto(doc.id)}
                >
                  <span
                    className={`${aStyles.circulo} ${listo ? aStyles.circuloDone : ''}`}
                    style={!listo ? { borderColor: DOC_COLOR } : {}}
                  >
                    {listo ? '✓' : ''}
                  </span>
                  <span className={aStyles.docInfo}>
                    <span className={aStyles.docNombre}>{doc.titulo}</span>
                    <span className={`${aStyles.docEstado} ${listo ? aStyles.docEstadoDone : ''}`}>
                      {listo ? t('docsCardLeido') : doc.sub}
                    </span>
                  </span>
                  <span className={aStyles.docArrow}>›</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Botón continuar */}
        <div className={aStyles.footerWrap}>
          {soloVer ? (
            <button className={aStyles.btnContinuar} onClick={onAceptar}>← {t('volver')}</button>
          ) : (
            <button
              className={todosAceptados ? aStyles.btnContinuar : aStyles.btnDeshabilitado}
              onClick={todosAceptados ? onAceptar : undefined}
              disabled={!todosAceptados}
            >
              {todosAceptados ? t('docsContinuar') : t('docsLeeTodos')}
            </button>
          )}
        </div>

      </div>

      {docActivo && (
        <DocModal
          doc={docActivo}
          cerrarLabel={t('docsCerrarMarcar')}
          onCerrar={cerrarDoc}
        />
      )}
    </div>
  )
}
