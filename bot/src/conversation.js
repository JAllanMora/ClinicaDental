import { config } from "./config.js";
import {
  appointmentTypes,
  availableDays,
  book,
  cancelAppointment,
  confirmAppointment,
  createPatient,
  findPatientByPhone,
  phoneKey,
  spread,
  upcomingAppointments,
} from "./db.js";
import { apptLabel, dayLabel, hourLabel } from "./time.js";

/** Estado de cada chat (en memoria; se olvida a los 30 min sin actividad). */
const sessions = new Map();
const SESSION_TTL = 30 * 60_000;
/** Chats que pidieron hablar con una persona: el bot no contesta hasta esta hora. */
const paused = new Map();

export function setSession(phone, state, ttl = SESSION_TTL) {
  sessions.set(phone, { ...state, at: Date.now(), ttl });
}

function getSession(phone) {
  const s = sessions.get(phone);
  if (!s || Date.now() - s.at > s.ttl) return null;
  return s;
}

const norm = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const pickNumber = (text, max) => {
  const n = Number(norm(text).match(/^\d+/)?.[0]);
  return n >= 1 && n <= max ? n : null;
};

const numbered = (items) => items.map((t, i) => `*${i + 1}.* ${t}`).join("\n");

const MENU = (name) =>
  `${name ? `Hola ${name} 👋` : "Hola 👋"} Soy el asistente de *${config.clinicName}*.\n\n` +
  `Escribe el número de lo que necesitas:\n` +
  numbered(["Agendar una cita", "Ver mis citas", "Confirmar mi cita", "Cancelar o cambiar mi cita", "Hablar con recepción"]) +
  `\n\nEn cualquier momento escribe *menú* para volver aquí.`;

const HUMAN = `Listo, le aviso a recepción para que te escriba en cuanto pueda. 🙌\n(Si quieres volver al asistente, escribe *menú*.)`;

/**
 * Procesa un mensaje y devuelve el texto de respuesta (o null para no contestar).
 * `phone` son sólo dígitos (p. ej. 5217711234567).
 */
export async function handleMessage(rawPhone, text) {
  const phone = phoneKey(rawPhone); // las sesiones se guardan por los últimos 10 dígitos
  const t = norm(text);
  const wantsMenu = /^(menu|inicio|hola|buen[oa]s?|0)\b/.test(t);

  if (paused.has(phone)) {
    if (!wantsMenu && Date.now() < paused.get(phone)) return null;
    paused.delete(phone);
  }
  if (/(recepcion|humano|persona|asesor|hablar con alguien)/.test(t)) return pause(phone);

  const patient = await findPatientByPhone(phone);
  const session = wantsMenu ? null : getSession(phone);

  if (session) return continueFlow(phone, patient, session, text);

  // Respuestas sueltas sin conversación activa.
  if (patient && /^(confirm|si\b|sí\b|ok\b)/.test(t)) return startConfirm(phone, patient);
  if (patient && /^(cancel|cambi)/.test(t)) return startCancel(phone, patient);
  if (/(agendar|cita|disponib|horario|consulta)/.test(t) && !wantsMenu) return startBooking(phone, patient);

  setSession(phone, { step: "menu" });
  return MENU(patient?.first_name);
}

function pause(phone) {
  paused.set(phone, Date.now() + config.humanPauseHours * 3600_000);
  sessions.delete(phone);
  return HUMAN;
}

