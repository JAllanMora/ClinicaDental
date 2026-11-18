import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { addDays, clinicParts, toISO, todayStr, weekday } from "./time.js";

export const db = createClient(config.supabaseUrl, config.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ACTIVE = ["programada", "confirmada", "en_sala", "en_atencion", "completada"];
const UPCOMING = ["programada", "confirmada"];

/** Últimos 10 dígitos: así 5217711234567, +52 771 123 4567 y 7711234567 son el mismo número. */
export const phoneKey = (phone) => (phone ?? "").replace(/\D/g, "").slice(-10);

export async function findPatientByPhone(phone) {
  const key = phoneKey(phone);
  if (key.length < 10) return null;
  const { data, error } = await db
    .from("patients")
    .select("id, first_name, last_name, phone, primary_dentist_id, contact_preference")
    .eq("active", true)
    .not("phone", "is", null);
  if (error) throw error;
  return data.find((p) => phoneKey(p.phone) === key) ?? null;
}

export async function createPatient({ firstName, lastName, phone }) {
  const { data: branch } = await db.from("branches").select("id").eq("active", true).limit(1).maybeSingle();
  const { data, error } = await db
    .from("patients")
    .insert({
      first_name: firstName,
      last_name: lastName,
      phone: phoneKey(phone),
      contact_preference: "whatsapp",
      branch_id: branch?.id ?? null,
      notes: "Registrado por el bot de WhatsApp.",
    })
    .select("id, first_name, last_name, phone, primary_dentist_id, contact_preference")
    .single();
  if (error) throw error;
  return data;
}

export async function appointmentTypes() {
  const { data, error } = await db
    .from("appointment_types")
    .select("id, name, duration_minutes")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function upcomingAppointments(patientId) {
  const { data, error } = await db
    .from("appointments")
    .select("id, starts_at, status, reason, type:appointment_types(name), dentist:profiles!appointments_dentist_id_fkey(full_name)")
    .eq("patient_id", patientId)
    .in("status", UPCOMING)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");
  if (error) throw error;
  return data;
}

export async function confirmAppointment(id) {
  const { error } = await db
    .from("appointments")
    .update({ status: "confirmada", patient_response: "confirmada", patient_responded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelAppointment(id) {
  const { error } = await db
    .from("appointments")
    .update({
      status: "cancelada",
      cancel_reason: "Cancelada por el paciente por WhatsApp",
      patient_response: "cambio",
      patient_responded_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/** Recursos y ocupación de varios días de una sola vez. */
async function loadAgenda(fromDay, toDay) {
  const start = toISO(fromDay, 0);
  const end = toISO(addDays(toDay, 1), 0);
  const [dentists, chairs, appts, blocks, hours] = await Promise.all([
    db.from("profiles").select("id, full_name").eq("role", "dentist").eq("active", true),
    db.from("chairs").select("id, name").eq("active", true),
    db.from("appointments").select("dentist_id, chair_id, starts_at, ends_at").in("status", ACTIVE).lt("starts_at", end).gt("ends_at", start),
    db.from("schedule_blocks").select("dentist_id, chair_id, starts_at, ends_at").lt("starts_at", end).gt("ends_at", start),
    db.from("working_hours").select("dentist_id, weekday, starts, ends"),
  ]);
  for (const r of [dentists, chairs, appts, blocks]) if (r.error) throw r.error;
  const busy = [...appts.data, ...blocks.data].map((b) => ({
    dentist: b.dentist_id,
    chair: b.chair_id,
    s: new Date(b.starts_at).getTime(),
    e: new Date(b.ends_at).getTime(),
  }));

  // Turnos por odontólogo y día (Agenda › Horarios). Si la tabla aún no existe
  // (migración sin aplicar), se usa BOT_HORARIO para todos.
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const shifts = new Map(); // `${dentist}:${weekday}` -> [{open, close}]
  if (hours.error) {
    console.warn("working_hours no disponible, uso BOT_HORARIO:", hours.error.message);
    for (const d of dentists.data)
      for (const [wd, h] of Object.entries(config.hours)) shifts.set(`${d.id}:${wd}`, [h]);
  } else {
    for (const h of hours.data) {
      const k = `${h.dentist_id}:${h.weekday}`;
      if (!shifts.has(k)) shifts.set(k, []);
      shifts.get(k).push({ open: toMin(h.starts), close: toMin(h.ends) });
    }
  }
  return { dentists: dentists.data, chairs: chairs.data, busy, shifts };
}

const overlaps = (b, s, e) => b.s < e && s < b.e;

const worksAt = (agenda, dentistId, day, m, duration) =>
  (agenda.shifts.get(`${dentistId}:${weekday(day)}`) ?? []).some((h) => h.open <= m && m + duration <= h.close);

/** Primer odontólogo (en turno y libre) y sillón libres. Prefiere al odontólogo de cabecera. */
function assign(agenda, day, m, duration, preferredDentist) {
  const s = new Date(toISO(day, m)).getTime();
  const e = s + duration * 60_000;
  const dentists = [...agenda.dentists].sort((a, b) => (b.id === preferredDentist) - (a.id === preferredDentist));
  const dentist = dentists.find(
    (d) => worksAt(agenda, d.id, day, m, duration) && !agenda.busy.some((b) => b.dentist === d.id && overlaps(b, s, e)),
  );
  const chair = agenda.chairs.find((c) => !agenda.busy.some((b) => b.chair === c.id && overlaps(b, s, e)));
  return dentist && chair ? { dentist, chair, s, e } : null;
}

function slotsOfDay(agenda, day, duration, preferredDentist) {
  const wd = weekday(day);
  const candidates = new Set();
  for (const d of agenda.dentists)
    for (const h of agenda.shifts.get(`${d.id}:${wd}`) ?? [])
      for (let m = h.open; m + duration <= h.close; m += config.slotStep) candidates.add(m);

  const earliest = Date.now() + config.minNoticeHours * 3600_000;
  return [...candidates]
    .sort((a, b) => a - b)
    .filter((m) => new Date(toISO(day, m)).getTime() >= earliest && assign(agenda, day, m, duration, preferredDentist));
}

/** Días (con sus horarios libres) en los próximos `daysAhead` días. */
export async function availableDays(duration, preferredDentist, maxDays = 6) {
  const first = todayStr();
  const last = addDays(first, config.daysAhead);
  const agenda = await loadAgenda(first, last);
  const days = [];
  for (let d = first; d <= last && days.length < maxDays; d = addDays(d, 1)) {
    const slots = slotsOfDay(agenda, d, duration, preferredDentist);
    if (slots.length) days.push({ day: d, slots });
  }
  return days;
}

/** Reparte hasta `n` horarios a lo largo del día (mañana y tarde). */
export function spread(slots, n = 8) {
  if (slots.length <= n) return slots;
  const step = (slots.length - 1) / (n - 1);
  return [...new Set(Array.from({ length: n }, (_, i) => slots[Math.round(i * step)]))];
}

/** Crea la cita volviendo a revisar disponibilidad justo antes (alguien pudo ganarle el horario). */
export async function book({ patient, type, day, minutes }) {
  const agenda = await loadAgenda(day, day);
  const slot = assign(agenda, day, minutes, type.duration_minutes, patient.primary_dentist_id);
  if (!slot) return { ok: false };
  const { s, e } = slot;
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_id: patient.id,
      dentist_id: slot.dentist.id,
      chair_id: slot.chair.id,
      type_id: type.id,
      starts_at: new Date(s).toISOString(),
      ends_at: new Date(e).toISOString(),
      status: "programada",
      reason: type.name,
      notes: "Agendada por el paciente en WhatsApp.",
    })
    .select("id, starts_at")
    .single();
  if (error) {
    // 23P01 = choque con otra cita (restricción de empalmes): el horario se ocupó.
    if (error.code === "23P01") return { ok: false };
    throw error;
  }
  return { ok: true, appointment: data, dentist: slot.dentist };
}

/** Citas del día `day` que no tienen recordatorio. */
export async function pendingReminders(day) {
  const { data, error } = await db
    .from("appointments")
    .select("id, starts_at, patient:patients(id, first_name, phone, contact_preference), dentist:profiles!appointments_dentist_id_fkey(full_name)")
    .gte("starts_at", toISO(day, 0))
    .lt("starts_at", toISO(addDays(day, 1), 0))
    .in("status", UPCOMING)
    .is("reminder_sent_at", null)
    .order("starts_at");
  if (error) throw error;
  return data;
}

export async function reminderSettings() {
  const { data } = await db.from("reminder_settings").select("enabled, days_before, clinic_phone").single();
  return data;
}

export async function logMessage({ appointmentId, patientId, recipient, body, kind, status = "enviado", error }) {
  await db.from("notifications").insert({
    appointment_id: appointmentId ?? null,
    patient_id: patientId,
    channel: "whatsapp",
    kind,
    recipient,
    body,
    status,
    error: error ?? null,
    sent_by: null,
    sent_at: status === "fallido" ? null : new Date().toISOString(),
  });
}

export async function markReminded(id) {
  await db.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", id);
}

export { clinicParts };
