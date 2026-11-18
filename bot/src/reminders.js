import { config } from "./config.js";
import { setSession } from "./conversation.js";
import { logMessage, markReminded, pendingReminders, phoneKey, reminderSettings } from "./db.js";
import { addDays, apptLabel, nowMinutes, todayStr } from "./time.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = ([a, b]) => (a + Math.random() * (b - a)) * 1000;

export const allowed = (phone) => config.production || config.testNumbers.includes(phoneKey(phone)) || config.testNumbers.includes(phone);

let running = false;

/** Manda por WhatsApp los recordatorios pendientes (días antes según Configuración › Recordatorios). */
export async function runReminders(sock, log) {
  if (running || !config.remindersEnabled) return;
  const now = nowMinutes();
  if (now < config.reminderWindow.from || now > config.reminderWindow.to) return;
  running = true;
  try {
    const settings = await reminderSettings();
    if (!settings?.enabled) return;
    const day = addDays(todayStr(), settings.days_before);
    const appts = await pendingReminders(day);
    for (const a of appts) {
      const p = a.patient;
      if (!p?.phone || p.contact_preference !== "whatsapp") continue;
      const key = phoneKey(p.phone);
      if (!allowed(key)) continue; // modo prueba: sólo números autorizados

      const [found] = await sock.onWhatsApp(`52${key}`).catch(() => []);
      if (!found?.exists) {
        await logMessage({ appointmentId: a.id, patientId: p.id, recipient: key, body: "", kind: "recordatorio", status: "fallido", error: "El número no tiene WhatsApp" });
        await markReminded(a.id);
        continue;
      }

      const body =
        `Hola ${p.first_name} 👋 Te recordamos tu cita en *${config.clinicName}*:\n\n` +
        `📅 ${apptLabel(a.starts_at)}\n👩‍⚕️ ${a.dentist?.full_name ?? "tu odontólogo"}\n\n` +
        `Responde:\n*1.* Confirmo mi cita\n*2.* Necesito cancelar o cambiarla` +
        (settings.clinic_phone ? `\n\nDudas: ${settings.clinic_phone}` : "");
      try {
        await sock.sendMessage(found.jid, { text: body });
        await logMessage({ appointmentId: a.id, patientId: p.id, recipient: key, body, kind: "recordatorio" });
        await markReminded(a.id);
        setSession(key, { step: "reminder", appt: { id: a.id, starts_at: a.starts_at } }, 36 * 3600_000);
        log.info({ appt: a.id }, "recordatorio enviado");
      } catch (e) {
        await logMessage({ appointmentId: a.id, patientId: p.id, recipient: key, body, kind: "recordatorio", status: "fallido", error: String(e?.message ?? e) });
      }
      await sleep(rand(config.reminderGap));
    }
  } catch (e) {
    log.error(e, "error en recordatorios");
  } finally {
    running = false;
  }
}
