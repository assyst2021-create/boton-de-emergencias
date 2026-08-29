import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './PanicButtons.module.css'
import Perfil from './Perfil'

const BOTONES = [
  {
    tipo: 'red',
    emoji: '🔴',
    titulo: 'Estoy en peligro',
    mensaje: 'ALERTA: Estoy en peligro, necesito de tu ayuda urgente.',
    color: '#C0392B',
    colorHover: '#a93226',
    smsTexto: '🔴 ALERTA: Estoy en peligro, necesito de tu ayuda urgente.',
    estado: 'EN PELIGRO',
  },
  {
    tipo: 'orange',
    emoji: '🟠',
    titulo: 'Estoy herido / necesito ayuda',
    mensaje: 'ALERTA: Estoy herido, necesito ayuda médica urgente.',
    color: '#E67E22',
    colorHover: '#ca6f1e',
    smsTexto: '🟠 ALERTA: Estoy herido, necesito ayuda médica urgente.',
    estado: 'HERIDO, NECESITO AYUDA MÉDICA',
  },
  {
    tipo: 'green',
    emoji: '🟢',
    titulo: 'Estoy bien / a salvo',
    mensaje: 'Tranquilos: estoy bien y a salvo.',
    color: '#1E8449',
    colorHover: '#196f3d',
    smsTexto: '🟢 Tranquilos: estoy bien y a salvo.',
    estado: 'ESTOY BIEN Y A SALVO',
  },
]

export default function PanicButtons() {
  const [user, setUser] = useState(null)
  const [familiares, setFamiliares] = useState([])
  const [enviando, setEnviando] = useState(null)
  const [confirmacion, setConfirmacion] = useState(null)
  const [confirmarBtn, setConfirmarBtn] = useState(null)
  const [mostrarPerfil, setMostrarPerfil] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: perfil } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setUser(perfil)

    const { data: links } = await supabase
      .from('family_links')
      .select('linked_user_id, users!family_links_linked_user_id_fkey(full_name, phone_number)')
      .eq('user_id', authUser.id)
      .eq('status', 'accepted')
    setFamiliares(links || [])
  }

  async function enviarAlerta(boton) {
    if (enviando) return
    setConfirmarBtn(null)
    setEnviando(boton.tipo)

    let lat = null, lng = null
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch {
      // GPS no disponible, continuar sin coordenadas
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const ahora = new Date()
    const expiresAt = new Date(ahora.getTime() + 24 * 60 * 60 * 1000)

    await supabase.from('alerts').insert({
      sender_id: authUser.id,
      status_type: boton.tipo,
      latitude: lat,
      longitude: lng,
      sent_at: ahora.toISOString(),
      expires_at: expiresAt.toISOString(),
    })

    // SMS a familiares vinculados
    if (familiares.length > 0 && lat) {
      const mapsLink = `https://maps.google.com/?q=${lat},${lng}`
      const hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      const fecha = ahora.toLocaleDateString('es-CO')
      const cuerpo = `${boton.smsTexto} — ${user?.full_name || 'Usuario'} | Estado: ${boton.estado} | Ubicación: ${mapsLink} | Hora: ${hora} — ${fecha}`
      const numeros = familiares.map(f => f.users?.phone_number).filter(Boolean).join(',')
      if (numeros) {
        window.location.href = `sms:${numeros}?body=${encodeURIComponent(cuerpo)}`
      }
    }

    setEnviando(null)
    setConfirmacion(boton)
    setTimeout(() => setConfirmacion(null), 5000)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.sos}>🆘</span>
          <div>
            <h1>Botón de Emergencias</h1>
            <p>para Sismos y Avalanchas</p>
          </div>
          <button className={styles.salir} onClick={() => setMostrarPerfil(true)} title="Opciones">⚙️</button>
        </div>
        {user && <div className={styles.usuario}>Hola, <strong>{user.full_name}</strong></div>}
      </header>

      {confirmacion && (
        <div className={styles.confirmacion} style={{ borderColor: confirmacion.color }}>
          <span style={{ fontSize: '1.5rem' }}>{confirmacion.emoji}</span>
          <div>
            <strong>Alerta enviada</strong>
            <p>{confirmacion.mensaje}</p>
          </div>
        </div>
      )}

      <div className={styles.instruccion}>
        Presiona el botón según tu situación actual
      </div>

      <div className={styles.botones}>
        {BOTONES.map(b => (
          <div key={b.tipo}>
            {confirmarBtn === b.tipo ? (
              <div className={styles.confirmBox}>
                <p>¿Confirmas enviar alerta <strong>{b.titulo}</strong>?</p>
                <div className={styles.confirmBtns}>
                  <button onClick={() => enviarAlerta(b)} style={{ background: b.color }}>Sí, enviar</button>
                  <button onClick={() => setConfirmarBtn(null)} className={styles.cancelar}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button
                className={styles.panico}
                style={{ background: b.color, '--hover': b.colorHover }}
                onClick={() => setConfirmarBtn(b.tipo)}
                disabled={enviando !== null}
              >
                <span className={styles.btnEmoji}>{b.emoji}</span>
                <span className={styles.btnTitulo}>{b.titulo}</span>
                <span className={styles.btnMensaje}>{b.mensaje}</span>
                {enviando === b.tipo && <span className={styles.spinner}>Enviando...</span>}
              </button>
            )}
          </div>
        ))}
      </div>

      {familiares.length === 0 && (
        <div className={styles.aviso}>
          ⚠️ No tienes familiares vinculados. Ve a <strong>Familia</strong> para agregar contactos.
        </div>
      )}

      <div className={styles.pb} />
      {mostrarPerfil && <Perfil onCerrar={() => setMostrarPerfil(false)} />}
    </div>
  )
}
