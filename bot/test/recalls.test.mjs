// Seguimientos: envío diario, segundo aviso, «ya tiene cita» y la respuesta del paciente.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFlow } from "../src/flow.mjs";
import { recallMessage, runRecalls } from "../src/recalls.mjs";

const NOW_ISO = "2026-11-19T16:00:00Z"; // jueves 10:00 a. m. en la clínica
const ANA = { id: "ana", full_name: "Dra. Ana López" };
const CARLOS = { id: "carlos", full_name: "Dr. Carlos Ruiz" };
const LIMPIEZA = { id: "limpieza", name: "Limpieza", duration_minutes: 30 };
const RESINA = { id: "resina", name: "Resina", duration_minutes: 45 };

const recall = (over = {}) => ({
  id: "r1",
  patient_id: "p1",
  dentist_id: "ana",
  due_on: "2026-11-19",
  reason: "Limpieza de control",
  appointment_type_id: "limpieza",
  status: "pendiente",
  sent_count: 0,
  sent_at: null,
  patient: { id: "p1", first_name: "María", phone: "5500000001", active: true },
  dentist: ANA,
  ...over,
});

function sendDb(rows, { future = null } = {}) {
  const updates = [];
  return {
    updates,
    dueRecalls: async () => rows,
    futureAppointment: async () => future,
    updateRecall: async (id, fields) => updates.push({ id, ...fields }),
  };
}

test("mensaje del seguimiento", () => {
  const m = recallMessage(recall());
  assert.match(m, /Hola María 👋[\s\S]*Dra\. Ana López te recomendó regresar para limpieza de control\.[\s\S]*1\. Sí, agendar\n2\. Ahora no/);
  assert.match(recallMessage(recall(), { second: true }), /te escribo de nuevo/);
});

test("envía los vencidos y los marca como enviados", async () => {
  const db = sendDb([recall()]);
  const sent = [];
  const s = await runRecalls(db, { nowIso: NOW_ISO, send: async (p, b) => sent.push([p, b]) });
  assert.equal(s.enviados, 1);
  assert.equal(sent[0][0], "5500000001");
  assert.deepEqual(db.updates[0], { id: "r1", status: "enviado", sent_count: 1, sent_at: NOW_ISO });
});

test("segundo y último aviso a los 7 días", async () => {
  const db = sendDb([recall({ status: "enviado", sent_count: 1, sent_at: "2026-11-12T16:00:00Z" })]);
  const sent = [];
  await runRecalls(db, { nowIso: NOW_ISO, send: async (_p, b) => sent.push(b) });
  assert.match(sent[0], /te escribo de nuevo/);
  assert.equal(db.updates[0].sent_count, 2);
});

test("si ya tiene cita con ese doctor no se manda y queda como agendado", async () => {
  const db = sendDb([recall()], { future: { id: "a9", starts_at: "2026-11-25T16:00:00Z" } });
  const sent = [];
  const s = await runRecalls(db, { nowIso: NOW_ISO, send: async (p) => sent.push(p) });
  assert.equal(sent.length, 0);
  assert.equal(s.agendados, 1);
  assert.deepEqual(db.updates[0], { id: "r1", status: "agendado", booked_appointment_id: "a9" });
});

test("sin teléfono o fuera de los números de prueba: no se manda ni se marca", async () => {
  const db = sendDb([recall({ id: "r2", patient: { id: "p2", first_name: "Luis", phone: null, active: true } }), recall()]);
  const s = await runRecalls(db, { nowIso: NOW_ISO, send: async () => assert.fail("no debe enviar"), allowed: () => false });
  assert.equal(s.sin_telefono, 1);
  assert.equal(s.omitidos_prueba, 1);
  assert.equal(db.updates.length, 0);
});

test("si falla el envío, sigue pendiente para la siguiente pasada", async () => {
  const db = sendDb([recall()]);
  const s = await runRecalls(db, { nowIso: NOW_ISO, send: async () => { throw new Error("sin WhatsApp"); } });
  assert.equal(s.fallidos, 1);
  assert.equal(db.updates.length, 0);
});

// ---- Respuesta del paciente ------------------------------------------------

function flowDb({ open = recall({ status: "enviado", sent_count: 1, sent_at: "2026-11-18T16:00:00Z" }) } = {}) {
  const calls = { update: [], booked: [], created: [] };
  return {
    calls,
    settings: async () => ({ enabled: true, types: [LIMPIEZA, RESINA], days_ahead: 30, min_notice_minutes: 60, ask_dentist: true, keep_own_dentist: true, welcome_message: "Hola{nombre}", handoff_message: "ok" }),
    findPatient: async () => ({ id: "p1", first_name: "María", primary_dentist_id: "carlos" }),
    ownDentist: async () => CARLOS, // su doctor de cabecera es otro: el seguimiento manda
    dentistsFor: async () => [ANA, CARLOS],
    workingWeekdays: async () => new Set([1, 2, 3, 4, 5]),
    slots: async (_d, from, _to, { dentist }) => {
      const t = new Date("2026-11-23T16:00:00Z").getTime();
      return t >= new Date(from).getTime() ? [{ starts_at: new Date(t).toISOString(), ends_at: new Date(t + 1_800_000).toISOString(), dentist_id: dentist ?? "ana", dentist_name: dentist === "carlos" ? CARLOS.full_name : ANA.full_name, chair_id: "s1" }] : [];
    },
    openRecall: async () => open,
    updateRecall: async (id, f) => calls.update.push({ id, ...f }),
    recallBooked: async (...a) => calls.booked.push(a),
    createAppointment: async (x) => (calls.created.push(x), { id: "nueva" }),
    upcoming: async () => [],
    log: async () => {},
    waitingForHuman: async () => false,
    releaseHuman: async () => {},
  };
}

const NOW = () => new Date(NOW_ISO);

test("«1» agenda con el doctor y el tipo del seguimiento, y al confirmar lo cierra", async () => {
  const db = flowDb();
  const flow = createFlow(db, { now: NOW });
  const a = (await flow.handle("5215500000001", "1")).join("\n");
  assert.match(a, /próximos horarios para limpieza con Dra\. Ana López/);
  assert.equal(db.calls.update[0].id, "r1");
  await flow.handle("5215500000001", "1");
  const c = (await flow.handle("5215500000001", "1")).join("\n");
  assert.match(c, /¡Listo, María!/);
  assert.equal(db.calls.created[0].slot.dentist_id, "ana");
  assert.deepEqual(db.calls.booked[0].slice(0, 2), ["p1", "nueva"]);
});

test("responder con una fecha agenda directo ese día", async () => {
  const db = flowDb();
  const flow = createFlow(db, { now: NOW });
  const a = (await flow.handle("5215500000001", "sí, el lunes a las 10")).join("\n");
  assert.match(a, /¡Sí tengo espacio! ¿Te agendo limpieza el lunes 23 de noviembre a las 10:00 a\. m\. con Dra\. Ana López\?/);
});

test("«2» / «ahora no» lo marca como no quiso agendar", async () => {
  const db = flowDb();
  const flow = createFlow(db, { now: NOW });
  assert.match((await flow.handle("5215500000001", "ahora no")).join("\n"), /Cuando quieras agendar, escríbeme «menú»/);
  assert.equal(db.calls.update[0].status, "declinado");
});

test("sin seguimiento abierto, «2» sigue al menú normal", async () => {
  const db = flowDb({ open: null });
  const flow = createFlow(db, { now: NOW });
  assert.match((await flow.handle("5215500000001", "2")).join("\n"), /¿En qué te ayudo\?/);
  assert.equal(db.calls.update.length, 0);
});
