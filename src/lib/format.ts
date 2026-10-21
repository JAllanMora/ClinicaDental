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

export function formatDate(value: string | null) {
  if (!value) return "—";
  // Fechas puras (YYYY-MM-DD) se muestran tal cual, sin desfase de zona horaria.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: TZ }).format(date);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(
    new Date(value),
  );
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
