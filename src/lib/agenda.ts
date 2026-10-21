import type { AppointmentStatus } from "@/lib/database.types";

/** México (centro) no tiene horario de verano desde 2022: UTC−6 todo el año. */
export const CLINIC_OFFSET = "-06:00";
export const CLINIC_TZ = "America/Mexico_City";

export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 21;
export const SLOT_MINUTES = 15;

export function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function weekday(day: string) {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function startOfWeek(day: string) {
  const wd = weekday(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export function isValidDay(day: unknown): day is string {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day));
}

export function toISO(day: string, minutes: number) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${day}T${h}:${m}:00${CLINIC_OFFSET}`;
}

export function dayRange(day: string, days = 1) {
  return [toISO(day, 0), toISO(addDays(day, days), 0)] as const;
}

/** Día (YYYY-MM-DD) y minutos desde medianoche en hora de la clínica. */
export function clinicParts(iso: string) {
  const local = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
  return { day: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function minutesToLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function longDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return `${DAY_NAMES[weekday(day)]} ${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
}

export function shortDay(day: string) {
  return `${DAY_SHORT[weekday(day)]} ${Number(day.slice(8))}`;
}

export const DAY_SHORT_NAMES = DAY_SHORT;

export const STATUS: Record<AppointmentStatus, { label: string; tone: string; dot: string }> = {
  programada: { label: "Programada", tone: "bg-brand-50 text-brand-800", dot: "#bb7ec9" },
  confirmada: { label: "Confirmada", tone: "bg-sky-50 text-sky-800", dot: "#0ea5e9" },
  en_sala: { label: "En sala de espera", tone: "bg-amber-50 text-amber-800", dot: "#f59e0b" },
  en_atencion: { label: "En atención", tone: "bg-pink-50 text-magenta-600", dot: "#c2187a" },
  completada: { label: "Completada", tone: "bg-emerald-50 text-emerald-800", dot: "#10b981" },
  cancelada: { label: "Cancelada", tone: "bg-gray-100 text-gray-500", dot: "#9ca3af" },
  no_asistio: { label: "No asistió", tone: "bg-red-50 text-red-700", dot: "#ef4444" },
};

/** Flujo natural de estados en el día de la cita. */
export const NEXT_STATUS: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  programada: ["confirmada", "en_sala", "no_asistio"],
  confirmada: ["en_sala", "no_asistio"],
  en_sala: ["en_atencion"],
  en_atencion: ["completada"],
};

export const ACTIVE_STATUSES: AppointmentStatus[] = ["programada", "confirmada", "en_sala", "en_atencion", "completada"];
