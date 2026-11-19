import type { WhatsappStatus } from "@/lib/database.types";

export type WhatsappHealth = "conectado" | "esperando_qr" | "conectando" | "desconectado" | "apagado";

/** El bot late cada 20 s; si lleva más de 2 minutos callado, la computadora del bot está apagada. */
const STALE_MS = 2 * 60_000;
/** Tras presionar «Conectar», el bot tarda unos segundos en ver la petición y abrir la conexión. */
const CONNECTING_MS = 60_000;

export function whatsappHealth(
  status: Pick<WhatsappStatus, "state" | "bot_seen_at" | "connect_requested_at"> | null | undefined,
  now = Date.now(),
): WhatsappHealth {
  if (!status?.bot_seen_at || now - new Date(status.bot_seen_at).getTime() > STALE_MS) return "apagado";
  if (status.state === "conectado") return "conectado";
  if (status.state === "esperando_qr") return "esperando_qr";
  if (status.connect_requested_at && now - new Date(status.connect_requested_at).getTime() < CONNECTING_MS) return "conectando";
  return "desconectado";
}

export const WHATSAPP_HEALTH: Record<WhatsappHealth, { label: string; tone: "green" | "amber" | "red" }> = {
  conectado: { label: "Conectado", tone: "green" },
  esperando_qr: { label: "Esperando que escanees el código", tone: "amber" },
  conectando: { label: "Conectando…", tone: "amber" },
  desconectado: { label: "Desconectado", tone: "red" },
  apagado: { label: "La computadora del bot está apagada", tone: "red" },
};
