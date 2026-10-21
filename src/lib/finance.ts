import type { PaymentMethod, PlanItemStatus, PlanStatus } from "@/lib/database.types";

export const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "efectivo", label: "Efectivo" },
  { key: "tarjeta_debito", label: "Tarjeta de débito" },
  { key: "tarjeta_credito", label: "Tarjeta de crédito" },
  { key: "transferencia", label: "Transferencia" },
  { key: "otro", label: "Otro" },
];
export const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.key, m.label])) as Record<PaymentMethod, string>;

export const PLAN_STATUS: Record<PlanStatus, { label: string; tone: "brand" | "magenta" | "green" | "gray" | "red" | "amber" }> = {
  borrador: { label: "Borrador", tone: "gray" },
  presentado: { label: "Presentado", tone: "amber" },
  aceptado: { label: "Aceptado", tone: "green" },
  rechazado: { label: "Rechazado", tone: "red" },
  terminado: { label: "Terminado", tone: "brand" },
  cancelado: { label: "Cancelado", tone: "gray" },
};

export const ITEM_STATUS: Record<PlanItemStatus, { label: string; tone: "brand" | "green" | "gray" }> = {
  pendiente: { label: "Pendiente", tone: "gray" },
  realizado: { label: "Realizado", tone: "green" },
  cancelado: { label: "Cancelado", tone: "gray" },
};

/** Qué estados puede tomar un presupuesto desde el actual. */
export const PLAN_NEXT: Partial<Record<PlanStatus, PlanStatus[]>> = {
  borrador: ["presentado", "aceptado", "cancelado"],
  presentado: ["aceptado", "rechazado", "borrador"],
  aceptado: ["terminado", "cancelado"],
  rechazado: ["borrador"],
};

export const PLAN_ACTION: Partial<Record<PlanStatus, string>> = {
  presentado: "Marcar como presentado",
  aceptado: "Paciente aceptó",
  rechazado: "Paciente rechazó",
  terminado: "Terminar plan",
  cancelado: "Cancelar plan",
  borrador: "Volver a borrador",
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
