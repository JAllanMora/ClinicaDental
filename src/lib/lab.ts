import type { InventoryMove, LabStatus } from "@/lib/database.types";

type Tone = "brand" | "magenta" | "green" | "gray" | "red" | "amber";

export const LAB_STATUS: Record<LabStatus, { label: string; tone: Tone }> = {
  por_enviar: { label: "Por enviar", tone: "gray" },
  enviado: { label: "Enviado al laboratorio", tone: "amber" },
  en_proceso: { label: "En proceso", tone: "amber" },
  recibido: { label: "Recibido en clínica", tone: "brand" },
  en_prueba: { label: "En prueba", tone: "magenta" },
  ajuste: { label: "Regresó a ajuste", tone: "red" },
  entregado: { label: "Entregado al paciente", tone: "green" },
  cancelado: { label: "Cancelado", tone: "gray" },
};

export const LAB_NEXT: Partial<Record<LabStatus, LabStatus[]>> = {
  por_enviar: ["enviado", "cancelado"],
  enviado: ["en_proceso", "recibido", "cancelado"],
  en_proceso: ["recibido", "cancelado"],
  recibido: ["en_prueba", "entregado", "ajuste"],
  en_prueba: ["entregado", "ajuste"],
  ajuste: ["recibido", "cancelado"],
};

export const LAB_ACTION: Partial<Record<LabStatus, string>> = {
  enviado: "Enviar al laboratorio",
  en_proceso: "Laboratorio lo está haciendo",
  recibido: "Recibido en clínica",
  en_prueba: "Prueba en boca",
  ajuste: "Regresar a ajuste",
  entregado: "Entregado al paciente",
  cancelado: "Cancelar",
};

/** Estados en los que el trabajo está fuera de la clínica y puede retrasarse. */
export const LAB_PENDING: LabStatus[] = ["por_enviar", "enviado", "en_proceso", "ajuste"];
export const LAB_OPEN: LabStatus[] = ["por_enviar", "enviado", "en_proceso", "recibido", "en_prueba", "ajuste"];

export const MOVE_LABEL: Record<InventoryMove, string> = {
  entrada: "Entrada",
  salida: "Salida / consumo",
  ajuste: "Ajuste de inventario",
  merma: "Merma / caducado",
};

export const EXPIRY_WARNING_DAYS = 60;
