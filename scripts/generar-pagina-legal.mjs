// Genera la página pública de documentos legales (la que enlaza Google Play) a partir de los
// MISMOS textos que muestra la app (src/i18n/legalDocs.js), para que nunca digan cosas distintas.
//   node scripts/generar-pagina-legal.mjs
// Escribe en ../pagina-politica-privacidad/index.html (repositorio aparte, se publica en Vercel).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const { LEGAL, RESPONSABLE: R, VERSION_LEGAL } = await import(pathToFileURL(path.join(AQUI, '../src/i18n/legalDocs.js')).href)
const PAGINA = path.join(AQUI, '../../pagina-politica-privacidad/index.html')

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const titulo = s => s.charAt(0) + s.slice(1).toLowerCase().replace(/(^|\. )([a-záéíóúâêôãõç])/g, (m, a, b) => a + b.toUpperCase())

const FECHA = { es: '3 de octubre de 2026', en: 'October 3, 2026', pt: '3 de outubro de 2026' }
const NOMBRE_APP = { es: 'Botón de Emergencias', en: 'Botón de Emergencias (Emergency Button)', pt: 'Botón de Emergencias (Botão de Emergências)' }
const T = {
  es: { sub: 'Documentos legales', resp: 'Responsable', app: 'Aplicación', contacto: 'Contacto', tel: 'Teléfono', vig: 'Vigente desde', plazo: 'Plazo',
    plazoTxt: 'Inmediato desde la app · máximo 15 días hábiles por correo', eliminar: 'Eliminar cuenta', eliminarTitulo: 'Eliminar cuenta y datos' },
  en: { sub: 'Legal documents', resp: 'Data controller', app: 'App', contacto: 'Contact', tel: 'Phone', vig: 'Effective from', plazo: 'Timeframe',
    plazoTxt: 'Immediate from the app · up to 15 business days by email', eliminar: 'Delete account', eliminarTitulo: 'Delete account and data' },
  pt: { sub: 'Documentos legais', resp: 'Responsável', app: 'Aplicativo', contacto: 'Contato', tel: 'Telefone', vig: 'Vigente desde', plazo: 'Prazo',
    plazoTxt: 'Imediato pelo app · até 15 dias úteis por e-mail', eliminar: 'Excluir conta', eliminarTitulo: 'Excluir conta e dados' },
}
const correo = `<strong>${esc(R.correo)}</strong>`
const ELIMINAR = {
  es: [
    ['Desde la app (inmediato, versión 1.1.1 (89) en adelante)', 'Abre Botón de Emergencias → ⚙️ Opciones → Eliminar cuenta. La app te avisa que no se puede deshacer y te pide confirmar. Al confirmar, tu cuenta se elimina de inmediato.'],
    ['Sin la app (por correo)', `Si ya no tienes la app, escribe a ${correo} desde el correo con el que te registraste, con el asunto "Eliminar mi cuenta", e incluye tu @usuario. Confirmamos que eres el titular y eliminamos la cuenta en un máximo de 15 días hábiles.`],
    ['Qué se elimina', 'Tu perfil (nombre, @usuario, correo, teléfono y contraseña), tus vínculos familiares y solicitudes, tus alertas, tus ubicaciones compartidas, el registro de recuperaciones de celular, tus preferencias y el identificador de notificaciones. Se borran de forma definitiva en un máximo de 30 días y no se pueden recuperar: si vuelves, debes registrarte de cero.'],
    ['Qué no se elimina', 'Los registros de pago los guarda Google Play según sus propias políticas. Las alertas que ya enviaste pudieron llegar como SMS o WhatsApp a los celulares de tus familiares: esos mensajes quedan en sus teléfonos.'],
    ['Tu suscripción', 'Eliminar la cuenta no cancela la suscripción de Google Play. Cancélala en Google Play → Pagos y suscripciones para que no se te siga cobrando.'],
    ['Borrar datos sin eliminar la cuenta', `Desde la app puedes borrar alertas de tu historial, quitar familiares, dejar de compartir tu ubicación y desactivar Recuperar celular. Para cualquier otro dato, escríbenos a ${correo}.`],
  ],
  en: [
    ['From the app (immediate, version 1.1.1 (89) or later)', 'Open Botón de Emergencias → ⚙️ Settings → Delete account. The app warns you that it cannot be undone and asks you to confirm. Once confirmed, your account is deleted immediately.'],
    ['Without the app (by email)', `If you no longer have the app, write to ${correo} from the email you registered with, with the subject "Delete my account", and include your @username. We confirm you are the account holder and delete the account within 15 business days at most.`],
    ['What is deleted', 'Your profile (name, @username, email, phone and password), your family links and requests, your alerts, your shared locations, the phone recovery records, your preferences and the notification identifier. They are permanently deleted within 30 days at most and cannot be recovered: if you come back, you must register from scratch.'],
    ['What is not deleted', 'Payment records are kept by Google Play under its own policies. Alerts you already sent may have reached your family members\' phones as SMS or WhatsApp messages: those messages stay on their phones.'],
    ['Your subscription', 'Deleting your account does not cancel your Google Play subscription. Cancel it in Google Play → Payments & subscriptions so you are not charged again.'],
    ['Delete data without deleting the account', `In the app you can delete alerts from your history, remove family members, stop sharing your location and turn off Recover phone. For any other data, write to us at ${correo}.`],
  ],
  pt: [
    ['Pelo app (imediato, versão 1.1.1 (89) ou superior)', 'Abra o Botón de Emergencias → ⚙️ Opções → Excluir conta. O app avisa que não é possível desfazer e pede confirmação. Ao confirmar, sua conta é excluída imediatamente.'],
    ['Sem o app (por e-mail)', `Se você não tem mais o app, escreva para ${correo} a partir do e-mail com que se cadastrou, com o assunto "Excluir minha conta", e inclua seu @usuário. Confirmamos que você é o titular e excluímos a conta em no máximo 15 dias úteis.`],
    ['O que é excluído', 'Seu perfil (nome, @usuário, e-mail, telefone e senha), seus vínculos familiares e solicitações, seus alertas, suas localizações compartilhadas, o registro de recuperações de celular, suas preferências e o identificador de notificações. São apagados definitivamente em no máximo 30 dias e não podem ser recuperados: se voltar, você deve se cadastrar do zero.'],
    ['O que não é excluído', 'Os registros de pagamento são guardados pelo Google Play conforme suas próprias políticas. Os alertas que você já enviou podem ter chegado como SMS ou WhatsApp aos celulares dos seus familiares: essas mensagens ficam nos telefones deles.'],
    ['Sua assinatura', 'Excluir a conta não cancela a assinatura do Google Play. Cancele em Google Play → Pagamentos e assinaturas para não continuar sendo cobrado.'],
    ['Apagar dados sem excluir a conta', `No app você pode apagar alertas do histórico, remover familiares, parar de compartilhar sua localização e desativar Recuperar celular. Para qualquer outro dado, escreva para ${correo}.`],
  ],
}

