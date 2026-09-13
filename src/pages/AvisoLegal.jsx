import { useState } from 'react'
import styles from './Disclaimer.module.css'
import pStyles from './Privacidad.module.css'

const PRIVACIDAD = [
  { titulo: '1. INTRODUCCIÓN', texto: 'La presente Política de Privacidad establece las condiciones bajo las cuales ASSYST recopila, utiliza, almacena y protege la información personal de los usuarios de Botón de Emergencia, aplicación creada y desarrollada por ASSYST bajo la marca SST Hecho Fácil. Su finalidad es informar de manera clara y transparente qué información se solicita, para qué se utiliza y cuáles son las opciones disponibles para el usuario.' },
  { titulo: '2. RESPONSABLE DEL TRATAMIENTO Y CONTACTO', texto: 'ASSYST es el responsable de la aplicación y de la gestión de la información personal que los usuarios proporcionan directamente mediante el registro y uso de sus funcionalidades.\n\nPara consultas relacionadas con privacidad, tratamiento de datos, actualización de información o solicitudes de eliminación de la cuenta:\n\nCorreo electrónico: assyst2021@ssthechofacil.com' },
  { titulo: '3. INFORMACIÓN QUE RECOPILAMOS', texto: 'Al registrarse y utilizar la aplicación, podemos recopilar:\n\n🔹 Nombre completo.\n🔹 Nombre de usuario.\n🔹 Correo electrónico.\n🔹 Número de teléfono.\n🔹 Información necesaria para gestionar y mantener la cuenta.\n🔹 Ubicación GPS, únicamente cuando el usuario activa voluntariamente una función de alerta.\n\nASSYST no recopila la ubicación GPS de manera permanente.' },
  { titulo: '4. CÓMO UTILIZAMOS LA INFORMACIÓN', texto: '🔹 Crear, identificar y administrar la cuenta del usuario.\n🔹 Permitir el acceso y uso de las funcionalidades de la aplicación.\n🔹 Facilitar el inicio de sesión y la recuperación de la contraseña.\n🔹 Facilitar el contacto entre el usuario y los familiares vinculados.\n🔹 Enviar la ubicación GPS a los familiares vinculados cuando el usuario activa una alerta.\n🔹 Mantener la seguridad, integridad y correcto funcionamiento de la aplicación.\n🔹 Cumplir las obligaciones legales aplicables.' },
  { titulo: '5. UBICACIÓN GPS Y FUNCIONES DE ALERTA', texto: 'La aplicación puede utilizar la ubicación GPS exclusivamente para apoyar sus funciones de alerta, cuando el usuario presiona voluntariamente el botón correspondiente.\n\nLa ubicación GPS no será utilizada como mecanismo de vigilancia, rastreo, monitoreo permanente ni para fines relacionados con relaciones sentimentales, infidelidades, celos o conflictos de pareja.\n\nRESPONSABILIDAD: El uso de la ubicación es responsabilidad del usuario. ASSYST no se hace responsable por el uso indebido de la información de ubicación.' },
  { titulo: '6. COMPARTICIÓN Y ACCESO A LOS DATOS', texto: 'ASSYST no vende los datos personales de los usuarios. Cuando se activa una alerta, la ubicación podrá ser puesta a disposición de los familiares o contactos que el propio usuario haya vinculado dentro de la aplicación.' },
  { titulo: '7. ALMACENAMIENTO Y SEGURIDAD', texto: 'Los datos se almacenan en Supabase con:\n\n🔹 Cifrado en tránsito mediante HTTPS.\n🔹 Row Level Security (RLS) para que cada usuario solo acceda a su propia información.\n\nNingún sistema tecnológico puede garantizar un riesgo absolutamente nulo frente a accesos no autorizados.' },
  { titulo: '8. CONSERVACIÓN DE LA INFORMACIÓN', texto: 'La información personal se conservará mientras sea necesaria para mantener la cuenta y prestar las funcionalidades de la aplicación, así como para atender obligaciones legales.' },
  { titulo: '9. DERECHOS DEL USUARIO', texto: '🔹 Conocer qué información personal es objeto de tratamiento.\n🔹 Solicitar la actualización o corrección de información incorrecta.\n🔹 Solicitar la eliminación de su cuenta y datos personales.\n🔹 Presentar consultas o reclamaciones relacionadas con el tratamiento de sus datos.' },
  { titulo: '10. ELIMINACIÓN O ACTUALIZACIÓN DE DATOS', texto: 'El usuario podrá solicitar la eliminación de su cuenta escribiendo a assyst2021@ssthechofacil.com. La solicitud se gestionará en un plazo máximo de quince (15) días hábiles.' },
  { titulo: '11. DATOS DE MENORES DE EDAD', texto: 'La aplicación no está diseñada para solicitar deliberadamente información personal de menores de edad sin las autorizaciones exigidas por la normativa aplicable.' },
  { titulo: '12. MODIFICACIONES DE LA POLÍTICA', texto: 'ASSYST podrá actualizar esta Política cuando sea necesario. Se recomienda a los usuarios revisarla periódicamente.\n\nÚltima actualización: 10 de septiembre de 2026' },
]

