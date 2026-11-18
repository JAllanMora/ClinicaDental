// Prueba la conversación contra una base con los datos de demostración (supabase/seed.sql).
// Corre con `npm test` teniendo .env.local de la app apuntando a un Supabase local (npx supabase start).
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.mjs";
import { createDb } from "../src/db.mjs";
import { createFlow, normalizePhone, pickOptions } from "../src/flow.mjs";

test("normaliza teléfonos de México", () => {
  assert.equal(normalizePhone("5218112345601"), "8112345601");
  assert.equal(normalizePhone("528112345601"), "8112345601");
  assert.equal(normalizePhone("+52 81 1234 5601"), "8112345601");
  assert.equal(normalizePhone("14155550100"), "14155550100");
});

test("reparte las opciones en mañana y tarde", () => {
  const at = (d, h, m = 0) => new Date(Date.UTC(2026, 10, d, h + 6, m)).toISOString();
  const slots = [at(19, 9), at(19, 9, 15), at(19, 16), at(19, 16, 30), at(20, 10), at(20, 17)].map((starts_at) => ({ starts_at }));
  assert.deepEqual(
    pickOptions(slots).map((s) => s.starts_at),
    [at(19, 9), at(19, 16), at(20, 10), at(20, 17)],
  );
});

let config = null;
try {
  config = loadConfig();
} catch {}
const local = config && /127\.0\.0\.1|localhost/.test(config.supabaseUrl);

test("conversación completa contra la base local", { skip: !local && "Sin Supabase local" }, async () => {
  const db = createDb({ url: config.supabaseUrl, serviceKey: config.serviceKey });
  const flow = createFlow(db);
  const say = async (phone, text) => (await flow.handle(phone, text)).join("\n---\n");

  // Paciente conocida: agenda una limpieza.
  const maria = "5218112345601";
  assert.match(await say(maria, "Hola"), /Hola María[\s\S]*1\. Agendar/);
  assert.match(await say(maria, "1"), /tipo de cita/);
  const types = (await db.settings()).types;
  const limpieza = types.findIndex((t) => t.name === "Limpieza") + 1;
  const doctors = await db.dentistsFor(types[limpieza - 1].id);
  let options = await say(maria, String(limpieza));
  if (doctors.length > 1) {
    // María es paciente de la Dra. López: aparece primero.
    assert.match(options, /¿Con qué doctor[\s\S]*1\. Dra\. Ana López[\s\S]*Con el primero disponible/);
    options = await say(maria, "1");
    assert.match(options, /con Dra\. Ana López:/);
  }
  assert.match(options, /próximos horarios para limpieza[\s\S]*1\. [\s\S]*(a|p)\. m\.[\s\S]*0\. Ver más fechas/);
  assert.match(await say(maria, "1"), /¿Te agendo limpieza/);
  assert.match(await say(maria, "1"), /¡Listo, María! Tu cita quedó/);
  const mine = await db.upcoming((await db.findPatient(maria)).id);
  const booked = mine.find((a) => a.type?.name === "Limpieza");
  assert.ok(booked, "la cita existe");

  // Mis citas → cancelar la nueva.
  assert.match(await say(maria, "menú"), /1\. Agendar/);
  const list = await say(maria, "2");
  if (mine.length > 1) {
    assert.match(list, /Tus próximas citas/);
    const idx = mine.findIndex((a) => a.id === booked.id) + 1;
    assert.match(await say(maria, String(idx)), /1\. Confirmar[\s\S]*3\. Cancelar/);
  } else {
    assert.match(list, /Tu cita: [\s\S]*3\. Cancelar/);
  }
  assert.match(await say(maria, "3"), /Seguro que quieres cancelar/);
  assert.match(await say(maria, "1"), /quedó cancelada/);

  // Número nuevo: se registra y agenda.
  const nuevo = "5218199990000";
  await say(nuevo, "buenas tardes");
  assert.match(await say(nuevo, "1"), /A nombre de quién/);
  assert.match(await say(nuevo, "Pedro"), /nombre y apellido/);
  assert.match(await say(nuevo, "pedro sánchez ruiz"), /tipo de cita/);
  const pedro = await db.findPatient(nuevo);
  assert.equal(pedro.first_name, "Pedro");
  assert.equal(pedro.last_name, "Sánchez Ruiz");
  const first = await say(nuevo, "1");
  if (/¿Con qué doctor/.test(first)) await say(nuevo, String(first.split("\n").length - 1));
  await say(nuevo, "2");
  assert.match(await say(nuevo, "1"), /¡Listo, Pedro!/);

  // Recepción: el bot se calla hasta que escriba "menú".
  assert.match(await say(nuevo, "menu"), /1\. Agendar/);
  assert.match(await say(nuevo, "3"), /recepción/);
  assert.equal(await say(nuevo, "¿cuánto cuesta una corona?"), "");
  assert.ok(await db.waitingForHuman("8199990000"));
  assert.match(await say(nuevo, "menu"), /1\. Agendar/);
  assert.equal(await db.waitingForHuman("8199990000"), false);
});

test("un tipo de cita con un solo doctor no pregunta y sólo ofrece a ese doctor", { skip: !local && "Sin Supabase local" }, async () => {
  const db = createDb({ url: config.supabaseUrl, serviceKey: config.serviceKey });
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false } });
  const types = (await db.settings()).types;
  const type = types.find((t) => t.name === "Limpieza");
  const ruiz = (await sb.from("profiles").select("id").eq("email", "dentista2@clinica.local").single()).data;
  await sb.from("appointment_type_dentists").insert({ type_id: type.id, dentist_id: ruiz.id });
  try {
    const flow = createFlow(db);
    const say = async (phone, text) => (await flow.handle(phone, text)).join("\n---\n");
    const jose = "5218112345602";
    await say(jose, "hola");
    await say(jose, "1");
    const options = await say(jose, String(types.indexOf(type) + 1));
    assert.doesNotMatch(options, /¿Con qué doctor/);
    assert.match(options, /próximos horarios para limpieza/);
    assert.doesNotMatch(options, /Ana López/);
    assert.match(options, /Carlos Ruiz/);
  } finally {
    await sb.from("appointment_type_dentists").delete().eq("type_id", type.id);
  }
});