const CONTENT = {}
for (const l of ['es', 'en', 'pt']) {
  const L = LEGAL[l], t = T[l]
  const meta = [[t.resp, R.nombre], [t.app, NOMBRE_APP[l]], [t.contacto, R.correo], [t.tel, R.telefono], [t.vig, FECHA[l]]]
  const docs = ['PRIVACIDAD', 'TERMINOS', 'CONTRATO', 'AVISO'].map((clave, i) => ({
    id: L.DOCS_META[i].id,
    eyebrow: NOMBRE_APP[l],
    title: L.DOCS_META[i].titulo,
    meta,
    sections: L[clave].map(s => [titulo(s.titulo), esc(s.texto)]),
  }))
  docs.push({
    id: 'eliminar', eyebrow: NOMBRE_APP[l], title: t.eliminarTitulo,
    meta: [[t.resp, R.nombre], [t.contacto, R.correo], [t.tel, R.telefono], [t.plazo, t.plazoTxt], [t.vig, FECHA[l]]],
    sections: ELIMINAR[l],
  })
  CONTENT[l] = { brandSub: `${R.nombre} · ${t.sub}`, tabs: [...L.DOCS_META.map(d => d.titulo), t.eliminar], docs }
}

// La marca de "Generado por…" de la vez anterior se quita para no repetirla
let html = fs.readFileSync(PAGINA, 'utf8').replace(/\/\/ Generado por scripts\/generar-pagina-legal\.mjs[^\n]*\n/g, '')
const ini = html.indexOf('const CONTENT = {')
const fin = html.indexOf('const docIds')
if (ini < 0 || fin < 0) throw new Error('No encontré el bloque CONTENT en la página')
html = html.slice(0, ini) + `// Generado por scripts/generar-pagina-legal.mjs (versión ${VERSION_LEGAL}): mismos textos que la app\nconst CONTENT = ${JSON.stringify(CONTENT, null, 1)};\n\n` + html.slice(fin)
html = html
  .replace(/<title>[^<]*<\/title>/, '<title>Botón de Emergencias · Legal</title>')
  .replace(/alt="Botón de Emergencia"/g, 'alt="Botón de Emergencias"')
  .replace(/(id="brand-name">)Botón de Emergencia(<)/, '$1Botón de Emergencias$2')
  .replace(/(id="brand-sub">)[^<]*(<)/, `$1${esc(R.nombre)} · Documentos legales$2`)
  .replace(/<footer class="page-footer">[^<]*<\/footer>/, `<footer class="page-footer">${esc(R.nombre)} · ${esc(R.correo)} · ${esc(R.telefono)}</footer>`)
fs.writeFileSync(PAGINA, html)
console.log('Página legal generada:', PAGINA, `(${html.length} caracteres)`)
