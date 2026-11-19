// Mensajes que llegaron mientras el bot estaba apagado.
// Al reconectarse, WhatsApp entrega lo pendiente (messages.upsert «append», o «notify» con hora vieja).
// Se contesta sólo el último mensaje de cada chat, si es reciente, si nadie ha respondido después
// (ni el bot ni recepción desde el teléfono) y si no se había contestado ya.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const LATE_PREFIX = "Perdón por la demora en responder.";

/** Segundos (epoch) del mensaje; Baileys a veces lo da como Long. */
export const msgSeconds = (msg) => Number(msg?.messageTimestamp?.toNumber?.() ?? msg?.messageTimestamp ?? 0);

/** Un mensaje «notify» con más de este atraso también se trata como pendiente (pide disculpa). */
export const LATE_AFTER_SECONDS = 120;

/**
 * Elige, por chat, el mensaje pendiente a contestar.
 * @param msgs mensajes de Baileys (entrantes y fromMe)
 * @param opts.nowSec ahora en segundos
 * @param opts.maxHours antigüedad máxima
 * @param opts.handled Set de ids ya contestados
 * @param opts.isChat (jid) => boolean, descarta grupos, difusiones y canales
 */
export function pickPending(msgs, { nowSec, maxHours, handled, isChat = () => true }) {
  const byChat = new Map();
  for (const m of msgs) {
    const jid = m?.key?.remoteJid;
    if (!jid || !isChat(jid) || !m.message) continue;
    const list = byChat.get(jid) ?? [];
    list.push(m);
    byChat.set(jid, list);
  }
  const out = [];
  for (const list of byChat.values()) {
    list.sort((a, b) => msgSeconds(a) - msgSeconds(b));
    const last = list.at(-1);
    if (last.key.fromMe) continue; // ya le respondieron (bot o a mano)
    if (handled.has(last.key.id)) continue;
    if (nowSec - msgSeconds(last) > maxHours * 3600) continue;
    out.push(last);
  }
  return out.sort((a, b) => msgSeconds(a) - msgSeconds(b));
}

/** Ids de mensajes ya contestados, guardados en disco para no repetir después de reiniciar. */
export function handledStore(file, max = 2000) {
  let ids = [];
  try {
    if (existsSync(file)) ids = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    ids = [];
  }
  const set = new Set(ids);
  return {
    has: (id) => set.has(id),
    add(id) {
      if (!id || set.has(id)) return;
      set.add(id);
      ids.push(id);
      if (ids.length > max) set.delete(ids.shift());
      try {
        writeFileSync(file, JSON.stringify(ids));
      } catch {
        /* sin disco: sólo en memoria */
      }
    },
  };
}