const TERMINOS = [
  { titulo: '1. DEFINICIONES', texto: 'a) «Usuario»: persona que se registra, accede o utiliza Botón de Emergencia.\nb) «Aplicación»: Botón de Emergencia, sus funcionalidades, actualizaciones y componentes relacionados.\nc) «Contactos vinculados»: familiares o personas que el usuario incorpora y autoriza dentro de la aplicación.\nd) «Alerta de emergencia»: activación voluntaria realizada por el usuario mediante la funcionalidad correspondiente.\ne) «Ubicación»: información de localización GPS obtenida cuando el usuario activa voluntariamente una alerta.' },
  { titulo: '2. ACEPTACIÓN DE LOS TÉRMINOS', texto: 'El acceso y uso de Botón de Emergencia implica la aceptación de estos Términos y de la Política de Privacidad. Si el usuario no está de acuerdo, deberá abstenerse de utilizar la aplicación.' },
  { titulo: '3. REGISTRO Y CUENTA', texto: 'La cuenta es de uso personal. El usuario se compromete a suministrar información verdadera y a proteger sus credenciales de acceso.' },
  { titulo: '4. RESPONSABILIDAD DEL USUARIO', texto: 'El usuario es el único responsable del uso que realice de la aplicación. Cualquier utilización indebida —incluyendo vigilancia, rastreo, acoso o uso de la ubicación con fines distintos a una emergencia— será responsabilidad exclusiva del usuario.' },
  { titulo: '5. FINALIDAD DE LA ALERTA', texto: 'La alerta debe activarse únicamente cuando exista una situación real que justifique su uso. El usuario debe evitar activaciones falsas, fraudulentas o abusivas.' },
  { titulo: '6. NO SUSTITUCIÓN DE SERVICIOS OFICIALES', texto: 'Botón de Emergencia no sustituye los servicios oficiales de emergencia.\n\nEn Colombia, ante una emergencia contacte:\n🔹 123 — Número Único de Emergencias\n🔹 119 — Bomberos\n🔹 132 — Cruz Roja\n\nLa aplicación es únicamente un mecanismo tecnológico complementario.' },
  { titulo: '7. CONECTIVIDAD Y FUNCIONAMIENTO', texto: 'En zonas sin cobertura, con señal GPS insuficiente, batería agotada o permisos restringidos, una alerta puede no enviarse o no mostrar correctamente la ubicación. ASSYST no garantiza la transmisión inmediata en todas las circunstancias.' },
  { titulo: '8. CONDUCTAS PROHIBIDAS', texto: 'El usuario no podrá utilizar la aplicación para:\n\na) Vigilar, rastrear o controlar indebidamente a otra persona.\nb) Usar la ubicación para fines sentimentales, celos o investigación personal ajena a una emergencia.\nc) Acosar, amenazar o causar perjuicios a otras personas.\nd) Realizar activaciones falsas o fraudulentas.\ne) Suplantar la identidad de otra persona.\nf) Intentar vulnerar componentes técnicos de la aplicación.\ng) Utilizar la aplicación para actividades ilícitas.' },
  { titulo: '9. PROPIEDAD INTELECTUAL', texto: 'La aplicación, su diseño, textos, software, marcas y logotipos pertenecen a ASSYST. El usuario recibe únicamente una autorización limitada para utilizar el servicio conforme a estos Términos.' },
  { titulo: '10. LIMITACIÓN DEL SERVICIO', texto: 'La activación de una alerta no garantiza que los contactos, autoridades u otras personas respondan en un tiempo determinado ni que se produzca una intervención efectiva. En situaciones de riesgo, el usuario debe utilizar también los medios oficiales disponibles.' },
  { titulo: '11. MODIFICACIONES DE LOS TÉRMINOS', texto: 'ASSYST podrá modificar estos Términos cuando sea necesario. El uso continuado de la aplicación tras los cambios podrá considerarse aceptación de los Términos actualizados.\n\nÚltima actualización: 10 de septiembre de 2026' },
  { titulo: '12. LEGISLACIÓN APLICABLE Y CONTACTO', texto: 'Estos Términos se rigen por la legislación colombiana.\n\nASSYST · Botón de Emergencia\nassyst2021@ssthechofacil.com' },
]

