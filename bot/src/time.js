// Fechas en hora de la clínica (México centro, UTC−6 todo el año), igual que src/lib/agenda.ts.
export const CLINIC_TZ = "America/Mexico_City";
const OFFSET = "-06:00";

export const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();

export function toISO(day, minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${day}T${h}:${m}:00${OFFSET}`;
}

export function clinicParts(iso) {
  const local = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
  return { day: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export const nowMinutes = () => clinicParts(new Date().toISOString()).minutes;

export function hourLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
}

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function dayLabel(day) {
  const [, m, d] = day.split("-").map(Number);
  const today = todayStr();
  const suffix = day === today ? " (hoy)" : day === addDays(today, 1) ? " (mañana)" : "";
  return `${DAYS[weekday(day)]} ${d} de ${MONTHS[m - 1]}${suffix}`;
}

export function apptLabel(iso) {
  const { day, minutes } = clinicParts(iso);
  return `${dayLabel(day)} a las ${hourLabel(minutes)}`;
}
