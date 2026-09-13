import { useState, useRef } from 'react'
import styles from './Disclaimer.module.css'
import pStyles from './Privacidad.module.css'
import aStyles from './AvisoLegal.module.css'

/* ── Contenidos ─────────────────────────────────────────────── */

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

const CONTRATO = [
  { titulo: '1. VIGENCIA Y SUSCRIPCIÓN ANUAL', texto: 'La Suscripción Anual tiene una vigencia de un (1) año contado desde la fecha en que se confirme el pago, por un valor de VEINTE MIL PESOS COLOMBIANOS ($20.000 COP). El pago corresponde a una suscripción anual para mantener el servicio activo y permitir las actividades de mantenimiento, actualización y mejora de la aplicación.' },
  { titulo: '2. VALOR Y CONDICIONES DEL PAGO', texto: 'El valor de la Suscripción Anual es de VEINTE MIL PESOS COLOMBIANOS ($20.000 COP) por un (1) año de servicio. El cobro es anual y permite mantener activa la aplicación, así como contribuir a las labores de mantenimiento, actualización, soporte y mejora continua del servicio.' },
  { titulo: '3. MANTENIMIENTO Y ACTUALIZACIÓN', texto: 'Durante cada año de vigencia de la suscripción se realizarán actividades de mantenimiento y actualización de la aplicación. Estas actividades tienen como finalidad mantener el servicio operativo, actualizado y en proceso de mejora continua. Las actualizaciones podrán incluir mejoras técnicas, correcciones, ajustes de seguridad y nuevas funcionalidades, de acuerdo con las necesidades y evolución del servicio.' },
  { titulo: '4. REEMBOLSOS, DEVOLUCIONES Y DERECHOS DEL CONSUMIDOR', texto: 'Los pagos efectuados por el usuario no serán reembolsables, salvo cuando exista un derecho de devolución, reversión, retracto u otra obligación de reembolso reconocida por la legislación colombiana aplicable, o cuando ASSYST determine expresamente lo contrario.' },
  { titulo: '5. USO RESPONSABLE DE LA APLICACIÓN', texto: 'El usuario es el único responsable del uso que realice de la aplicación, de la información que proporcione, de los permisos concedidos al dispositivo y de los familiares o contactos que vincule dentro del servicio.\n\nCualquier utilización indebida de la aplicación, incluyendo vigilancia, seguimiento, rastreo, acoso, control indebido de otra persona, utilización de la ubicación para investigar relaciones sentimentales, infidelidades, celos, conflictos de pareja, activaciones falsas, fraude o cualquier finalidad distinta a la atención y comunicación de situaciones de emergencia, será responsabilidad exclusiva del usuario que realice dicha utilización, en la medida permitida por la legislación aplicable.' },
  { titulo: '6. UBICACIÓN GPS', texto: 'La ubicación GPS se utiliza como función de apoyo a las alertas y se obtiene en el momento en que el usuario activa voluntariamente una alerta de emergencia. La ubicación enviada corresponde a la información obtenida por el dispositivo en ese momento. La aplicación no proporciona ubicación en tiempo real, seguimiento continuo ni vigilancia permanente.' },
  { titulo: '7. NATURALEZA DEL SERVICIO Y SERVICIOS OFICIALES DE EMERGENCIA', texto: 'Botón de Emergencia es una herramienta tecnológica de apoyo y comunicación ante situaciones de emergencia. No constituye un servicio de atención de emergencias, rescate, ambulancia, policía, bomberos, vigilancia privada ni monitoreo profesional.\n\nLa activación de una alerta no garantiza que los familiares, contactos, autoridades u organismos de emergencia reciban, visualicen o atiendan la alerta en un tiempo determinado.\n\nEn Colombia, ante una situación de emergencia, el usuario deberá comunicarse directamente con los servicios oficiales correspondientes, incluyendo el Número Único de Emergencias 123, Bomberos 119 o Cruz Roja 132, según corresponda.' },
  { titulo: '8. LIMITACIONES TÉCNICAS', texto: 'El funcionamiento de las alertas, GPS, SMS, WhatsApp y demás funcionalidades depende de la disponibilidad de internet o red de comunicaciones, de contar con señal o conectividad mínima disponible, señal GPS, batería, permisos y configuración del dispositivo, sistema operativo, servicios de terceros y demás condiciones técnicas. En lugares sin cobertura o con señal insuficiente, una alerta puede no enviarse, presentar demora o no transmitir correctamente la ubicación.' },
  { titulo: '9. HISTORIAL DE ALERTAS', texto: 'El historial de alertas tendrá el comportamiento de conservación indicado por las funcionalidades disponibles en la aplicación. Cuando corresponda, podrá existir auto-borrado a las 24 horas y otras opciones de gestión del historial.' },
  { titulo: '10. TRATAMIENTO DE DATOS PERSONALES', texto: 'El tratamiento de los datos personales se realizará de acuerdo con la Política de Privacidad de Botón de Emergencia, que forma parte de las condiciones aplicables al uso del servicio. Determinadas funcionalidades de comunicación, como SMS y WhatsApp, pueden requerir la intervención de redes, operadores o proveedores tecnológicos necesarios para entregar las comunicaciones.' },
  { titulo: '11. RESPONSABILIDAD SOBRE LOS CONTACTOS VINCULADOS', texto: 'El usuario es responsable de los familiares o contactos que vincule al servicio y de las autorizaciones que les otorgue mediante las funcionalidades de la aplicación. El usuario deberá procurar que las personas vinculadas sean contactos legítimos y adecuados para recibir alertas o información de ubicación relacionada con emergencias.' },
  { titulo: '12. SUSPENSIÓN O RESTRICCIÓN DEL SERVICIO', texto: 'ASSYST podrá restringir o suspender el acceso al servicio cuando existan indicios de utilización fraudulenta, abusiva, ilegal o contraria a este Contrato de Servicio, sin perjuicio de los derechos que correspondan al usuario conforme a la legislación aplicable.' },
  { titulo: '13. PROPIEDAD INTELECTUAL', texto: 'La aplicación Botón de Emergencia, su diseño, estructura, contenidos, elementos gráficos, software, funcionalidades, marcas y demás componentes protegibles son propiedad de ASSYST o se utilizan con las autorizaciones correspondientes. El usuario recibe una autorización de uso limitada al funcionamiento normal del servicio y no adquiere derechos de propiedad sobre sus componentes.' },
  { titulo: '14. SOPORTE Y CONTACTO', texto: 'Para consultas, soporte o solicitudes relacionadas con el servicio, el usuario podrá comunicarse con ASSYST a través del correo electrónico: assyst2021@ssthechofacil.com.' },
  { titulo: '15. MODIFICACIONES DEL CONTRATO', texto: 'ASSYST podrá actualizar o modificar este Contrato de Servicio cuando resulte necesario por cambios en el funcionamiento de la aplicación, nuevas funcionalidades, requisitos técnicos o disposiciones aplicables. Las modificaciones relevantes serán comunicadas o puestas a disposición del usuario por los medios disponibles en la aplicación.' },
  { titulo: '16. LEGISLACIÓN APLICABLE', texto: 'Este Contrato de Servicio se regirá por las normas aplicables de la República de Colombia, sin perjuicio de los derechos que correspondan al consumidor conforme a la legislación vigente.' },
  { titulo: '17. ACEPTACIÓN', texto: 'Al seleccionar «Leído y de acuerdo», el usuario declara que ha tenido acceso a este Contrato de Servicio, que lo ha leído, comprendido y aceptado, junto con los documentos que correspondan al servicio, incluyendo los Términos de Uso, Aviso Legal y Política de Privacidad. La aceptación electrónica podrá conservarse como evidencia de la manifestación de voluntad del usuario, de acuerdo con los mecanismos habilitados por la aplicación.' },
]

