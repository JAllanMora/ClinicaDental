// Seguimientos: el doctor pidió recordarle al paciente regresar (p. ej. limpieza en 6 meses).
// Cada día el bot les escribe a los que ya les toca y les ofrece agendar; si no contestan,
// a los 7 días manda un segundo y último mensaje.
import { addMinutes, clinicParts } from "./dates.mjs";

export const SECOND_AFTER_DAYS = 7;
/** Días que un «sí» / «no» suelto se toma como respuesta al seguimiento. */
export const REPLY_WINDOW_DAYS = 14;
/** Si el paciente agenda, también se cierran los seguimientos que vencen dentro de estos días. */
export const BOOKED_SOON_DAYS = 45;

const doctorOf = (r) => r.dentist?.full_name ?? "tu doctor";

export function recallMessage(r, { second = false } = {}) {
  const reason = r.reason.trim().replace(/\.$/, "");
  const lines = second
    ? [`Hola ${r.patient.first_name}, te escribo de nuevo: ${doctorOf(r)} te recomendó regresar para ${lowerFirst(reason)}.`, "¿Te ayudo a agendar?"]
    : [`Hola ${r.patient.first_name} 👋 Te escribimos de la clínica: ${doctorOf(r)} te recomendó regresar para ${lowerFirst(reason)}.`, "¿Quieres agendar tu cita?"];
  return [...lines, "1. Sí, agendar", "2. Ahora no", "", "También puedes escribirme el día que te acomoda, por ejemplo «el martes a las 5 pm»."].join("\n");
}

const lowerFirst = (s) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * Una pasada diaria. `send(phone, body)` manda el WhatsApp (lanza si falla);
 * `allowed(phone)` respeta el modo prueba. Devuelve un resumen.
 */
export async function runRecalls(db, { nowIso = new Date().toISOString(), send, allowed = () => true }) {
  const today = clinicParts(nowIso).day;
  const rows = await db.dueRecalls(today, addMinutes(nowIso, -SECOND_AFTER_DAYS * 24 * 60));
  const summary = { enviados: 0, agendados: 0, sin_telefono: 0, omitidos_prueba: 0, fallidos: 0 };
  for (const r of rows) {
    // Ya tiene cita próxima con ese doctor: el seguimiento está cubierto.
    const appt = await db.futureAppointment(r.patient_id, r.dentist_id);
    if (appt) {
      await db.updateRecall(r.id, { status: "agendado", booked_appointment_id: appt.id });
      summary.agendados++;
      continue;
    }
    const phone = String(r.patient?.phone ?? "").replace(/\D/g, "");
    if (!r.patient?.active || phone.length < 10) {
      summary.sin_telefono++;
      continue;
    }
    if (!allowed(phone)) {
      summary.omitidos_prueba++;
      continue;
    }
    const second = r.status === "enviado";
    try {
      await send(phone, recallMessage(r, { second }));
      await db.updateRecall(r.id, { status: "enviado", sent_count: (r.sent_count ?? 0) + 1, sent_at: nowIso });
      summary.enviados++;
    } catch {
      summary.fallidos++;
    }
  }
  return summary;
}
