import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isLidUser,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
} from "baileys";
import { exec } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { loadConfig } from "./config.mjs";
import { createDb } from "./db.mjs";
import { clinicParts } from "./dates.mjs";
import { createFlow, normalizePhone } from "./flow.mjs";
import { createAdminFlow, runAdminAlerts } from "./admin.mjs";
import { runRecalls } from "./recalls.mjs";
import { LATE_AFTER_SECONDS, LATE_PREFIX, handledStore, msgSeconds, pickPending } from "./catchup.mjs";

const config = loadConfig();
const db = createDb({ url: config.supabaseUrl, serviceKey: config.serviceKey, humanPauseHours: config.humanPauseHours });
const flow = createFlow(db);
const adminFlow = createAdminFlow(db);
const logger = pino({ level: process.env.BOT_LOG_LEVEL ?? "warn" });
const log = (...args) => console.log(new Date().toLocaleTimeString("es-MX"), ...args);

let sock = null;

/** bot/qr.html: el código para vincular, por si la app no está abierta. Se abre sola la primera vez. */
const QR_PAGE = resolve(dirname(fileURLToPath(import.meta.url)), "../qr.html");
let qrOpened = false;
async function writeQrPage(qr) {
  const body = qr
    ? `<h1>Vincula WhatsApp</h1><p>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p><img src="${await QRCode.toDataURL(qr, { width: 320, margin: 1 })}" alt="Código QR">`
    : "<h1>Bot conectado ✓</h1><p>Ya puedes cerrar esta página.</p>";
  writeFileSync(
    QR_PAGE,
    `<!doctype html><html lang="es"><meta charset="utf-8">${qr ? '<meta http-equiv="refresh" content="5">' : ""}<title>Bot WhatsApp</title>` +
      `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;background:#faf5fb;color:#3b0a3a}img{border:8px solid #fff;border-radius:12px}</style><body>${body}</body></html>`,
  );
  if (qr && !qrOpened) {
    qrOpened = true;
    const open = process.platform === "win32" ? `start "" "${QR_PAGE}"` : process.platform === "darwin" ? `open "${QR_PAGE}"` : `xdg-open "${QR_PAGE}"`;
    exec(open, () => {});
  }
}

/** En modo prueba sólo se atiende a los números de BOT_NUMEROS_PRUEBA. */
const allowed = (phone) => !config.testMode || config.testNumbers.includes(String(phone).replace(/\D/g, "").slice(-10));

/** Número del remitente: en chats nuevos WhatsApp manda un LID en lugar del teléfono. */
async function senderPhone(key) {
  const candidates = [key.remoteJidAlt, key.senderPn, key.remoteJid].filter(Boolean);
  const pn = candidates.find((j) => j.endsWith("@s.whatsapp.net"));
  if (pn) return jidNormalizedUser(pn).split("@")[0];
  if (isLidUser(key.remoteJid)) {
    const mapped = await sock.signalRepository.lidMapping.getPNForLID(key.remoteJid).catch(() => null);
    if (mapped) return jidNormalizedUser(mapped).split("@")[0];
  }
  return null;
}

function textOf(message) {
  const m = normalizeMessageContent(message);
  if (!m) return null;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.imageMessage?.caption ??
    null
  );
}

/** Ids de mensajes ya contestados (sobrevive reinicios): nunca se contesta dos veces el mismo. */
const handled = handledStore(resolve(dirname(fileURLToPath(import.meta.url)), "../handled.json"));
const isChat = (jid) => !isJidGroup(jid) && !isJidBroadcast(jid) && !isJidNewsletter(jid) && !jid.endsWith("@status");

async function onMessage(msg, { late = false } = {}) {
  const jid = msg.key.remoteJid;
  if (!jid || !isChat(jid)) return;
  if (msg.key.fromMe) return;
  if (handled.has(msg.key.id)) return;
  const text = textOf(msg.message);
  const phone = await senderPhone(msg.key);
  if (!phone) return log("No pude leer el número de", jid);
  if (!allowed(phone)) return log(`Ignoro ${normalizePhone(phone)} (modo prueba)`);
  handled.add(msg.key.id);
  if (late) log(`↺ pendiente de ${normalizePhone(phone)} (llegó con el bot apagado)`);
  if (text == null) {
    await sock.sendMessage(jid, { text: "Por ahora sólo entiendo mensajes de texto. Escribe menú para ver las opciones." });
    return;
  }
  log(`← ${normalizePhone(phone)}: ${text}`);
  try {
    await sock.readMessages([msg.key]);
    await sock.sendPresenceUpdate("composing", jid);
    // Números de administrador: entradas de inventario y alertas; lo demás sigue al menú normal.
    const settings = await db.settings();
    const isAdmin = (settings.admin_phones ?? []).includes(normalizePhone(phone));
    const replies = [...((isAdmin && (await adminFlow.handle(normalizePhone(phone), text))) || (await flow.handle(phone, text)))];
    if (late && replies.length) replies[0] = `${LATE_PREFIX} ${replies[0]}`;
    for (const body of replies) {
      await sock.sendMessage(jid, { text: body });
      log(`→ ${normalizePhone(phone)}: ${body.split("\n")[0]}`);
    }
  } catch (e) {
    log("Error al contestar:", e.message);
    await sock.sendMessage(jid, { text: "Tuve un problema para contestarte. Escribe 3 y recepción te ayuda." }).catch(() => {});
  } finally {
    await sock.sendPresenceUpdate("paused", jid).catch(() => {});
  }
}