const AVISO = [
  { titulo: '1. LA APLICACIÓN NO REEMPLAZA LOS SERVICIOS OFICIALES DE EMERGENCIA', texto: 'Botón de Emergencia no sustituye los servicios oficiales de emergencia, seguridad, rescate, atención médica, bomberos ni ninguna otra autoridad o entidad competente. En caso de una emergencia, el usuario deberá comunicarse directamente con los servicios oficiales correspondientes. En Colombia, entre los números de atención se encuentran el 123 (Número Único de Emergencias), 119 (Bomberos) y 132 (Cruz Roja).' },
  { titulo: '2. CONDICIONES TÉCNICAS Y CONECTIVIDAD', texto: 'El funcionamiento de la aplicación depende, entre otros factores, de la disponibilidad de conexión a internet o de red de comunicaciones, una señal mínima disponible, señal GPS, permisos otorgados al dispositivo, batería, configuración del equipo, sistema operativo y condiciones técnicas del dispositivo utilizado.' },
  { titulo: '3. USO DE LA UBICACIÓN GPS', texto: 'La función de ubicación GPS está destinada exclusivamente al apoyo de las funciones de alerta de emergencia. La ubicación se obtiene cuando el usuario activa voluntariamente el botón de emergencia o alerta, con el propósito de facilitar que los familiares o contactos vinculados conozcan la ubicación correspondiente al momento de la alerta. La aplicación no proporciona ubicación en tiempo real ni seguimiento continuo.' },
  { titulo: '4. USO RESPONSABLE DE LA APLICACIÓN', texto: 'El usuario es el único responsable del uso que realice de la aplicación, así como de la información que proporcione, los permisos concedidos al dispositivo y los familiares o contactos que vincule dentro del servicio.\n\nCualquier utilización indebida de la aplicación, incluyendo vigilancia, seguimiento, rastreo, acoso, control indebido de otra persona, uso de la ubicación con fines distintos a una emergencia, uso fraudulento o cualquier otra utilización contraria a la finalidad de Botón de Emergencia, será responsabilidad exclusiva del usuario que realice, autorice o permita dicho uso.\n\nASSYST no será responsable por el uso indebido que el usuario realice de la aplicación, de sus funcionalidades o de la información de ubicación obtenida mediante esta, cuando dicho uso sea ajeno a la finalidad para la cual fue diseñada la aplicación y se encuentre dentro de lo permitido por la legislación aplicable.' },
  { titulo: '5. LIMITACIONES DEL SERVICIO', texto: 'ASSYST realiza esfuerzos razonables para mantener el funcionamiento de la aplicación; sin embargo, determinadas circunstancias pueden afectar el servicio, incluyendo fallas de conectividad, redes de telecomunicaciones, GPS, batería, permisos, configuración del dispositivo, sistema operativo, hardware, software u otros factores técnicos fuera del control directo de ASSYST.\n\nEn consecuencia, ASSYST no garantiza que todas las alertas sean transmitidas, recibidas o visualizadas de manera inmediata en todas las circunstancias.' },
  { titulo: '6. RESPONSABILIDAD SOBRE LA INFORMACIÓN DE UBICACIÓN', texto: 'El usuario es responsable del uso que realice de la información de ubicación recibida a través de la aplicación y de las personas a quienes haya autorizado o vinculado como familiares o contactos.\n\nEn la medida permitida por la legislación aplicable, ASSYST no será responsable por el uso indebido, abusivo, fraudulento o ajeno a la finalidad de emergencia que terceros realicen de la información de ubicación a la que hayan tenido acceso por autorización del propio usuario.' },
  { titulo: '7. LA ALERTA NO GARANTIZA LA RESPUESTA DE TERCEROS', texto: 'La activación de una alerta no garantiza que los familiares, contactos, autoridades, organismos de socorro u otras personas respondan dentro de un tiempo determinado ni que se produzca una intervención efectiva.\n\nBotón de Emergencia constituye una herramienta tecnológica de apoyo y no presta por sí misma servicios de ambulancia, policía, bomberos, rescate, vigilancia privada ni atención directa de emergencias.' },
  { titulo: '8. ACEPTACIÓN DEL AVISO LEGAL', texto: 'Al seleccionar la opción correspondiente, el usuario declara que ha leído, comprendido y aceptado el presente Aviso Legal y se compromete a utilizar la aplicación de manera responsable y de acuerdo con su finalidad de apoyo a la comunicación durante situaciones de emergencia.\n\nASSYST · Correo: assyst2021@ssthechofacil.com\nÚltima actualización: 10 de septiembre de 2026' },
]

