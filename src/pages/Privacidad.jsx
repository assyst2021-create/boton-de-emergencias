import { useState, useRef } from 'react'
import styles from './Disclaimer.module.css'
import pStyles from './Privacidad.module.css'
import { useLanguage } from '../i18n/LanguageContext'

const SECCIONES_ES = [
  {
    titulo: '1. INTRODUCCIÓN',
    texto: 'La presente Política de Privacidad establece las condiciones bajo las cuales ASSYST recopila, utiliza, almacena y protege la información personal de los usuarios de Botón de Emergencia, aplicación creada y desarrollada por ASSYST bajo la marca SST Hecho Fácil. Su finalidad es informar de manera clara y transparente qué información se solicita, para qué se utiliza y cuáles son las opciones disponibles para el usuario.',
  },
  {
    titulo: '2. RESPONSABLE DEL TRATAMIENTO Y CONTACTO',
    texto: 'ASSYST es el responsable de la aplicación y de la gestión de la información personal que los usuarios proporcionan directamente mediante el registro y uso de sus funcionalidades.\n\nPara consultas relacionadas con privacidad, tratamiento de datos, actualización de información o solicitudes de eliminación de la cuenta, el usuario puede comunicarse a:\n\nCorreo electrónico: assyst2021@ssthechofacil.com',
  },
  {
    titulo: '3. INFORMACIÓN QUE RECOPILAMOS',
    texto: 'Al registrarse y utilizar la aplicación, podemos recopilar la siguiente información:\n\n🔹 Nombre completo.\n🔹 Nombre de usuario.\n🔹 Correo electrónico.\n🔹 Número de teléfono.\n🔹 Información necesaria para gestionar y mantener la cuenta del usuario.\n🔹 Ubicación GPS, únicamente cuando el usuario activa voluntariamente una función de alerta.\n\nASSYST no recopila la ubicación GPS de manera permanente para realizar seguimiento continuo. La ubicación se obtiene únicamente en el contexto de la activación de una alerta, de acuerdo con la funcionalidad disponible en la aplicación.',
  },
  {
    titulo: '4. CÓMO UTILIZAMOS LA INFORMACIÓN',
    texto: 'La información recopilada se utiliza exclusivamente para fines relacionados con el funcionamiento de la aplicación, entre ellos:\n\n🔹 Crear, identificar y administrar la cuenta del usuario.\n🔹 Permitir el acceso y uso de las funcionalidades de la aplicación.\n🔹 Facilitar el inicio de sesión y la recuperación de la contraseña.\n🔹 Facilitar el contacto entre el usuario y los familiares o contactos que este haya vinculado dentro de la aplicación.\n🔹 Enviar la ubicación GPS a los familiares vinculados cuando el usuario activa una alerta.\n🔹 Permitir la atención y gestión de solicitudes relacionadas con la cuenta y el funcionamiento de la aplicación.\n🔹 Mantener la seguridad, integridad y correcto funcionamiento de la aplicación.\n🔹 Cumplir las obligaciones legales que resulten aplicables al responsable del tratamiento.',
  },
  {
    titulo: '5. UBICACIÓN GPS Y FUNCIONES DE ALERTA',
    texto: 'La aplicación Botón de Emergencia puede utilizar la ubicación GPS del dispositivo exclusivamente para apoyar sus funciones de alerta. Esta información se obtiene cuando el propio usuario presiona o activa voluntariamente el botón de alerta correspondiente.\n\nLa ubicación asociada a la alerta tiene como finalidad permitir que los familiares o contactos vinculados conozcan la ubicación obtenida por el dispositivo en el momento en que se activa la alerta. La aplicación no proporciona seguimiento de ubicación en tiempo real.\n\nPara que la alerta pueda enviarse y la ubicación pueda obtenerse y transmitirse, el dispositivo debe contar con señal o conectividad mínima disponible y con los servicios de ubicación y permisos necesarios. En lugares sin cobertura, con señal insuficiente o conectividad inestable, la alerta puede no enviarse, presentar demora o no transmitir correctamente la ubicación.\n\nLa ubicación GPS no será utilizada como mecanismo de vigilancia, rastreo, monitoreo permanente o seguimiento de las personas usuarias. En consecuencia, esta funcionalidad no está destinada a controlar los desplazamientos, movimientos, actividades o rutinas de una persona.\n\nLa información de ubicación tampoco será utilizada para fines relacionados con relaciones sentimentales o personales, incluyendo la comprobación, investigación o vigilancia de posibles relaciones amorosas, infidelidades, celos, conflictos de pareja u otras situaciones de carácter personal que no estén directamente relacionadas con la atención de una emergencia.\n\nEl uso de la ubicación dentro de Botón de Emergencia se limita a la finalidad principal de la aplicación: facilitar la emisión y atención de una alerta ante una situación de emergencia. Cualquier uso de esta funcionalidad ajeno a dicha finalidad no corresponde al propósito de la aplicación.\n\nRESPONSABILIDAD SOBRE EL USO DE LA UBICACIÓN Y EL GPS. El uso de la funcionalidad de ubicación y GPS de Botón de Emergencia es responsabilidad del usuario, quien deberá utilizarla exclusivamente de acuerdo con la finalidad para la cual fue diseñada. ASSYST no se hace responsable por el uso indebido, abusivo, fraudulento o ajeno a la finalidad de emergencia que cualquier usuario pueda realizar de la información de ubicación, ni por las consecuencias derivadas de compartir, consultar o utilizar dicha información para fines distintos de la atención de una emergencia, en la medida permitida por la legislación aplicable. El usuario es responsable de las personas o contactos que vincule en la aplicación y de otorgarles acceso a la información que la funcionalidad de alerta permita visualizar.',
  },
  {
    titulo: '6. COMPARTICIÓN Y ACCESO A LOS DATOS',
    texto: 'ASSYST no vende los datos personales de los usuarios ni los utiliza para comercializarlos.\n\nLa información proporcionada por el usuario se utiliza para las finalidades descritas en esta Política. En particular, cuando se activa una alerta, la ubicación podrá ser puesta a disposición de los familiares o contactos que el propio usuario haya vinculado dentro de la aplicación.\n\nNo se incorporan en esta política empresas, desarrolladores, servicios de publicidad, plataformas de analítica u otros terceros como destinatarios de la información, salvo que en el futuro se incorpore algún servicio que implique tratamiento o acceso a datos personales. En tal caso, esta política será actualizada cuando corresponda.',
  },
  {
    titulo: '7. ALMACENAMIENTO Y SEGURIDAD DE LA INFORMACIÓN',
    texto: 'La información de los usuarios se almacena de forma segura mediante la infraestructura utilizada por la aplicación. Actualmente, los datos se almacenan en Supabase.\n\n🔹 Cifrado de la información durante su transmisión mediante HTTPS.\n🔹 Protección de la información almacenada mediante mecanismos de seguridad de la infraestructura utilizada.\n🔹 Aplicación de Row Level Security (RLS) para controlar el acceso a los registros y procurar que cada usuario solo pueda acceder a la información que le corresponde según las reglas de seguridad implementadas.\n\nAunque se aplican medidas de seguridad destinadas a proteger la información, ningún sistema tecnológico puede garantizar un riesgo absolutamente nulo frente a accesos no autorizados, fallos técnicos u otros eventos de seguridad.',
  },
  {
    titulo: '8. CONSERVACIÓN DE LA INFORMACIÓN',
    texto: 'La información personal se conservará mientras sea necesaria para mantener la cuenta y prestar las funcionalidades de la aplicación, así como durante el tiempo que resulte necesario para atender obligaciones legales, solicitudes, reclamaciones o situaciones que requieran conservar determinada información.\n\nCuando los datos ya no sean necesarios para las finalidades correspondientes y no exista una obligación legal de conservarlos, se procederá a su eliminación o a la aplicación de las medidas que correspondan.',
  },
  {
    titulo: '9. DERECHOS DEL USUARIO',
    texto: 'El usuario podrá solicitar, de acuerdo con la normativa aplicable, información sobre el tratamiento de sus datos y ejercer los derechos que correspondan, incluyendo:\n\n🔹 Conocer qué información personal es objeto de tratamiento.\n🔹 Solicitar la actualización o corrección de información que sea incorrecta o esté desactualizada.\n🔹 Solicitar la eliminación de su cuenta y de los datos personales que puedan ser eliminados conforme a la normativa aplicable.\n🔹 Solicitar información relacionada con el uso de sus datos.\n🔹 Presentar consultas, solicitudes o reclamaciones relacionadas con el tratamiento de sus datos personales.',
  },
  {
    titulo: '10. PROCEDIMIENTO PARA SOLICITAR ELIMINACIÓN O ACTUALIZACIÓN',
    texto: 'El usuario podrá solicitar la eliminación de su cuenta y de sus datos personales escribiendo al correo assyst2021@ssthechofacil.com.\n\nLa solicitud será revisada para verificar que corresponda al titular de la cuenta y se gestionará en un plazo máximo de quince (15) días hábiles, salvo que exista una circunstancia legal o técnica que requiera un tratamiento diferente.\n\nCuando se solicite una actualización o corrección, el usuario deberá indicar de manera clara la información que desea modificar y, cuando sea necesario, proporcionar información suficiente para verificar su identidad.',
  },
  {
    titulo: '11. ENLACES Y SERVICIOS EXTERNOS',
    texto: 'Si en algún momento la aplicación o sus contenidos incorporan enlaces hacia páginas, servicios o plataformas externas, dichas plataformas podrán contar con sus propias políticas de privacidad. ASSYST no controla las prácticas de privacidad de servicios externos que no formen parte de la aplicación.',
  },
  {
    titulo: '12. DATOS DE MENORES DE EDAD',
    texto: 'La aplicación no está diseñada para solicitar deliberadamente información personal de menores de edad sin las autorizaciones que puedan ser exigidas por la normativa aplicable. Si se identifica que se ha recopilado información de un menor en circunstancias que requieran autorización o medidas especiales, se adoptarán las acciones que correspondan conforme a la legislación aplicable.',
  },
  {
    titulo: '13. PROTECCIÓN DE LA CUENTA POR PARTE DEL USUARIO',
    texto: 'El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso y de evitar compartir su contraseña con otras personas. Si considera que su cuenta ha sido utilizada de manera no autorizada, deberá comunicarlo a ASSYST mediante el correo de contacto indicado en esta política.',
  },
  {
    titulo: '14. MODIFICACIONES DE LA POLÍTICA DE PRIVACIDAD',
    texto: 'ASSYST podrá actualizar esta Política de Privacidad cuando sea necesario para reflejar cambios en la aplicación, en las funcionalidades, en las prácticas de tratamiento de información o en las obligaciones legales aplicables.\n\nCuando se realicen cambios relevantes, se actualizará la fecha de vigencia o de última actualización indicada en este documento. Se recomienda a los usuarios revisar periódicamente esta Política de Privacidad.',
  },
  {
    titulo: '15. CONTACTO',
    texto: 'Para cualquier consulta, solicitud o inquietud relacionada con esta Política de Privacidad o con el tratamiento de datos personales en ASSYST, puede comunicarse mediante:\n\nASSYST\nCorreo electrónico: assyst2021@ssthechofacil.com',
  },
]

