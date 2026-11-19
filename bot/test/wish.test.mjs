// Conversación de agenda con una base simulada: doctor del expediente, primera vez y fechas escritas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFlow } from "../src/flow.mjs";

const NOW = new Date("2026-11-19T15:00:00Z"); // jueves 9:00 a. m. en la clínica
const ANA = { id: "ana", full_name: "Dra. Ana López" };
const CARLOS = { id: "carlos", full_name: "Dr. Carlos Ruiz" };
const TYPE = { id: "limpieza", name: "Limpieza", duration_minutes: 30 };

/** Agenda de lunes a viernes, 9:00 a 14:00 y 16:00 a 19:00, cada 30 min; Ana no trabaja los viernes. */
function slotsBetween(from, to, dentist, busy) {
  const out = [];
  for (let t = new Date(from).getTime(); t < new Date(to).getTime(); t += 30 * 60_000) {
    const local = new Date(t - 6 * 3600_000);
    const wd = local.getUTCDay();
    const m = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (wd === 0 || wd === 6) continue;
    if (!((m >= 540 && m < 840) || (m >= 960 && m < 1140))) continue;
    for (const d of dentist ? [dentist] : [ANA, CARLOS]) {
      if (d.id === "ana" && wd === 5) continue;
      const starts_at = new Date(t).toISOString();
      if (busy.has(`${d.id}@${starts_at}`)) continue;
      out.push({ starts_at, ends_at: new Date(t + 30 * 60_000).toISOString(), dentist_id: d.id, dentist_name: d.full_name, chair_id: "s1" });
      break;
    }
  }
  return out;
}

function fakeDb({ patient = null, own = null, settings = {}, busy = new Set() } = {}) {
  const created = [];
  const s = { enabled: true, types: [TYPE], days_ahead: 30, min_notice_minutes: 120, ask_dentist: true, keep_own_dentist: true, first_visit_dentist_id: null, welcome_message: "Hola{nombre}", handoff_message: "ok", ...settings };
  return {
    created,
    settings: async () => s,
    findPatient: async () => patient,
    createPatient: async (x) => ({ id: "nuevo", first_name: x.firstName, primary_dentist_id: x.primaryDentistId }),
    ownDentist: async () => own,
    dentistsFor: async () => [ANA, CARLOS],
    workingWeekdays: async (ids) => new Set(ids?.[0] === "ana" ? [1, 2, 3, 4] : [1, 2, 3, 4, 5]),
    slots: async (_dur, from, to, { dentist }) => slotsBetween(from, to, [ANA, CARLOS].find((d) => d.id === dentist) ?? null, busy),
    createAppointment: async (x) => (created.push(x), { id: "cita" }),
    log: async () => {},
    waitingForHuman: async () => false,
    releaseHuman: async () => {},
    upcoming: async () => [],
  };
}

const PHONE = "5215500000001";
const run = async (db, ...msgs) => {
  const flow = createFlow(db, { now: () => NOW });
  let last = "";
  for (const m of msgs) last = (await flow.handle(PHONE, m)).join("\n---\n");
  return last;
};

test("paciente con expediente: va con su doctor sin preguntar", async () => {
  const db = fakeDb({ patient: { id: "p1", first_name: "María", primary_dentist_id: "ana" }, own: ANA });
  const out = await run(db, "hola", "1");
  assert.doesNotMatch(out, /¿Con qué doctor/);
  assert.match(out, /próximos horarios para limpieza con Dra\. Ana López/);
});

test("paciente nuevo: queda con el doctor de primera vez", async () => {
  const db = fakeDb({ settings: { first_visit_dentist_id: "carlos" } });
  const flow = createFlow(db, { now: () => NOW });
  await flow.handle(PHONE, "hola");
  await flow.handle(PHONE, "1");
  const out = (await flow.handle(PHONE, "Luis Gómez")).join("\n");
  assert.match(out, /con Dr\. Carlos Ruiz/);
  assert.doesNotMatch(out, /¿Con qué doctor/);
});

test("fecha y hora escritas: si está libre, confirma directo", async () => {
  const db = fakeDb({ patient: { id: "p1", first_name: "María" }, own: ANA });
  const out = await run(db, "hola", "1", "el próximo lunes a las 10");
  assert.match(out, /¡Sí tengo espacio! ¿Te agendo limpieza el lunes 23 de noviembre a las 10:00 a\. m\. con Dra\. Ana López\?/);
  const flow = createFlow(db, { now: () => NOW });
  for (const m of ["hola", "1", "el próximo lunes a las 10", "1"]) await flow.handle(PHONE, m);
  assert.equal(db.created.length, 1);
});

test("hora ocupada: ofrece lo más cercano de ese día", async () => {
  const busy = new Set(["ana@2026-11-23T16:00:00.000Z"]);
  const db = fakeDb({ patient: { id: "p1", first_name: "María" }, own: ANA, busy });
  const out = await run(db, "hola", "1", "lunes 23 a las 10");
  assert.match(out, /A las 10:00 a\. m\. del lunes 23 de noviembre ya no hay lugar[\s\S]*9:30 a\. m\.[\s\S]*10:30 a\. m\./);
});

test("su doctor no trabaja ese día: ofrece a otro doctor", async () => {
  const db = fakeDb({ patient: { id: "p1", first_name: "María" }, own: ANA });
  const out = await run(db, "hola", "1", "este viernes a las 10");
  assert.match(out, /Dra\. Ana López no tiene espacio ese día, pero sí otros doctores\. ¡Sí tengo espacio![\s\S]*con Dr\. Carlos Ruiz/);
});

test("fin de semana, fecha pasada e inválida se explican", async () => {
  const db = fakeDb({ patient: { id: "p1", first_name: "María" }, own: ANA });
  assert.match(await run(db, "hola", "1", "el domingo"), /El domingo 22 de noviembre no hay consulta con Dra\. Ana López\./);
  assert.match(await run(db, "hola", "1", "15 de marzo de 2025"), /Esa fecha ya pasó/);
  assert.match(await run(db, "hola", "1", "31 de febrero"), /No reconozco esa fecha/);
});

test("desde el saludo: «quiero cita el 20 de diciembre por la tarde»", async () => {
  const near = fakeDb({ patient: { id: "p1", first_name: "María" }, own: ANA });
  assert.match(await run(near, "quiero cita el 20 de diciembre por la tarde"), /sólo agendo con 30 días de anticipación/);
  const db = fakeDb({ patient: { id: "p1", first_name: "María" }, own: ANA, settings: { days_ahead: 60 } });
  const out = await run(db, "quiero cita el 20 de diciembre por la tarde");
  // 20 de diciembre de 2026 es domingo.
  assert.match(out, /El domingo 20 de diciembre no hay consulta/);
  const out2 = await run(db, "quiero cita el 21 de diciembre por la tarde");
  assert.match(out2, /Horarios libres el lunes 21 de diciembre en la tarde:[\s\S]*p\. m\./);
});

test("la selección por número sigue funcionando", async () => {
  const db = fakeDb({ patient: { id: "p1", first_name: "María" }, own: ANA });
  const out = await run(db, "hola", "1", "2");
  assert.match(out, /¿Te agendo limpieza el/);
});