const DOCS = [
  {
    id: 'privacidad',
    icon: '🔒',
    titulo: 'Política de Privacidad',
    sub: 'Cómo recopilamos, usamos y protegemos tu información',
    secciones: PRIVACIDAD,
    checkLabel: 'He leído y acepto la Política de Privacidad',
  },
  {
    id: 'terminos',
    icon: '⚠️',
    titulo: 'Términos de Uso',
    sub: 'Condiciones de acceso y uso de la aplicación',
    secciones: TERMINOS,
    checkLabel: 'He leído y acepto los Términos de Uso',
  },
  {
    id: 'contrato',
    icon: '📋',
    titulo: 'Contrato de Servicio',
    sub: 'Suscripción anual · $20.000 COP/año',
    secciones: CONTRATO,
    checkLabel: 'He leído y acepto el Contrato de Servicio',
  },
  {
    id: 'aviso',
    icon: '🛡️',
    titulo: 'Aviso Legal',
    sub: 'Limitaciones y responsabilidades del servicio',
    secciones: AVISO,
    checkLabel: 'He leído y acepto el Aviso Legal',
  },
]

/* ── Componente acordeón por documento ─────────────────────── */

function DocAcordeon({ doc, onLeido, leido, checked, onCheck, soloVer }) {
  const [abierto, setAbierto] = useState(false)
  const bodyRef = useRef(null)

  function alHacerScroll() {
    if (leido) return
    const el = bodyRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 60) {
      onLeido()
    }
  }

  function toggleAbrir() {
    setAbierto(v => !v)
  }

  return (
    <div className={`${aStyles.acordeon} ${checked ? aStyles.acordeonDone : ''}`}>
      {/* Header */}
      <button className={aStyles.acordeonHeader} onClick={toggleAbrir} aria-expanded={abierto}>
        <span className={aStyles.acordeonIcon}>{doc.icon}</span>
        <div className={aStyles.acordeonTextos}>
          <span className={aStyles.acordeonTitulo}>{doc.titulo}</span>
          <span className={aStyles.acordeonSub}>{doc.sub}</span>
        </div>
        <span className={`${aStyles.acordeonChevron} ${abierto ? aStyles.rotado : ''}`}>›</span>
        {checked && <span className={aStyles.acordeonCheck}>✅</span>}
      </button>

      {/* Body */}
      {abierto && (
        <div className={aStyles.acordeonBody} ref={bodyRef} onScroll={alHacerScroll}>
          {doc.secciones.map((s, i) => (
            <div key={i}>
              {i > 0 && <hr className={styles.divider} />}
              <div className={pStyles.seccion}>
                <p className={pStyles.titulo2}>{s.titulo}</p>
                <p className={styles.parrafo} style={{ whiteSpace: 'pre-line' }}>{s.texto}</p>
              </div>
            </div>
          ))}
          {/* Zona de aceptación dentro del acordeón */}
          {!soloVer && (
            <div className={aStyles.checkZona}>
              {!leido ? (
                <p className={pStyles.avisoScroll}>📖 Desplázate hasta el final para habilitar</p>
              ) : (
                <label className={`${pStyles.checkLabel} ${checked ? aStyles.checkActivo : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => onCheck(e.target.checked)}
                    className={pStyles.checkbox}
                  />
                  <span>{doc.checkLabel}</span>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Pantalla principal ─────────────────────────────────────── */

export default function AvisoLegal({ onAceptar, soloVer = false }) {
  const [leidos, setLeidos] = useState({ privacidad: false, terminos: false, contrato: false, aviso: false })
  const [checks, setChecks] = useState({ privacidad: false, terminos: false, contrato: false, aviso: false })

  function marcarLeido(id) {
    setLeidos(prev => ({ ...prev, [id]: true }))
  }

  function marcarCheck(id, val) {
    setChecks(prev => ({ ...prev, [id]: val }))
  }

  const todosAceptados = checks.privacidad && checks.terminos && checks.contrato && checks.aviso

  return (
    <div className={styles.wrap}>
      <div className={aStyles.outerScroll}>
        <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
        <div className={styles.emoji}>🚨</div>
        <h1 className={aStyles.bienvenidaTitulo}>¡Bienvenido a<br />Botón de Emergencia!</h1>
        <p className={aStyles.bienvenidaSub}>Tu seguridad y la de quienes quieres, ahora están más conectadas.</p>

        <div className={aStyles.bienvenidaCaja}>
          <p className={aStyles.bienvenidaTexto}>
            El Botón de Emergencia es una herramienta creada por ASSYST para ayudarte a comunicar una situación de emergencia a tus familiares o contactos vinculados.
          </p>

          <p className={aStyles.bienvenidaSubtitulo}>Con tu suscripción podrás:</p>
          <ul className={aStyles.bienvenidaLista}>
            <li>Activar una alerta de emergencia.</li>
            <li>Compartir la ubicación GPS obtenida en el momento en que actives una alerta.</li>
            <li>Mantener conectados a tus familiares o contactos de confianza.</li>
            <li>Utilizar las funciones de comunicación disponibles en la aplicación.</li>
            <li>Contar con mantenimiento y actualizaciones durante tu año de suscripción.</li>
          </ul>

          <p className={aStyles.bienvenidaSubtitulo}>Antes de comenzar:</p>
          <ul className={aStyles.bienvenidaLista}>
            <li>Permite el acceso a la ubicación cuando la aplicación lo solicite.</li>
            <li>Registra correctamente tus datos.</li>
            <li>Vincula únicamente a familiares o contactos de confianza.</li>
            <li>Mantén activos el GPS, una señal o conexión mínima y los permisos necesarios.</li>
          </ul>

          <p className={aStyles.bienvenidaAviso}>
            ⚠️ La aplicación requiere que el celular cuente con señal o conectividad mínima para poder enviar una alerta. Si no hay cobertura o la señal es insuficiente, la alerta puede no enviarse o presentar demora.
          </p>
        </div>

        <div className={aStyles.separador} />
        <p className={aStyles.instruccionTitulo}>📋 Documentos legales</p>
        <p className={aStyles.instruccion}>
          Abre cada documento, léelo completo y el check se habilitará automáticamente. Cuando hayas aceptado los cuatro, podrás continuar.
        </p>

        <div className={aStyles.lista}>
          {DOCS.map(doc => (
            <DocAcordeon
              key={doc.id}
              doc={doc}
              leido={leidos[doc.id]}
              checked={checks[doc.id]}
              onLeido={() => marcarLeido(doc.id)}
              onCheck={val => marcarCheck(doc.id, val)}
              soloVer={soloVer}
            />
          ))}
        </div>

        <div className={pStyles.checksWrap} style={{ marginTop: 16 }}>
          {soloVer ? (
            <button className={styles.btn} onClick={onAceptar}>← Volver</button>
          ) : (
          <button
            className={todosAceptados ? styles.btn : pStyles.btnDeshabilitado}
            onClick={todosAceptados ? onAceptar : undefined}
            disabled={!todosAceptados}
          >
            {todosAceptados ? '✅ Continuar' : 'Acepta los cuatro documentos para continuar'}
          </button>
          )}
        </div>
      </div>
    </div>
  )
}