export default function Privacidad({ onAceptar, soloVer = false }) {
  const { t } = useLanguage()
  const [llegóAlFinal, setLlegóAlFinal] = useState(soloVer)
  const scrollRef = useRef(null)

  function alHacerScroll(e) {
    if (llegóAlFinal) return
    const el = e.target
    const margen = 40
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= margen) {
      setLlegóAlFinal(true)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll} onScroll={alHacerScroll} ref={scrollRef}>
        <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
        <div className={styles.emoji}>🔒</div>
        <h1 className={styles.titulo}>Política de Privacidad</h1>
        <p className={styles.subtitulo}>ASSYST · Botón de Emergencia</p>

        <div className={pStyles.metaBox}>
          <p className={pStyles.metaFila}><strong>Responsable:</strong> ASSYST</p>
          <p className={pStyles.metaFila}><strong>Aplicación:</strong> Botón de Emergencia</p>
          <p className={pStyles.metaFila}><strong>Contacto:</strong> assyst2021@ssthechofacil.com</p>
          <p className={pStyles.metaFila}><strong>Última actualización:</strong> 10 de septiembre de 2026</p>
        </div>

        <div className={styles.caja}>
          {SECCIONES_ES.map((s, i) => (
            <div key={i}>
              {i > 0 && <hr className={styles.divider} />}
              <div className={pStyles.seccion}>
                <p className={pStyles.titulo2}>{s.titulo}</p>
                <p className={styles.parrafo} style={{ whiteSpace: 'pre-line' }}>{s.texto}</p>
              </div>
            </div>
          ))}
        </div>

        {!soloVer && (
          <div className={pStyles.btnWrap}>
            {!llegóAlFinal && (
              <p className={pStyles.avisoScroll}>📖 Lee la política completa para continuar</p>
            )}
            <button
              className={llegóAlFinal ? styles.btn : pStyles.btnDeshabilitado}
              onClick={llegóAlFinal ? onAceptar : undefined}
              disabled={!llegóAlFinal}
            >
              {llegóAlFinal ? '✅ He leído y acepto la Política de Privacidad' : '⬇ Desplázate para leer todo'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
