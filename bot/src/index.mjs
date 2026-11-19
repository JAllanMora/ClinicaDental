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
import { rmSync, writeFileSync } from "node:fs";
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

async function onMessage(msg) {
  const jid = msg.key.remoteJid;
  if (!jid || isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid)) return;
  if (msg.key.fromMe) return;
  const text = textOf(msg.message);
  const phone = await senderPhone(msg.key);
  if (!phone) return log("No pude leer el número de", jid);
  if (!allowed(phone)) return log(`Ignoro ${normalizePhone(phone)} (modo prueba)`);
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
    const replies = (isAdmin && (await adminFlow.handle(normalizePhone(phone), text))) || (await flow.handle(phone, text));
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

async function connect() {
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
      await db.setStatus({ state: "desconectado", qr: null }).catch(() => {});
      if (code === DisconnectReason.loggedOut) {
        log("Se cerró la sesión desde el teléfono. Borro la sesión guardada y pido un QR nuevo.");
        rmSync(config.authDir, { recursive: true, force: true });
      } else {
        log(`Conexión cerrada (${code ?? "sin código"}). Reconectando…`);
      }
      setTimeout(connect, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) await onMessage(msg);
  });
}

setInterval(() => {
  flushQueue().catch((e) => log("Cola:", e.message));
  dailyReminders().catch(() => {});
  adminAlerts().catch((e) => log("Alertas:", e.message));
  if (sock?.user) db.setStatus({ last_seen: new Date().toISOString() }).catch(() => {});
}, 20_000);

process.on("SIGINT", async () => {
  await db.setStatus({ state: "desconectado", qr: null }).catch(() => {});
  process.exit(0);
});

log(
  config.testMode
    ? `Iniciando bot de WhatsApp en MODO PRUEBA (sólo atiende a: ${config.testNumbers.join(", ") || "nadie"}).`
    : "Iniciando bot de WhatsApp en modo producción.",
);
connect();