async function continueFlow(phone, patient, s, text) {
  switch (s.step) {
    case "menu": {
      const n = pickNumber(text, 5);
      if (n === 1) return startBooking(phone, patient);
      if (n === 2) return listAppointments(phone, patient);
      if (n === 3) return startConfirm(phone, patient);
      if (n === 4) return startCancel(phone, patient);
      if (n === 5) return pause(phone);
      return `No entendí 🙏 Escribe un número del 1 al 5.\n\n${MENU(patient?.first_name)}`;
    }

    case "name": {
      const parts = text.trim().replace(/\s+/g, " ").split(" ");
      if (parts.length < 2 || text.length > 80) return "Por favor escríbeme tu *nombre y apellido* (por ejemplo: Ana Pérez García).";
      const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      const created = await createPatient({
        firstName: cap(parts[0]),
        lastName: parts.slice(1).map(cap).join(" "),
        phone,
      });
      return startBooking(phone, created, `Gracias, ${created.first_name}. Ya quedaste registrado(a). ✅\n\n`);
    }

    case "type": {
      const n = pickNumber(text, s.types.length);
      if (!n) return `Escribe el número del tipo de cita (1 a ${s.types.length}).`;
      return showDays(phone, patient, s.types[n - 1]);
    }

    case "day": {
      const n = pickNumber(text, s.days.length);
      if (!n) return `Escribe el número del día (1 a ${s.days.length}).`;
      const { day, slots } = s.days[n - 1];
      const shown = spread(slots);
      setSession(phone, { step: "slot", type: s.type, day, slots: shown });
      return `Horarios libres el *${dayLabel(day)}*:\n\n${numbered(shown.map(hourLabel))}\n\nEscribe el número del horario.`;
    }

    case "slot": {
      const n = pickNumber(text, s.slots.length);
      if (!n) return `Escribe el número del horario (1 a ${s.slots.length}).`;
      const minutes = s.slots[n - 1];
      setSession(phone, { step: "confirmBook", type: s.type, day: s.day, minutes });
      return `¿Te agendo *${s.type.name}* el *${dayLabel(s.day)}* a las *${hourLabel(minutes)}*?\n\n*1.* Sí, agendar\n*2.* Elegir otro horario`;
    }

    case "confirmBook": {
      const n = pickNumber(text, 2);
      if (n === 2) return showDays(phone, patient, s.type);
      if (n !== 1) return "Escribe *1* para agendar o *2* para elegir otro horario.";
      const res = await book({ patient, type: s.type, day: s.day, minutes: s.minutes });
      if (!res.ok) return showDays(phone, patient, s.type, "Ese horario se acaba de ocupar 😕 Estos siguen libres:\n\n");
      sessions.delete(phone);
      return (
        `¡Listo! ✅ Tu cita quedó agendada:\n\n🦷 ${s.type.name}\n📅 ${apptLabel(res.appointment.starts_at)}\n👩‍⚕️ ${res.dentist.full_name}\n\n` +
        `Te mandaremos un recordatorio antes de tu cita. Si necesitas cambiarla, escribe *menú*.`
      );
    }

    case "pickConfirm":
    case "pickCancel": {
      const n = pickNumber(text, s.appts.length);
      if (!n) return `Escribe el número de la cita (1 a ${s.appts.length}).`;
      const appt = s.appts[n - 1];
      return s.step === "pickConfirm" ? doConfirm(phone, appt) : askCancel(phone, appt);
    }

    case "reminder": {
      const n = pickNumber(text, 2) ?? (/^(confirm|si|ok)/.test(norm(text)) ? 1 : /^(cancel|cambi|no\b)/.test(norm(text)) ? 2 : null);
      if (n === 1) return doConfirm(phone, s.appt);
      if (n === 2) return askCancel(phone, s.appt);
      return "Escribe *1* para confirmar tu cita o *2* para cancelarla o cambiarla.";
    }

    case "cancelConfirm": {
      const n = pickNumber(text, 3);
      if (n === 3 || !n) {
        sessions.delete(phone);
        return n === 3 ? "Perfecto, tu cita sigue en pie. 👍" : "Escribe *1*, *2* o *3*.";
      }
      await cancelAppointment(s.appt.id);
      if (n === 2) return startBooking(phone, patient, "Tu cita anterior quedó cancelada. Vamos a buscar otro horario.\n\n");
      sessions.delete(phone);
      return "Tu cita quedó cancelada. Cuando quieras agendar otra, escribe *menú*. 👋";
    }

    default:
      sessions.delete(phone);
      return MENU(patient?.first_name);
  }
}