export default function AvisoLegal({ onAceptar }) {
  const [llegóAlFinal, setLlegóAlFinal] = useState(false)
  const [checkPriv, setCheckPriv] = useState(false)
  const [checkTerm, setCheckTerm] = useState(false)

  function alHacerScroll(e) {
    if (llegóAlFinal) return
    const el = e.target
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 60) {
      setLlegóAlFinal(true)
    }
  }

  const puedeAceptar = checkPriv && checkTerm

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll} onScroll={alHacerScroll}>
        <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
        <div className={styles.emoji}>📋</div>
        <h1 className={styles.titulo}>Documentos Legales</h1>
        <p className={styles.subtitulo}>ASSYST · Botón de Emergencia</p>

        <div className={pStyles.metaBox}>
          <p className={pStyles.metaFila}><strong>Responsable:</strong> ASSYST</p>
          <p className={pStyles.metaFila}><strong>Contacto:</strong> assyst2021@ssthechofacil.com</p>
          <p className={pStyles.metaFila}><strong>Última actualización:</strong> 10 de septiembre de 2026</p>
        </div>

        {/* ── POLÍTICA DE PRIVACIDAD ── */}
        <div className={pStyles.docBloque}>
          <div className={pStyles.docHeader}>
            <span className={pStyles.docIcon}>🔒</span>
            <div>
              <p className={pStyles.docTitulo}>Política de Privacidad</p>
              <p className={pStyles.docSub}>Cómo recopilamos, usamos y protegemos tu información</p>
            </div>
          </div>
        </div>

        <div className={styles.caja}>
          {PRIVACIDAD.map((s, i) => (
            <div key={i}>
              {i > 0 && <hr className={styles.divider} />}
              <div className={pStyles.seccion}>
                <p className={pStyles.titulo2}>{s.titulo}</p>
                <p className={styles.parrafo} style={{ whiteSpace: 'pre-line' }}>{s.texto}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── TÉRMINOS DE USO ── */}
        <div className={pStyles.docBloque} style={{ marginTop: 20 }}>
          <div className={pStyles.docHeader}>
            <span className={pStyles.docIcon}>⚠️</span>
            <div>
              <p className={pStyles.docTitulo}>Términos de Uso</p>
              <p className={pStyles.docSub}>Condiciones de acceso y uso de la aplicación</p>
            </div>
          </div>
        </div>

        <div className={styles.caja}>
          <p className={styles.parrafo}>
            Los presentes Términos regulan el acceso y utilización de la aplicación <strong>Botón de Emergencia</strong>, desarrollada por ASSYST. <strong>La aplicación no constituye un servicio oficial de atención de emergencias ni reemplaza a las autoridades o entidades de socorro.</strong>
          </p>
          {TERMINOS.map((s, i) => (
            <div key={i}>
              <hr className={styles.divider} />
              <div className={pStyles.seccion}>
                <p className={pStyles.titulo2}>{s.titulo}</p>
                <p className={styles.parrafo} style={{ whiteSpace: 'pre-line' }}>{s.texto}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── CHECKS Y BOTÓN ── */}
        <div className={pStyles.checksWrap}>
          {!llegóAlFinal ? (
            <p className={pStyles.avisoScroll}>📖 Lee los documentos completos para continuar</p>
          ) : (
            <>
              <label className={pStyles.checkLabel}>
                <input type="checkbox" checked={checkPriv} onChange={e => setCheckPriv(e.target.checked)} className={pStyles.checkbox} />
                <span>He leído y acepto la <strong>Política de Privacidad</strong></span>
              </label>
              <label className={pStyles.checkLabel}>
                <input type="checkbox" checked={checkTerm} onChange={e => setCheckTerm(e.target.checked)} className={pStyles.checkbox} />
                <span>He leído y acepto los <strong>Términos de Uso</strong></span>
              </label>
            </>
          )}
          <button
            className={puedeAceptar ? styles.btn : pStyles.btnDeshabilitado}
            onClick={puedeAceptar ? onAceptar : undefined}
            disabled={!puedeAceptar}
          >
            {puedeAceptar ? '✅ Continuar' : llegóAlFinal ? 'Marca ambas casillas para continuar' : '⬇ Desplázate para leer todo'}
          </button>
        </div>
      </div>
    </div>
  )
}
