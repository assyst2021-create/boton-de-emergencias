const SECCIONES = [
  {
    titulo: '1. INTRODUCCIÓN',
    texto: 'La presente Política de Privacidad establece las condiciones bajo las cuales ASSYST recopila, utiliza, almacena y protege la información personal de los usuarios de Botón de Emergencia, aplicación creada y desarrollada por ASSYST bajo la marca SST Hecho Fácil. Su finalidad es informar de manera clara y transparente qué información se solicita, para qué se utiliza y cuáles son las opciones disponibles para el usuario.',
  },
  {
    titulo: '2. RESPONSABLE DEL TRATAMIENTO Y CONTACTO',
    texto: 'ASSYST es el responsable de la aplicación y de la gestión de la información personal que los usuarios proporcionan directamente mediante el registro y uso de sus funcionalidades.\n\nPara consultas relacionadas con privacidad, tratamiento de datos, actualización de información o solicitudes de eliminación de la cuenta:\n\nCorreo electrónico: assyst2021@ssthechofacil.com',
  },
  {
    titulo: '3. INFORMACIÓN QUE RECOPILAMOS',
    texto: 'Al registrarse y utilizar la aplicación, podemos recopilar:\n\n· Nombre completo.\n· Nombre de usuario.\n· Correo electrónico.\n· Número de teléfono.\n· Información necesaria para gestionar y mantener la cuenta.\n· Ubicación GPS, únicamente cuando el usuario activa voluntariamente una función de alerta.\n\nASSYST no recopila la ubicación GPS de manera permanente.',
  },
  {
    titulo: '4. CÓMO UTILIZAMOS LA INFORMACIÓN',
    texto: '· Crear, identificar y administrar la cuenta del usuario.\n· Permitir el acceso y uso de las funcionalidades de la aplicación.\n· Facilitar el inicio de sesión y la recuperación de la contraseña.\n· Facilitar el contacto entre el usuario y los familiares vinculados.\n· Enviar la ubicación GPS a los familiares vinculados cuando el usuario activa una alerta.\n· Mantener la seguridad, integridad y correcto funcionamiento de la aplicación.\n· Cumplir las obligaciones legales aplicables.',
  },
  {
    titulo: '5. UBICACIÓN GPS Y FUNCIONES DE ALERTA',
    texto: 'La aplicación puede utilizar la ubicación GPS exclusivamente para apoyar sus funciones de alerta, cuando el usuario presiona voluntariamente el botón correspondiente.\n\nLa ubicación GPS no será utilizada como mecanismo de vigilancia, rastreo, monitoreo permanente ni para fines relacionados con relaciones sentimentales, infidelidades, celos o conflictos de pareja.\n\nRESPONSABILIDAD: El uso de la ubicación es responsabilidad del usuario. ASSYST no se hace responsable por el uso indebido de la información de ubicación.',
  },
  {
    titulo: '6. COMPARTICIÓN Y ACCESO A LOS DATOS',
    texto: 'ASSYST no vende los datos personales de los usuarios. Cuando se activa una alerta, la ubicación podrá ser puesta a disposición de los familiares o contactos que el propio usuario haya vinculado dentro de la aplicación.',
  },
  {
    titulo: '7. ALMACENAMIENTO Y SEGURIDAD',
    texto: 'Los datos se almacenan en servidores seguros con cifrado en tránsito y controles de acceso que garantizan que cada usuario solo pueda acceder a su propia información.\n\nASSYST implementa medidas técnicas razonables para proteger la información personal. Ningún sistema tecnológico puede garantizar un riesgo absolutamente nulo frente a accesos no autorizados.',
  },
  {
    titulo: '8. CONSERVACIÓN DE LA INFORMACIÓN',
    texto: 'La información personal se conservará mientras sea necesaria para mantener la cuenta y prestar las funcionalidades de la aplicación, así como para atender obligaciones legales.',
  },
  {
    titulo: '9. DERECHOS DEL USUARIO',
    texto: '· Conocer qué información personal es objeto de tratamiento.\n· Solicitar la actualización o corrección de información incorrecta.\n· Solicitar la eliminación de su cuenta y datos personales.\n· Presentar consultas o reclamaciones relacionadas con el tratamiento de sus datos.',
  },
  {
    titulo: '10. ELIMINACIÓN O ACTUALIZACIÓN DE DATOS',
    texto: 'El usuario podrá solicitar la eliminación de su cuenta escribiendo a assyst2021@ssthechofacil.com. La solicitud se gestionará en un plazo máximo de quince (15) días hábiles.',
  },
  {
    titulo: '11. DATOS DE MENORES DE EDAD',
    texto: 'La aplicación no está diseñada para solicitar deliberadamente información personal de menores de edad sin las autorizaciones exigidas por la normativa aplicable.',
  },
  {
    titulo: '12. MODIFICACIONES DE LA POLÍTICA',
    texto: 'ASSYST podrá actualizar esta Política cuando sea necesario. Se recomienda a los usuarios revisarla periódicamente.\n\nÚltima actualización: 10 de septiembre de 2026',
  },
]

export default function PrivacidadPublica() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f9fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#1a1a2e',
    }}>
      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '32px 20px 64px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img src="/logo.png" alt="Botón de Emergencias" style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 16 }} />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px', color: '#1a1a2e' }}>
            Política de Privacidad
          </h1>
          <p style={{ margin: 0, color: '#666', fontSize: '0.95rem' }}>
            ASSYST · Botón de Emergencia
          </p>
        </div>

        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 32,
          fontSize: '0.875rem',
          color: '#555',
          lineHeight: 1.7,
        }}>
          <div><strong>Responsable:</strong> ASSYST</div>
          <div><strong>Aplicación:</strong> Botón de Emergencia</div>
          <div><strong>Contacto:</strong> assyst2021@ssthechofacil.com</div>
          <div><strong>Última actualización:</strong> 10 de septiembre de 2026</div>
        </div>

        {SECCIONES.map((s, i) => (
          <div key={i} style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '20px',
            marginBottom: 12,
          }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 10px', color: '#c0392b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {s.titulo}
            </h2>
            <p style={{ margin: 0, lineHeight: 1.75, fontSize: '0.925rem', color: '#333', whiteSpace: 'pre-line' }}>
              {s.texto}
            </p>
          </div>
        ))}

        <p style={{ textAlign: 'center', marginTop: 40, color: '#999', fontSize: '0.8rem' }}>
          ASSYST · assyst2021@ssthechofacil.com
        </p>
      </div>
    </div>
  )
}