async function startBooking(phone, patient, prefix = "") {
  if (!patient) {
    setSession(phone, { step: "name" });
    return "Con gusto te agendo. Como es tu primera vez escribiéndonos, ¿me dices tu *nombre y apellido*?";
  }
  const types = await appointmentTypes();
  setSession(phone, { step: "type", types });
  return `${prefix}¿Qué tipo de cita necesitas?\n\n${numbered(types.map((x) => x.name))}\n\nSi no sabes, elige *Valoración / primera vez*.`;
}

async function showDays(phone, patient, type, prefix = "") {
  const days = await availableDays(type.duration_minutes, patient?.primary_dentist_id);
  if (!days.length) {
    sessions.delete(phone);
    return `${prefix}Por ahora no tengo horarios libres para *${type.name}* en los próximos ${config.daysAhead} días. Escribe *recepción* y te ayudamos a encontrar un espacio.`;
  }
  setSession(phone, { step: "day", type, days });
  return `${prefix}Días con horario libre para *${type.name}* (${type.duration_minutes} min):\n\n${numbered(
    days.map((d) => `${dayLabel(d.day)} · ${d.slots.length} horario${d.slots.length === 1 ? "" : "s"}`),
  )}\n\nEscribe el número del día.`;
}

async function listAppointments(phone, patient) {
  sessions.delete(phone);
  if (!patient) return "No encuentro citas con este número. Escribe *menú* y elige *1* para agendar.";
  const appts = await upcomingAppointments(patient.id);
  if (!appts.length) return "No tienes citas próximas. Escribe *menú* y elige *1* para agendar una.";
  return `Tus próximas citas:\n\n${appts.map(describe).join("\n\n")}\n\nEscribe *menú* para confirmar, cancelar o agendar.`;
}

const describe = (a) =>
  `📅 ${apptLabel(a.starts_at)}\n🦷 ${a.type?.name ?? a.reason ?? "Consulta"} · ${a.dentist?.full_name ?? ""}${a.status === "confirmada" ? " · ✅ confirmada" : ""}`;

async function startConfirm(phone, patient) {
  if (!patient) return "No encuentro citas con este número. Escribe *menú* para agendar.";
  const appts = await upcomingAppointments(patient.id);
  if (!appts.length) return "No tienes citas próximas por confirmar. Escribe *menú* para agendar una.";
  if (appts.length === 1) return doConfirm(phone, appts[0]);
  setSession(phone, { step: "pickConfirm", appts });
  return `¿Cuál cita quieres confirmar?\n\n${numbered(appts.map((a) => apptLabel(a.starts_at)))}`;
}

async function doConfirm(phone, appt) {
  await confirmAppointment(appt.id);
  sessions.delete(phone);
  return `¡Gracias! ✅ Tu cita del *${apptLabel(appt.starts_at)}* quedó confirmada. Te esperamos.`;
}

async function startCancel(phone, patient) {
  if (!patient) return "No encuentro citas con este número. Escribe *menú* para agendar.";
  const appts = await upcomingAppointments(patient.id);
  if (!appts.length) return "No tienes citas próximas. Escribe *menú* para agendar una.";
  if (appts.length === 1) return askCancel(phone, appts[0]);
  setSession(phone, { step: "pickCancel", appts });
  return `¿Cuál cita quieres cancelar o cambiar?\n\n${numbered(appts.map((a) => apptLabel(a.starts_at)))}`;
}

function askCancel(phone, appt) {
  setSession(phone, { step: "cancelConfirm", appt });
  return `Tu cita del *${apptLabel(appt.starts_at)}*:\n\n*1.* Cancelarla\n*2.* Cambiarla a otro día u hora\n*3.* Dejarla como está`;
}
