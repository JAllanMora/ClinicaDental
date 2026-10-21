import type { Patient } from "@/lib/database.types";

export function fullName(p: Pick<Patient, "first_name" | "last_name" | "second_last_name">) {
  return [p.first_name, p.last_name, p.second_last_name].filter(Boolean).join(" ");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function ageFrom(birthDate: string | null, today = new Date()) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

const TZ = "America/Mexico_City";
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Formato manual (sólo partes numéricas de Intl): el texto de Intl varía entre
// Node y el navegador ("p.m." vs "p. m.") y rompe la hidratación.
function parts(date: Date) {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Fechas puras (YYYY-MM-DD) se muestran tal cual, sin desfase de zona horaria.
    const [y, m, d] = value.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  const p = parts(new Date(value));
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

export function formatTime(value: string | Date) {
  const p = parts(typeof value === "string" ? new Date(value) : value);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function formatDateTime(value: string) {
  return `${formatDate(value)}, ${formatTime(value)}`;
}

export function recordNumber(n: number) {
  return `EXP-${String(n).padStart(5, "0")}`;
}

/** Normaliza texto como la columna generada patients.search. */
export function normalizeSearch(text: string) {
  return text
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" })[c] ?? c)
    .replace(/[%_,()\\]/g, " ")
    .trim();
}

/** $1,234.50 — formato manual para que servidor y navegador coincidan. */
export function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  const sign = n < 0 ? "-" : "";
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${sign}$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
}
