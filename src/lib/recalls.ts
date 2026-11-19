import type { RecallStatus } from "@/lib/database.types";

/** Plazos rápidos para el recordatorio de regreso (meses). */
export const RECALL_MONTHS = [1, 3, 6, 12] as const;

export const RECALL_STATUS: Record<RecallStatus, { label: string; tone: "brand" | "amber" | "green" | "red" | "gray" }> = {
  pendiente: { label: "Programado", tone: "brand" },
  enviado: { label: "Enviado, sin respuesta", tone: "amber" },
  agendado: { label: "Agendó", tone: "green" },
  declinado: { label: "No quiso agendar", tone: "red" },
  cancelado: { label: "Cancelado", tone: "gray" },
};

/** Suma meses a un día YYYY-MM-DD; si el mes no tiene ese día, toma el último (31 ene + 1 mes = 28/29 feb). */
export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
