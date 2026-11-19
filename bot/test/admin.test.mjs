import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdminFlow, currentAlerts, matchItems, parseEntry, runAdminAlerts } from "../src/admin.mjs";

const NOW = "2026-11-19T18:00:00Z";
const ITEMS = [
  { id: "g-m", name: "Guantes de nitrilo M", unit: "caja", category: "Consumibles", min_stock: 3, stock: 1, next_expiry: null, expired_qty: 0 },
  { id: "g-l", name: "Guantes de nitrilo L", unit: "caja", category: "Consumibles", min_stock: 3, stock: 5, next_expiry: null, expired_qty: 0 },
  { id: "an", name: "Anestesia lidocaína 2%", unit: "cartucho", category: "Fármacos", min_stock: 20, stock: 50, next_expiry: "2026-12-10", expired_qty: 0 },
  { id: "cb", name: "Cubrebocas", unit: "caja", category: "Consumibles", min_stock: 2, stock: 4, next_expiry: null, expired_qty: 0 },
];

test("lee cantidad, unidad, artículo y extras", () => {
  assert.deepEqual(
    { ...parseEntry("ya compré 2 cajas más de guantes", NOW) },
    { qty: 2, unit: "cajas", query: "guantes", lot: null, expires: null, cost: null, costIsTotal: false },
  );
  const e = parseEntry("compre 10 anestecias lote L55 caduca 03/2027 a $12 c/u", NOW);
  assert.equal(e.qty, 10);
  assert.equal(e.lot, "L55");
  assert.equal(e.expires, "2027-03-31");
  assert.equal(e.cost, 12);
  assert.equal(e.costIsTotal, false);
  const t = parseEntry("ya compramos dos resinas a2 por $500", NOW);
  assert.equal(t.qty, 2);
  assert.equal(t.costIsTotal, true);
  assert.equal(parseEntry("recibimos media docena de cubrebocas", NOW).qty, 6);
  assert.equal(parseEntry("hola cómo estás", NOW), null);
});

test("búsqueda difusa de artículos", () => {
  assert.deepEqual(matchItems("guantes m", ITEMS).map((i) => i.id).slice(0, 1), ["g-m"]);
  assert.equal(matchItems("anestecia", ITEMS)[0].id, "an", "tolera faltas de ortografía");
  assert.equal(matchItems("cubre bocas", ITEMS).length >= 0, true);
  assert.deepEqual(matchItems("tornillos", ITEMS), []);
});

function fakeDb(items = ITEMS) {
  const calls = { inventoryIn: [], log: [] };
  return {
    calls,
    inventory: async () => items.map((i) => ({ ...i })),
    lateLabOrders: async () => [{ id: "o1", folio: 7, work_type: "Corona", due_date: "2026-11-15", status: "enviado", patient: { first_name: "Ana", last_name: "Pérez" }, lab: { name: "Lab Dental" } }],
    adminProfile: async () => ({ id: "admin-1", full_name: "Admin Prueba" }),
    inventoryIn: async (x) => calls.inventoryIn.push(x),
    log: async (x) => calls.log.push(x),
  };
}

test("entrada ambigua: pregunta cuál y SIEMPRE confirma antes de registrar", async () => {
  const db = fakeDb();
  const flow = createAdminFlow(db, { now: () => new Date(NOW) });
  const a = (await flow.handle("5500000000", "ya compré 2 cajas más de guantes")).join("\n");
  assert.match(a, /¿Cuál de estos es\?[\s\S]*Guantes de nitrilo M[\s\S]*Guantes de nitrilo L/);
  const b = (await flow.handle("5500000000", "1")).join("\n");
  assert.match(b, /¿Registro entrada de 2 caja\(s\) de Guantes de nitrilo M\?[\s\S]*quedarían 3/);
  assert.equal(db.calls.inventoryIn.length, 0, "no registra sin confirmar");
  const c = (await flow.handle("5500000000", "sí")).join("\n");
  assert.match(c, /Registré 2 caja\(s\) de Guantes de nitrilo M/);
  assert.equal(db.calls.inventoryIn.length, 1);
  assert.equal(db.calls.inventoryIn[0].itemId, "g-m");
  assert.equal(db.calls.inventoryIn[0].actorId, "admin-1");
  assert.ok(db.calls.log.some((l) => l.body.startsWith("[admin]")), "queda en la bitácora");
});

