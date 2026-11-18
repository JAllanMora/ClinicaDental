import { addMinutes, clinicParts, dayLabel, nextDayStart, timeLabel, whenLabel } from "./dates.mjs";

/**
 * Conversación del bot. No sabe nada de WhatsApp: recibe el teléfono y el texto
 * y regresa las respuestas, para poder probarla sin conexión.
 *
 * Menú principal:
 *   1 Agendar cita · 2 Mis citas (confirmar, cambiar, cancelar) · 3 Hablar con recepción
 * Fuera de una conversación, "1" o "2" contestan al último recordatorio.
 */

const SESSION_MINUTES = 30;
const MAX_OPTIONS = 6;
const RESET_WORDS = new Set(["menu", "menú", "hola", "inicio", "buenas", "buenos dias", "buenos días", "buenas tardes", "buenas noches"]);

/** Teléfono de 10 dígitos para México (quita 52 / 521); otros países quedan completos. */
export function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("521")) return digits.slice(3);
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  return digits;
}

/** Escoge pocas opciones repartidas: la primera de la mañana y la primera de la tarde de cada día. */
export function pickOptions(slots, max = MAX_OPTIONS) {
  const seen = new Set();
  const picked = [];
  for (const s of slots) {
    const { day, minutes } = clinicParts(s.starts_at);
    const key = `${day}-${minutes < 14 * 60 ? "am" : "pm"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(s);
    if (picked.length === max) break;
  }
  return picked;
}

function clean(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.!¡¿?]/g, "")
    .trim();
}

function choice(text) {
  const m = clean(text).match(/^(\d{1,2})\b/);
  return m ? Number(m[1]) : null;
}

const HUMAN = /\b(recepcion|recepcionista|humano|persona|asesor|alguien)\b/;
const YES = /^(1|si|sí|confirmo|confirmar|ok|va|claro)\b/;
const CHANGE = /^(2|cambiar|cambio|reagendar|no puedo)\b/;

/** "Ana Pérez" · "Ana Pérez López" (un nombre, dos apellidos) · "Ana María Pérez López". */
function splitName(full) {
  const parts = full.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length < 2) return null;
  const names = parts.length >= 4 ? 2 : 1;
  return { firstName: parts.slice(0, names).join(" "), lastName: parts.slice(names).join(" ") };
}

const title = (s) => s.replace(/(^|\s)(\p{L})/gu, (m, sp, c) => sp + c.toUpperCase());

export function createFlow(db, { now = () => new Date() } = {}) {
  /** phone → { step, data, at } */
  const sessions = new Map();

  const menuText = (name) =>
    [
      `¿En qué te ayudo${name ? `, ${name}` : ""}? Responde con el número:`,
      "1. Agendar una cita",
      "2. Mis citas (confirmar, cambiar o cancelar)",
      "3. Hablar con recepción",
    ].join("\n");

  function set(phone, step, data = {}) {
    sessions.set(phone, { step, data, at: now().getTime() });
  }

  async function offerSlots(phone, ctx, from) {
    const settings = await db.settings();
    const earliest = addMinutes(now().toISOString(), settings.min_notice_minutes);
    const start = from && from > earliest ? from : earliest;
    const end = addMinutes(earliest, settings.days_ahead * 24 * 60);
    if (start >= end) {
      set(phone, "menu", {});
      return [`No encontré horarios libres en los próximos ${settings.days_ahead} días. Escribe 3 para que recepción te ayude.`];
    }
    const slots = await db.slots(ctx.type.duration_minutes, start, end, ctx.preferDentist ?? null);
    const options = pickOptions(slots);
    if (!options.length) {
      set(phone, "menu", {});
      return [`No encontré horarios libres en los próximos ${settings.days_ahead} días para ${ctx.type.name.toLowerCase()}. Escribe 3 para que recepción te ayude.`];
    }
    set(phone, "pick_slot", { ...ctx, options, next: nextDayStart(options.at(-1).starts_at) });
    const lines = options.map((s, i) => {
      const { day, minutes } = clinicParts(s.starts_at);
      return `${i + 1}. ${title(dayLabel(day))}, ${timeLabel(minutes)} con ${s.dentist_name}`;
    });
    return [[`Estos son los próximos horarios para ${ctx.type.name.toLowerCase()}:`, ...lines, "0. Ver más fechas"].join("\n")];
  }

  async function startBooking(phone, patient, extra = {}) {
    const settings = await db.settings();
    if (!settings.types.length) {
      set(phone, "menu", {});
      return ["Por ahora no puedo agendar por aquí. Escribe 3 y recepción te ayuda."];
    }
    const ctx = { patientId: patient?.id ?? null, patientName: patient?.first_name ?? null, preferDentist: patient?.primary_dentist_id ?? null, ...extra };
    if (!patient) {
      set(phone, "ask_name", ctx);
      return ["Con gusto. ¿A nombre de quién es la cita? Escribe nombre y apellido."];
    }
    if (extra.type) return offerSlots(phone, ctx);
    return askType(phone, ctx, settings.types);
  }

  function askType(phone, ctx, types) {
    if (types.length === 1) return offerSlots(phone, { ...ctx, type: types[0] });
    set(phone, "pick_type", { ...ctx, types });
    return [["¿Qué tipo de cita necesitas?", ...types.map((t, i) => `${i + 1}. ${t.name}`)].join("\n")];
  }

  async function listAppointments(phone, patient) {
    if (!patient) {
      set(phone, "menu", {});
      return ["No encontré citas con este número. Escribe 1 para agendar o 3 para hablar con recepción."];
    }
    const appts = await db.upcoming(patient.id);
    if (!appts.length) {
      set(phone, "menu", { patientId: patient.id });
      return ["No tienes citas próximas. Escribe 1 para agendar una."];
    }
    if (appts.length === 1) return apptActions(phone, patient, appts[0]);
    set(phone, "pick_appt", { patientId: patient.id, appts });
    const lines = appts.map((a, i) => `${i + 1}. ${title(whenLabel(a.starts_at))} con ${a.dentist?.full_name ?? "tu odontólogo"}`);
    return [["Tus próximas citas. ¿Cuál quieres ver?", ...lines].join("\n")];
  }

  function apptActions(phone, patient, appt) {
    set(phone, "appt_action", { patientId: patient.id, patientName: patient.first_name, appt });
    const status = appt.status === "confirmada" ? " (confirmada)" : "";
    return [
      [
        `Tu cita: ${whenLabel(appt.starts_at)} con ${appt.dentist?.full_name ?? "tu odontólogo"}${status}.`,
        "1. Confirmar",
        "2. Cambiar de horario",
        "3. Cancelar",
        "0. Volver al menú",
      ].join("\n"),
    ];
  }

  async function handoff(phone, patient, text) {
    const settings = await db.settings();
    await db.log({ phone, patientId: patient?.id ?? null, direction: "entrante", body: `Pide hablar con recepción: "${text}"`, needsAttention: true });
    set(phone, "human", {});
    return [settings.handoff_message];
  }

  /** Respuesta a un recordatorio ("1" confirma, "2" cambia) fuera de una conversación. */
  async function reminderReply(phone, patient, text) {
    if (!patient) return null;
    const t = clean(text);
    if (!YES.test(t) && !CHANGE.test(t)) return null;
    const soon = addMinutes(now().toISOString(), 4 * 24 * 60);
    const appt = (await db.upcoming(patient.id)).find((a) => a.reminder_sent_at && !a.patient_response && a.starts_at <= soon);
    if (!appt) return null;
    if (YES.test(t)) {
      await db.respond(appt.confirm_token, "confirmada");
      set(phone, "idle", {});
      return [`¡Gracias, ${patient.first_name}! Tu cita del ${whenLabel(appt.starts_at)} quedó confirmada. Te esperamos.`];
    }
    await db.respond(appt.confirm_token, "cambio");
    return startBooking(phone, patient, { type: appt.type ?? null, replaces: appt });
  }

  async function handle(rawPhone, text) {
    const phone = normalizePhone(rawPhone);
    const settings = await db.settings();
    if (!settings.enabled) return [];

    const patient = await db.findPatient(phone);
    await db.log({ phone, patientId: patient?.id ?? null, direction: "entrante", body: String(text ?? "") });

    const t = clean(text);
    let session = sessions.get(phone);
    if (session && now().getTime() - session.at > SESSION_MINUTES * 60_000) session = undefined;

    // Recepción tiene la conversación: el bot calla hasta que la marquen como atendida o el paciente escriba "menú".
    if (RESET_WORDS.has(t)) {
      if (await db.waitingForHuman(phone)) await db.releaseHuman(phone);
      session = undefined;
    } else if ((session?.step === "human" || !session) && (await db.waitingForHuman(phone))) {
      return [];
    }

    const replies = await step(phone, patient, session, text, t, settings);
    for (const body of replies) await db.log({ phone, patientId: patient?.id ?? null, direction: "saliente", body });
    return replies;
  }

  async function step(phone, patient, session, text, t, settings) {
    // "Quiero hablar con recepción" en cualquier momento.
    if (HUMAN.test(t) && session?.step !== "ask_name") return handoff(phone, patient, text);
    if (!session || session.step === "idle" || session.step === "human") {
      const reply = RESET_WORDS.has(t) ? null : await reminderReply(phone, patient, text);
      if (reply) return reply;
      set(phone, "menu", {});
      const hello = settings.welcome_message.replace("{nombre}", patient ? ` ${patient.first_name}` : "");
      return [`${hello}\n\n${menuText(null)}`];
    }

    const { step: current, data } = session;
    const n = choice(text);

    switch (current) {
      case "menu":
        if (n === 1) return startBooking(phone, patient);
        if (n === 2) return listAppointments(phone, patient);
        if (n === 3) return handoff(phone, patient, text);
        return [`Responde con 1, 2 o 3.\n\n${menuText(null)}`];

      case "ask_name": {
        const name = splitName(String(text));
        if (!name || name.firstName.length > 60) return ["Escribe tu nombre y apellido, por ejemplo: Ana Pérez"];
        const created = await db.createPatient({ firstName: title(name.firstName), lastName: title(name.lastName), phone });
        return askType(phone, { ...data, patientId: created.id, patientName: created.first_name }, settings.types);
      }

      case "pick_type": {
        const type = n ? data.types[n - 1] : null;
        if (!type) return [`Responde con un número del 1 al ${data.types.length}.`];
        return offerSlots(phone, { ...data, type, types: undefined });
      }

      case "pick_slot": {
        if (n === 0) return offerSlots(phone, data, data.next);
        const slot = n ? data.options[n - 1] : null;
        if (!slot) return [`Responde con un número del 1 al ${data.options.length}, o 0 para ver más fechas.`];
        set(phone, "confirm_slot", { ...data, slot });
        return [`¿Te agendo ${data.type.name.toLowerCase()} el ${whenLabel(slot.starts_at)} con ${slot.dentist_name}?\n1. Sí\n2. Elegir otro horario`];
      }

      case "confirm_slot": {
        if (n === 2) return offerSlots(phone, data);
        if (n !== 1) return ["Responde 1 para confirmar o 2 para elegir otro horario."];
        const created = await db.createAppointment({ patientId: data.patientId, slot: data.slot, type: data.type });
        if (!created) {
          return [`Ese horario se acaba de ocupar. Te muestro otros:`, ...(await offerSlots(phone, data))];
        }
        if (data.replaces) await db.cancel(data.replaces.id, "Cambio de horario solicitado por el paciente vía WhatsApp");
        set(phone, "idle", {});
        return [
          `¡Listo${data.patientName ? `, ${data.patientName}` : ""}! Tu cita quedó para el ${whenLabel(data.slot.starts_at)} con ${data.slot.dentist_name}.` +
            (data.replaces ? ` Cancelé la del ${whenLabel(data.replaces.starts_at)}.` : "") +
            " Un día antes te mando recordatorio. Si necesitas algo más, escribe menú.",
        ];
      }

      case "pick_appt": {
        const appt = n ? data.appts[n - 1] : null;
        if (!appt) return [`Responde con un número del 1 al ${data.appts.length}.`];
        return apptActions(phone, patient, appt);
      }

      case "appt_action": {
        const { appt } = data;
        if (n === 0) {
          set(phone, "menu", {});
          return [menuText(patient?.first_name)];
        }
        if (n === 1) {
          const ok = await db.respond(appt.confirm_token, "confirmada");
          set(phone, "idle", {});
          return [ok ? `Confirmada tu cita del ${whenLabel(appt.starts_at)}. ¡Te esperamos!` : "Esa cita ya no se puede confirmar. Escribe 3 para hablar con recepción."];
        }
        if (n === 2) return startBooking(phone, patient, { type: appt.type ?? null, replaces: appt });
        if (n === 3) {
          set(phone, "confirm_cancel", data);
          return [`¿Seguro que quieres cancelar tu cita del ${whenLabel(appt.starts_at)}?\n1. Sí, cancelar\n2. No`];
        }
        return ["Responde con 1, 2, 3 o 0."];
      }

      case "confirm_cancel": {
        if (n === 1) {
          await db.cancel(data.appt.id, "Cancelada por el paciente vía WhatsApp");
          set(phone, "idle", {});
          return ["Tu cita quedó cancelada. Cuando quieras agendar otra, escribe menú."];
        }
        set(phone, "idle", {});
        return ["Perfecto, tu cita sigue en pie."];
      }

      default:
        set(phone, "menu", {});
        return [menuText(patient?.first_name)];
    }
  }

  return { handle, sessions };
}
