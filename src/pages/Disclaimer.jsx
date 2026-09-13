import { useState } from 'react'
import styles from './Disclaimer.module.css'
import pStyles from './Privacidad.module.css'

const SECCIONES_ES = [
  {
    titulo: '1. DEFINICIONES',
    texto: 'Para efectos de estos Términos de Uso:\n\na) «Usuario»: persona que se registra, accede o utiliza Botón de Emergencia.\n\nb) «Aplicación» o «Servicio»: la aplicación Botón de Emergencia, sus funcionalidades, actualizaciones y componentes relacionados.\n\nc) «Cuenta»: registro personal que permite al usuario acceder a las funcionalidades disponibles en la aplicación.\n\nd) «Contactos vinculados»: familiares o personas que el usuario incorpora y autoriza dentro de la aplicación para recibir información relacionada con una alerta.\n\ne) «Alerta de emergencia»: activación voluntaria realizada por el usuario mediante la funcionalidad correspondiente de la aplicación.\n\nf) «Ubicación»: información de localización obtenida mediante el GPS del dispositivo cuando el usuario activa voluntariamente una alerta, de acuerdo con la Política de Privacidad.',
  },
  {
    titulo: '2. ACEPTACIÓN DE LOS TÉRMINOS',
    texto: 'El acceso y uso de Botón de Emergencia implica la aceptación de estos Términos de Uso, así como de la Política de Privacidad.\n\nSi el usuario no está de acuerdo con estos Términos o con la Política de Privacidad, deberá abstenerse de utilizar la aplicación.\n\nCuando la aplicación solicite la aceptación expresa mediante una opción como «Estoy de acuerdo», la selección de dicha opción constituirá manifestación de aceptación de los documentos correspondientes.',
  },
  {
    titulo: '3. REGISTRO Y CUENTA DEL USUARIO',
    texto: 'Para utilizar determinadas funcionalidades, el usuario podrá tener que crear una cuenta y proporcionar información como nombre completo, nombre de usuario, correo electrónico y número de teléfono.\n\nEl usuario se compromete a suministrar información verdadera, actualizada y suficiente para la prestación del servicio, y a mantenerla actualizada cuando sea necesario.\n\nLa cuenta es de uso personal. El usuario deberá proteger sus credenciales de acceso y evitar compartirlas con terceros. Si sospecha que otra persona ha obtenido acceso no autorizado a su cuenta, deberá tomar las medidas necesarias para protegerla y comunicar la situación a ASSYST cuando corresponda.',
  },
  {
    titulo: '4. USO DE LA APLICACIÓN Y RESPONSABILIDAD DEL USUARIO',
    texto: 'El usuario es el único responsable del uso que realice de la aplicación, de la información que proporcione, de los permisos concedidos al dispositivo y de los familiares o contactos que vincule dentro del servicio.\n\nCualquier utilización indebida de la aplicación, incluyendo vigilancia, seguimiento, rastreo, acoso, control indebido de otra persona, uso de la ubicación con fines distintos a una emergencia, uso fraudulento o cualquier otra utilización contraria a la finalidad de Botón de Emergencia, será responsabilidad exclusiva del usuario que realice, autorice o permita dicho uso.\n\nASSYST no será responsable por el uso indebido que el usuario realice de la aplicación, de sus funcionalidades o de la información de ubicación obtenida mediante esta, cuando dicho uso sea ajeno a la finalidad para la cual fue diseñada la aplicación y se encuentre dentro de lo permitido por la legislación aplicable.',
  },
  {
    titulo: '5. FINALIDAD Y USO DE LA ALERTA DE EMERGENCIA',
    texto: 'La funcionalidad principal de la aplicación es facilitar la comunicación de una situación de emergencia con los familiares o contactos previamente vinculados por el usuario.\n\nLa activación de una alerta debe realizarse únicamente cuando exista una situación que justifique el uso de esta funcionalidad. El usuario debe evitar activaciones deliberadamente falsas, fraudulentas, abusivas o destinadas a causar molestias, alarma innecesaria o perjuicios a otras personas.',
  },
  {
    titulo: '6. UBICACIÓN GPS Y LIMITACIONES DE LOCALIZACIÓN',
    texto: 'La ubicación GPS se utiliza exclusivamente como apoyo a las funciones de alerta. La ubicación se obtiene cuando el usuario activa voluntariamente el botón de emergencia o alerta, con el propósito de facilitar que los contactos vinculados conozcan la ubicación correspondiente al momento de la alerta.\n\nLa aplicación no está diseñada para vigilancia, seguimiento permanente, rastreo continuo ni control de los movimientos, actividades o rutinas del usuario. Tampoco está destinada a investigar relaciones sentimentales, posibles infidelidades, celos, conflictos de pareja u otras situaciones personales ajenas a una emergencia.\n\nLa información de ubicación puede presentar limitaciones de precisión y disponibilidad dependiendo del dispositivo, señal GPS, conectividad, permisos y condiciones del entorno.',
  },
  {
    titulo: '7. NO SUSTITUCIÓN DE LOS SERVICIOS OFICIALES DE EMERGENCIA',
    texto: 'Botón de Emergencia no sustituye los servicios oficiales de emergencia, seguridad, atención médica, rescate, bomberos, policía ni otras autoridades o entidades competentes.\n\nEn Colombia, ante una emergencia, el usuario debe comunicarse directamente con los servicios oficiales correspondientes, incluyendo el 123 (Número Único de Emergencias), 119 (Bomberos) o 132 (Cruz Roja), según la situación y disponibilidad del servicio.\n\nLa aplicación constituye únicamente un mecanismo tecnológico complementario de comunicación.',
  },
  {
    titulo: '8. CONECTIVIDAD, DISPOSITIVO Y FUNCIONAMIENTO',
    texto: 'El funcionamiento del servicio puede depender de la disponibilidad de internet o red de comunicaciones, señal GPS, batería, permisos del dispositivo, configuración del equipo, sistema operativo, hardware, software y otros factores técnicos.\n\nEn zonas sin cobertura o con conectividad inestable, señal GPS insuficiente, batería agotada, permisos restringidos o fallas del dispositivo, una alerta puede no enviarse, enviarse con demora, no recibirse o no mostrar correctamente la ubicación.\n\nPor estas razones, ASSYST no garantiza que todas las alertas sean transmitidas, recibidas o visualizadas de manera inmediata en todas las circunstancias.',
  },
  {
    titulo: '9. CONTACTOS VINCULADOS Y ACCESO A LA INFORMACIÓN',
    texto: 'El usuario es responsable de seleccionar y vincular correctamente a sus familiares o contactos y de verificar que la información suministrada sea correcta.\n\nEl usuario deberá vincular únicamente personas respecto de las cuales tenga autorización o una relación legítima para facilitarles la información que la aplicación permita compartir.\n\nLa información personal y de ubicación se tratará conforme a la Política de Privacidad de Botón de Emergencia.',
  },
  {
    titulo: '10. CONDUCTAS Y USOS PROHIBIDOS',
    texto: 'El usuario no podrá utilizar la aplicación para:\n\na) Vigilar, rastrear o controlar indebidamente a otra persona.\nb) Utilizar la ubicación para fines sentimentales, de pareja, celos o investigación personal ajena a una emergencia.\nc) Acosar, amenazar, intimidar o causar perjuicios a otras personas.\nd) Realizar activaciones falsas, fraudulentas o deliberadamente abusivas.\ne) Suplantar la identidad de otra persona o utilizar cuentas ajenas.\nf) Obtener, divulgar o utilizar información de otros usuarios sin autorización.\ng) Intentar vulnerar, alterar, interferir, descompilar, realizar ingeniería inversa o acceder sin autorización a componentes técnicos de la aplicación o sus sistemas.\nh) Introducir código malicioso, realizar acciones que puedan afectar la disponibilidad del servicio o intentar eludir medidas de seguridad.\ni) Utilizar la aplicación para actividades ilícitas o contrarias a la legislación aplicable.\nj) Facilitar a terceros herramientas o medios destinados a realizar cualquiera de las conductas anteriores.',
  },
  {
    titulo: '11. SEGURIDAD DE LA CUENTA',
    texto: 'El usuario debe mantener bajo su control sus credenciales de acceso y adoptar medidas razonables para evitar accesos no autorizados.\n\nASSYST podrá adoptar medidas de seguridad, limitación o suspensión cuando existan indicios de uso no autorizado, fraudulento, abusivo o contrario a estos Términos, de acuerdo con la legislación aplicable.',
  },
  {
    titulo: '12. PROPIEDAD INTELECTUAL',
    texto: 'La aplicación Botón de Emergencia, su diseño, estructura, elementos gráficos, textos, software, funcionalidades, marcas, logotipos y demás componentes protegibles pertenecen a ASSYST o se utilizan con las autorizaciones correspondientes.\n\nEl acceso a la aplicación no transfiere al usuario derechos de propiedad sobre dichos elementos. El usuario recibe únicamente una autorización limitada para utilizar el servicio de acuerdo con estos Términos.\n\nSalvo autorización expresa o cuando la ley lo permita, está prohibida la reproducción, modificación, distribución, extracción, ingeniería inversa, comercialización o explotación no autorizada de los componentes de la aplicación.',
  },
  {
    titulo: '13. DISPONIBILIDAD Y CAMBIOS DEL SERVICIO',
    texto: 'ASSYST podrá realizar actualizaciones, modificaciones, mejoras, mantenimientos o cambios en las funcionalidades de la aplicación cuando resulte necesario para su operación, seguridad, evolución o adaptación tecnológica.\n\nAlgunas funciones podrían dejar de estar disponibles temporal o permanentemente, especialmente cuando existan razones técnicas, de seguridad, legales o de mantenimiento.',
  },
  {
    titulo: '14. SUSPENSIÓN O TERMINACIÓN DEL ACCESO',
    texto: 'ASSYST podrá restringir, suspender o terminar el acceso a la aplicación cuando exista incumplimiento de estos Términos, uso fraudulento, abusivo o ilícito, riesgo para la seguridad del servicio o de terceros, o cuando resulte necesario por razones técnicas, legales o de seguridad.\n\nEstas medidas se aplicarán respetando los derechos que correspondan al usuario conforme a la legislación aplicable.',
  },
  {
    titulo: '15. RESPONSABILIDAD POR EL USO INDEBIDO',
    texto: 'El usuario será responsable de los daños o perjuicios que pueda ocasionar a terceros como consecuencia de un uso indebido, fraudulento, abusivo o ilícito de la aplicación, de sus funcionalidades o de la información a la que tenga acceso mediante su cuenta, en la medida en que dicha responsabilidad sea atribuible al usuario y conforme a la legislación aplicable.\n\nEl usuario también será responsable de las personas que vincule voluntariamente como contactos y de los permisos o accesos que les conceda dentro de la aplicación.',
  },
  {
    titulo: '16. LIMITACIÓN DEL SERVICIO Y AUSENCIA DE GARANTÍA DE RESPUESTA',
    texto: 'La activación de una alerta no garantiza que los familiares, contactos, autoridades, organismos de socorro u otras personas respondan en un tiempo determinado ni que se produzca una intervención efectiva.\n\nLa aplicación no garantiza atención médica, policial, de bomberos, rescate o cualquier otro servicio de emergencia. En una situación de riesgo, el usuario deberá utilizar también los medios oficiales disponibles.',
  },
  {
    titulo: '17. PROTECCIÓN DE DATOS PERSONALES',
    texto: 'El tratamiento de los datos personales del usuario se realizará de acuerdo con la Política de Privacidad de Botón de Emergencia.\n\nLa Política de Privacidad establece, entre otros aspectos, qué información se recopila, para qué se utiliza, cómo se protege, cuándo puede compartirse con los contactos vinculados y cómo puede el usuario ejercer sus derechos.',
  },
  {
    titulo: '18. ENLACES Y SERVICIOS EXTERNOS',
    texto: 'Si la aplicación incorpora enlaces o accesos a sitios, plataformas o servicios externos, estos podrán estar sujetos a sus propios términos de uso y políticas de privacidad.\n\nASSYST no controla necesariamente los contenidos, disponibilidad o políticas de servicios externos y el usuario deberá revisar las condiciones aplicables antes de utilizarlos.',
  },
  {
    titulo: '19. MODIFICACIONES DE LOS TÉRMINOS DE USO',
    texto: 'ASSYST podrá modificar estos Términos de Uso cuando sea necesario, por cambios en la aplicación, funcionalidades, requisitos técnicos, legislación o por razones de seguridad y operación.\n\nCuando se realicen modificaciones relevantes, estas podrán ser comunicadas mediante la aplicación u otros medios disponibles. La versión actualizada indicará la fecha de su última actualización.\n\nEl uso continuado de la aplicación después de la entrada en vigor de los cambios podrá considerarse aceptación de los Términos actualizados, sin perjuicio de los derechos que la legislación aplicable reconozca al usuario.',
  },
  {
    titulo: '20. LEGISLACIÓN APLICABLE',
    texto: 'Estos Términos de Uso se regirán e interpretarán de conformidad con la legislación colombiana, en aquello que resulte aplicable.\n\nCualquier controversia relacionada con el uso de la aplicación será sometida a las autoridades y mecanismos de solución de conflictos competentes conforme a la legislación colombiana, respetando los derechos y garantías que resulten aplicables al usuario.',
  },
  {
    titulo: '21. CONTACTO',
    texto: 'Para consultas, solicitudes o comunicaciones relacionadas con estos Términos de Uso, el usuario podrá comunicarse con:\n\nASSYST\nAplicación: Botón de Emergencia\nCorreo electrónico: assyst2021@ssthechofacil.com',
  },
  {
    titulo: '22. ACEPTACIÓN FINAL',
    texto: 'Al seleccionar «Estoy de acuerdo», registrarse, acceder o utilizar Botón de Emergencia, el usuario declara que ha leído, comprendido y aceptado estos Términos de Uso y se compromete a utilizar la aplicación de manera responsable, lícita y de acuerdo con su finalidad de apoyo a la comunicación durante situaciones de emergencia.',
  },
]

