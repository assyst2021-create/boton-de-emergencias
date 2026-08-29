import styles from './Disclaimer.module.css'
import pStyles from './Privacidad.module.css'

export default function Privacidad({ onAceptar, soloVer = false }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <div className={styles.emoji}>🔒</div>
        <h1 className={styles.titulo}>Política de Privacidad</h1>
        <p className={styles.subtitulo}>Botón de Emergencias — SST Hecho Fácil</p>

        <div className={styles.caja}>
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>1. Datos que recopilamos</p>
            <p className={styles.parrafo}>
              Al registrarte recopilamos: nombre completo, nombre de usuario, correo electrónico y número de teléfono.
              Durante el uso de la app recopilamos tu <strong>ubicación GPS</strong> únicamente cuando presionas un botón de alerta.
            </p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>2. Cómo usamos tus datos</p>
            <p className={styles.parrafo}>
              🔹 Tu ubicación se envía exclusivamente a tus familiares vinculados al momento de una alerta.<br />
              🔹 Tu correo electrónico se usa solo para iniciar sesión y recuperar contraseña.<br />
              🔹 Tu teléfono se usa para facilitar el contacto de tus familiares en caso de emergencia.
            </p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>3. Compartición de datos</p>
            <p className={styles.parrafo}>
              No vendemos ni compartimos tus datos con terceros. La información solo es visible para los familiares que tú mismo vinculas dentro de la aplicación.
            </p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>4. Almacenamiento y seguridad</p>
            <p className={styles.parrafo}>
              Tus datos se almacenan de forma segura en Supabase con cifrado en tránsito (HTTPS) y en reposo. Aplicamos Row Level Security para que cada usuario solo acceda a su propia información.
            </p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>5. Eliminación de datos</p>
            <p className={styles.parrafo}>
              Puedes solicitar la eliminación de tu cuenta y todos tus datos escribiendo a <strong>assyst2021@ssthechofacil.com</strong>. Procesamos la solicitud en un plazo máximo de 15 días hábiles.
            </p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>6. Contacto</p>
            <p className={styles.parrafo}>
              Para cualquier consulta sobre privacidad contacta a <strong>SST Hecho Fácil</strong> en assyst2021@ssthechofacil.com
            </p>
          </div>
        </div>

        {soloVer ? null : (
          <button className={styles.btn} onClick={onAceptar}>
            ✅ Entendido y acepto
          </button>
        )}
      </div>
    </div>
  )
}
