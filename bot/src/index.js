import { exec } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { config } from "./config.js";
import { handleMessage } from "./conversation.js";
import { allowed, runReminders } from "./reminders.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AUTH_DIR = path.join(root, "auth"); // sesión de WhatsApp: NO subir a git
const QR_PAGE = path.join(root, "qr.html");

function writeStatus(body, refresh) {
  writeFileSync(
    QR_PAGE,
    `<!doctype html><html lang="es"><meta charset="utf-8">${refresh ? '<meta http-equiv="refresh" content="5">' : ""}<title>Bot WhatsApp</title>` +
      `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;background:#faf5fb;color:#3b0a3a}img{border:8px solid #fff;border-radius:12px}.s{color:#777;font-size:14px}</style>` +
      `<body>${body}</body></html>`,
  );
}

const log = pino({ level: process.env.BOT_LOG ?? "info" });
const quiet = pino({ level: "silent" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let reminderTimer;
let qrOpened = false;

function textOf(m) {
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.buttonsResponseMessage?.selectedDisplayText ??
    m?.listResponseMessage?.title ??
    m?.ephemeralMessage?.message?.conversation ??
    m?.ephemeralMessage?.message?.extendedTextMessage?.text ??
    null
  );
}

/** Número (sólo dígitos) de quien escribe; WhatsApp a veces manda un identificador @lid en lugar del número. */
async function senderPhone(sock, key) {
  let jid = key.remoteJid;
  if (jid.endsWith("@lid")) {
    jid = key.remoteJidAlt ?? key.senderPn ?? (await sock.signalRepository?.lidMapping?.getPNForLID(jid).catch(() => null));
  }
  return jid?.endsWith("@s.whatsapp.net") ? jid.split("@")[0].split(":")[0] : null;
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const sock = makeWASocket({
    version,
    auth: state,
    logger: quiet,
    browser: Browsers.windows("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const img = await QRCode.toDataURL(qr, { width: 420, margin: 2 });
      writeStatus(
        `<h1>Vincula el WhatsApp de la clínica</h1><p>En el teléfono: WhatsApp › <b>Dispositivos vinculados</b> › <b>Vincular un dispositivo</b> y escanea este código.</p><img src="${img}" alt="QR"><p class="s">El código cambia cada ~20 segundos; esta página se actualiza sola.</p>`,
        true,
      );
      console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
      log.info(`Escanea el QR (también en ${QR_PAGE})`);
      if (!qrOpened && process.platform === "win32") {
        qrOpened = true;
        exec(`start "" "${QR_PAGE}"`);
      }
    }
    if (connection === "open") {
      writeStatus(`<h1>✅ WhatsApp conectado</h1><p>El bot está atendiendo como <b>${sock.user?.id?.split(":")[0]}</b>. Ya puedes cerrar esta página.</p>`, false);
      log.info(`✅ Conectado como ${sock.user?.id}. Modo: ${config.production ? "PRODUCCIÓN" : `PRUEBA (sólo ${config.testNumbers.join(", ") || "ningún número"})`}`);
      clearInterval(reminderTimer);
      runReminders(sock, log);
      reminderTimer = setInterval(() => runReminders(sock, log), config.reminderEveryMinutes * 60_000);
    }
    if (connection === "close") {
      clearInterval(reminderTimer);
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        log.error("Se cerró la sesión desde el teléfono. Borra la carpeta bot/auth y vuelve a arrancar para escanear un QR nuevo.");
        process.exit(1);
      }
      log.warn({ code }, "Conexión cerrada, reconectando en 5 s…");
      setTimeout(start, 5000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid ?? "";
      if (msg.key.fromMe || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter") || jid.endsWith("@broadcast")) continue;
      const text = textOf(msg.message);
      if (!text) continue;
      const phone = await senderPhone(sock, msg.key);
      if (!phone) continue;
      if (!allowed(phone)) {
        log.debug({ phone }, "ignorado (modo prueba)");
        continue;
      }
      try {
        const reply = await handleMessage(phone, text);
        if (!reply) continue;
        await sock.readMessages([msg.key]);
        await sock.sendPresenceUpdate("composing", jid);
        await sleep(800 + Math.min(reply.length * 15, 2500));
        await sock.sendMessage(jid, { text: reply });
      } catch (e) {
        log.error(e, "error al contestar");
        await sock.sendMessage(jid, { text: "Perdón, tuve un problema 😕 Intenta de nuevo en un momento o escribe *recepción*." }).catch(() => {});
      }
    }
  });
}

start();