export default function Disclaimer({ onAceptar }) {
  const [llegóAlFinal, setLlegóAlFinal] = useState(false)

  function alHacerScroll(e) {
    if (llegóAlFinal) return
    const el = e.target
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 40) {
      setLlegóAlFinal(true)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll} onScroll={alHacerScroll}>
        <img src="/logo.png" alt="Botón de Emergencias" className={styles.logoHeader} />
        <h1 className={styles.titulo}>Términos de Uso</h1>
        <p className={styles.subtitulo}>Botón de Emergencia · Desarrollado por ASSYST</p>

        <div className={pStyles.metaBox}>
          <p className={pStyles.metaFila}><strong>Responsable:</strong> ASSYST</p>
          <p className={pStyles.metaFila}><strong>Aplicación:</strong> Botón de Emergencia</p>
          <p className={pStyles.metaFila}><strong>Contacto:</strong> assyst2021@ssthechofacil.com</p>
          <p className={pStyles.metaFila}><strong>Última actualización:</strong> 10 de septiembre de 2026</p>
        </div>

        <div className={styles.caja}>
          <p className={styles.parrafo}>
            Los presentes Términos de Uso regulan el acceso y utilización de la aplicación <strong>Botón de Emergencia</strong>, desarrollada por ASSYST. Al registrarse, acceder o utilizar la aplicación, el usuario declara que ha leído, comprendido y aceptado estos Términos de Uso y la Política de Privacidad aplicable.
          </p>
          <p className={styles.parrafo}>
            Botón de Emergencia es una herramienta tecnológica de apoyo preventivo destinada a facilitar la comunicación de una situación de emergencia entre el usuario y los familiares o contactos que este haya vinculado. <strong>La aplicación no constituye un servicio oficial de atención de emergencias ni reemplaza a las autoridades o entidades de socorro.</strong>
          </p>

          {SECCIONES_ES.map((s, i) => (
            <div key={i}>
              <hr className={styles.divider} />
              <div className={pStyles.seccion}>
                <p className={pStyles.titulo2}>{s.titulo}</p>
                <p className={styles.parrafo} style={{ whiteSpace: 'pre-line' }}>{s.texto}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={pStyles.btnWrap}>
          {!llegóAlFinal && (
            <p className={pStyles.avisoScroll}>📖 Lee los términos completos para continuar</p>
          )}
          <button
            className={llegóAlFinal ? styles.btn : pStyles.btnDeshabilitado}
            onClick={llegóAlFinal ? onAceptar : undefined}
            disabled={!llegóAlFinal}
          >
            {llegóAlFinal ? '✅ Estoy de acuerdo' : '⬇ Desplázate para leer todo'}
          </button>
        </div>
      </div>
    </div>
  )
}