/**
 * Mensajes pendientes de cuando el bot estuvo apagado: se juntan unos segundos (llegan en tandas)
 * y se contesta sólo el último de cada chat, si nadie respondió después y es de las últimas horas.
 */
let pending = [];
let pendingTimer = null;
function queuePending(msg) {
  if (!msg?.key?.remoteJid) return;
  pending.push(msg);
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => flushPending().catch((e) => log("Pendientes:", e.message)), 5000);
}
async function flushPending() {
  const batch = pending;
  pending = [];
  const picked = pickPending(batch, { nowSec: Date.now() / 1000, maxHours: config.pendingHours, handled, isChat });
  for (const msg of picked) await onMessage(msg, { late: true });
}

/** Envía los recordatorios que el sistema dejó en cola (notifications "pendiente" por WhatsApp). */
async function flushQueue() {
  if (!sock?.user) return;
  for (const n of await db.queuedNotifications()) {
    try {
      const digits = String(n.recipient).replace(/\D/g, "");
      if (!allowed(digits)) {
        await db.markNotification(n.id, { status: "fallido", error: "Modo prueba: número fuera de BOT_NUMEROS_PRUEBA" });
        continue;
      }
      const [found] = await sock.onWhatsApp(digits);
      if (!found?.exists) {
        await db.markNotification(n.id, { status: "fallido", error: "El número no tiene WhatsApp" });
        continue;
      }
      await sock.sendMessage(found.jid, { text: n.body });
      await db.markNotification(n.id, { status: "enviado" });
      await db.log({ phone: normalizePhone(digits), patientId: n.patient_id, direction: "saliente", body: n.body });
      log(`→ recordatorio a ${digits}`);
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000)); // ritmo humano
    } catch (e) {
      await db.markNotification(n.id, { status: "fallido", error: e.message }).catch(() => {});
    }
  }
}

/** Envía un mensaje a un número de 10 dígitos (México) o internacional. */
async function sendTo(phone, body) {
  const digits = String(phone).replace(/\D/g, "");
  const [found] = await sock.onWhatsApp(digits.length === 10 ? `52${digits}` : digits);
  if (!found?.exists) throw new Error("El número no tiene WhatsApp");
  await sock.sendMessage(found.jid, { text: body });
  await db.log({ phone: normalizePhone(digits), direction: "saliente", body });
}

/**
 * Seguimientos (el doctor pidió recordarle al paciente regresar): se revisan cada hora entre la hora
 * de recordatorios y las 7 p. m. Cada seguimiento cambia de estado al enviarse, así que no se repite.
 */
let lastRecallCheck = 0;
async function recallReminders() {
  if (!sock?.user || Date.now() - lastRecallCheck < 60 * 60_000) return;
  const { minutes } = clinicParts(new Date().toISOString());
  if (minutes < config.reminderHour * 60 || minutes >= 19 * 60) return;
  lastRecallCheck = Date.now();
  const summary = await runRecalls(db, {
    allowed,
    send: async (phone, body) => {
      await sendTo(phone, body);
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000)); // ritmo humano
    },
  });
  if (summary.enviados || summary.agendados) log("Seguimientos:", JSON.stringify(summary));
}

/**
 * Alertas para los administradores: un resumen diario a la hora configurada y, el resto del día,
 * sólo las alertas nuevas. Una alerta ya avisada no se repite hasta que se resuelve y vuelve a aparecer.
 */
let lastAlertCheck = 0;
async function adminAlerts() {
  if (!sock?.user || Date.now() - lastAlertCheck < 5 * 60_000) return;
  lastAlertCheck = Date.now();
  const settings = await db.settings();
  const recipients = (settings.admin_phones ?? []).filter((p) => allowed(p));
  if (!settings.alerts_enabled || !recipients.length) return;

  const body = await runAdminAlerts(db, {
    recipients,
    alertHour: settings.alert_hour,
    send: (p, text) => sendTo(p, text).catch((e) => log(`No pude avisar a ${p}:`, e.message)),
  });
  if (body) log("→ alertas a administradores");
}

/** Una vez al día, a la hora configurada, pide a la app que prepare los recordatorios. */
let lastReminderDay = null;
async function dailyReminders() {
  if (!config.cronSecret) return;
  const { day, minutes } = clinicParts(new Date().toISOString());
  if (day === lastReminderDay || minutes < config.reminderHour * 60) return;
  lastReminderDay = day;
  try {
    const res = await fetch(`${config.appUrl}/api/cron/recordatorios`, { headers: { Authorization: `Bearer ${config.cronSecret}` } });
    log("Recordatorios del día:", JSON.stringify(await res.json()));
  } catch (e) {
    lastReminderDay = null;
    log("No pude pedir los recordatorios a la app:", e.message);
  }
}