test("entrada con unidad distinta permite corregir la cantidad; 'no' cancela", async () => {
  const db = fakeDb();
  const flow = createAdminFlow(db, { now: () => new Date(NOW) });
  const a = (await flow.handle("5500000000", "llegaron 2 cajas de anestesia")).join("\n");
  assert.match(a, /se cuenta por cartucho[\s\S]*3\. Corregir/);
  assert.match((await flow.handle("5500000000", "3")).join("\n"), /¿Cuántas cartuchos son en total\?/);
  assert.match((await flow.handle("5500000000", "100")).join("\n"), /entrada de 100 cartucho\(s\)/);
  assert.match((await flow.handle("5500000000", "no")).join("\n"), /no registré nada/);
  assert.equal(db.calls.inventoryIn.length, 0);
});

test("mensajes que no son de administrador siguen al menú normal", async () => {
  const flow = createAdminFlow(fakeDb(), { now: () => new Date(NOW) });
  assert.equal(await flow.handle("5500000000", "hola"), null);
  assert.equal(await flow.handle("5500000000", "1"), null);
});

test("alertas: stock bajo, caducidad y laboratorio atrasado", async () => {
  const alerts = await currentAlerts(fakeDb(), NOW);
  const keys = alerts.map((a) => a.key);
  assert.ok(keys.includes("stock:g-m"));
  assert.ok(!keys.includes("stock:g-l"));
  assert.ok(keys.some((k) => k.startsWith("caduca:an:")));
  assert.ok(keys.some((k) => k.startsWith("lab:o1:")));
  const flow = createAdminFlow(fakeDb(), { now: () => new Date(NOW) });
  assert.match((await flow.handle("5500000000", "alertas")).join("\n"), /Hace falta Guantes de nitrilo M[\s\S]*Laboratorio atrasado: Corona de Ana Pérez/);
});

test("alertas al admin: resumen una vez al día, luego sólo lo nuevo, sin repetir", async () => {
  const store = new Set();
  let items = ITEMS.map((i) => ({ ...i }));
  const db = {
    inventory: async () => items.map((i) => ({ ...i })),
    lateLabOrders: async () => [],
    sentAlerts: async () => [...store].map((key) => ({ key })),
    markAlerts: async (rows) => rows.forEach((r) => store.add(r.key)),
    clearAlerts: async (keys) => keys.forEach((k) => store.delete(k)),
  };
  const sends = [];
  const pass = (nowIso) => runAdminAlerts(db, { recipients: ["5500000000"], alertHour: 9, send: async (_p, t) => sends.push(t), nowIso });
  const day1 = "2026-11-19T16:00:00Z"; // 10:00 a. m.
  assert.match(await pass(day1), /Resumen del día[\s\S]*Guantes de nitrilo M[\s\S]*Anestesia/);
  assert.equal(await pass(day1), null, "la misma alerta no se repite");
  items.find((i) => i.id === "g-l").stock = 2;
  const fresh = await pass("2026-11-19T18:00:00Z");
  assert.match(fresh, /Nueva alerta:\n• Hace falta Guantes de nitrilo L/);
  assert.doesNotMatch(fresh, /nitrilo M/);
  assert.equal(await pass("2026-11-19T19:00:00Z"), null);
  items.find((i) => i.id === "g-m").stock = 10; // se resurtió: se olvida
  await pass("2026-11-19T20:00:00Z");
  assert.ok(!store.has("stock:g-m"));
  items.find((i) => i.id === "g-m").stock = 0; // vuelve a faltar: se avisa otra vez
  assert.match(await pass("2026-11-19T21:00:00Z"), /Nueva alerta:\n• Hace falta Guantes de nitrilo M/);
  assert.match(await pass("2026-11-20T16:00:00Z"), /Resumen del día/, "al día siguiente, nuevo resumen");
  assert.equal(sends.length, 4);
});
