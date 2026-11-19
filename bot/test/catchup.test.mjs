import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { handledStore, pickPending } from "../src/catchup.mjs";

const NOW = 1_800_000_000;
const msg = (id, jid, minsAgo, { fromMe = false, text = "hola" } = {}) => ({
  key: { id, remoteJid: jid, fromMe },
  messageTimestamp: NOW - minsAgo * 60,
  message: { conversation: text },
});
const A = "5215500000001@s.whatsapp.net";
const B = "5215500000002@s.whatsapp.net";
const pick = (msgs, handled = new Set(), maxHours = 12) => pickPending(msgs, { nowSec: NOW, maxHours, handled }).map((m) => m.key.id);

test("contesta sólo el último mensaje de cada chat", () => {
  assert.deepEqual(pick([msg("a1", A, 30), msg("a2", A, 20, { text: "quiero cita" }), msg("b1", B, 10)]), ["a2", "b1"]);
});

test("si ya le respondieron después (bot o a mano desde el teléfono), no contesta", () => {
  assert.deepEqual(pick([msg("a1", A, 30), msg("r1", A, 25, { fromMe: true })]), []);
  assert.deepEqual(pick([msg("a1", A, 30), msg("r1", A, 25, { fromMe: true }), msg("a2", A, 5)]), ["a2"], "volvió a escribir después");
});

test("ignora mensajes más viejos que el límite", () => {
  assert.deepEqual(pick([msg("a1", A, 13 * 60)]), []);
  assert.deepEqual(pick([msg("a1", A, 13 * 60)], new Set(), 24), ["a1"]);
});

test("no contesta dos veces el mismo mensaje (notify + append, o tras reiniciar)", () => {
  const dir = mkdtempSync(join(tmpdir(), "bot-"));
  try {
    const file = join(dir, "handled.json");
    const store = handledStore(file);
    store.add("a1");
    assert.deepEqual(pick([msg("a1", A, 5)], store), []);
    assert.ok(handledStore(file).has("a1"), "persiste en disco");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("descarta grupos y mensajes sin contenido", () => {
  const isChat = (jid) => !jid.endsWith("@g.us");
  const out = pickPending([msg("g1", "123@g.us", 5), { key: { id: "x", remoteJid: A }, messageTimestamp: NOW }], { nowSec: NOW, maxHours: 12, handled: new Set(), isChat });
  assert.deepEqual(out, []);
});