/** ¿Hay una sesión de WhatsApp vinculada guardada? Sin ella, el bot espera a que pidan «Conectar» en la app. */
const hasSession = () => existsSync(resolve(config.authDir, "creds.json"));
let connecting = false;

async function connect() {
  if (connecting) return;
  connecting = true;
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  sock = makeWASocket({ auth: state, version, logger, browser: ["Clínica Villa San Juan", "Chrome", "1.0"], markOnlineOnConnect: false });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      log("Escanea este código en WhatsApp → Dispositivos vinculados (también aparece en el sistema, Agenda → WhatsApp):");
      qrcode.generate(qr, { small: true });
      await writeQrPage(qr).catch(() => {});
      await db.setStatus({ state: "esperando_qr", qr }).catch(() => {});
    }
    if (connection === "open") {
      const phone = sock.user?.id ? jidNormalizedUser(sock.user.id).split("@")[0] : null;
      log(`Conectado como ${phone}`);
      await writeQrPage(null).catch(() => {});
      await db.setStatus({ state: "conectado", qr: null, phone, last_seen: new Date().toISOString() }).catch(() => {});
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      sock = null;
      connecting = false;
      await db.setStatus({ state: "desconectado", qr: null }).catch(() => {});
      if (code === DisconnectReason.loggedOut) {
        log("Se cerró la sesión desde el teléfono. Borro la sesión guardada; para vincular otra vez presiona «Conectar» en la app.");
        rmSync(config.authDir, { recursive: true, force: true });
        return;
      }
      if (!state.creds.registered) {
        log("Nadie escaneó el código a tiempo. Presiona «Conectar» en la app para generar otro.");
        return;
      }
      log(`Conexión cerrada (${code ?? "sin código"}). Reconectando…`);
      setTimeout(connect, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    const nowSec = Date.now() / 1000;
    for (const msg of messages) {
      // Lo que llegó con el bot apagado (append, o notify con hora vieja) se junta y se revisa por chat.
      if (type !== "notify" || nowSec - msgSeconds(msg) > LATE_AFTER_SECONDS) queuePending(msg);
      else await onMessage(msg);
    }
  });
  sock.ev.on("messaging-history.set", ({ messages }) => {
    for (const msg of messages ?? []) queuePending(msg);
  });
}

setInterval(() => {
  flushQueue().catch((e) => log("Cola:", e.message));
  dailyReminders().catch(() => {});
  recallReminders().catch((e) => log("Seguimientos:", e.message));
  adminAlerts().catch((e) => log("Alertas:", e.message));
  const now = new Date().toISOString();
  // Latido del programa (aunque WhatsApp no esté vinculado): la app sabe si la computadora está prendida.
  db.setStatus(sock?.user ? { bot_seen_at: now, last_seen: now } : { bot_seen_at: now }).catch(() => {});
}, 20_000);

/** Botón «Conectar» de la app: si no hay conexión, conecta (con sesión) o genera el código QR. */
let lastConnectRequest = Date.now() - 10 * 60_000; // una petición de hace poco (con la PC apagada) también cuenta
setInterval(async () => {
  try {
    const status = await db.status();
    const requested = status?.connect_requested_at ? new Date(status.connect_requested_at).getTime() : 0;
    if (requested <= lastConnectRequest) return;
    lastConnectRequest = requested;
    if (sock || connecting) return log("Piden conectar: ya hay una conexión en curso.");
    log("Piden conectar desde la app.");
    await db.setStatus({ bot_seen_at: new Date().toISOString() }).catch(() => {});
    connect().catch((e) => {
      connecting = false;
      log("No pude conectar:", e.message);
    });
  } catch {
    /* sin internet: se reintenta */
  }
}, 5_000);

/** Una sola copia del bot por computadora (si arranca dos veces, dos sesiones se pelean el número). */
const LOCK = resolve(dirname(fileURLToPath(import.meta.url)), "../bot.pid");
try {
  const other = Number(readFileSync(LOCK, "utf8"));
  if (other && other !== process.pid) {
    process.kill(other, 0); // lanza si ya no existe
    console.log(`El bot ya está corriendo (proceso ${other}). Cierro esta copia.`);
    process.exit(0);
  }
} catch {
  /* no hay otra copia */
}
writeFileSync(LOCK, String(process.pid));
const releaseLock = () => {
  try {
    if (readFileSync(LOCK, "utf8") === String(process.pid)) rmSync(LOCK);
  } catch {
    /* ya no está */
  }
};
process.on("exit", releaseLock);

async function shutdown() {
  await db.setStatus({ state: "desconectado", qr: null, bot_seen_at: null }).catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log(
  config.testMode
    ? `Iniciando bot de WhatsApp en MODO PRUEBA (sólo atiende a: ${config.testNumbers.join(", ") || "nadie"}).`
    : "Iniciando bot de WhatsApp en modo producción.",
);
db.setStatus({ state: "desconectado", qr: null, bot_seen_at: new Date().toISOString() }).catch(() => {});
if (hasSession()) connect();
else log("No hay WhatsApp vinculado. Presiona «Conectar» en la app (WhatsApp) para ver el código QR.");
