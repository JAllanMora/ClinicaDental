import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWhen } from "../src/when.mjs";

// Jueves 19 de noviembre de 2026, 12:00 en la clínica (UTC−6).
const NOW = "2026-11-19T18:00:00Z";
const p = (s) => parseWhen(s, NOW);

test("días relativos", () => {
  assert.deepEqual(p("hoy"), { day: "2026-11-19", minutes: null, period: null });
  assert.equal(p("mañana").day, "2026-11-20");
  assert.equal(p("pasado mañana").day, "2026-11-21");
  assert.equal(p("en 3 días").day, "2026-11-22");
});

test("días de la semana", () => {
  assert.equal(p("el lunes").day, "2026-11-23");
  assert.equal(p("el próximo domingo").day, "2026-11-22");
  assert.equal(p("este viernes").day, "2026-11-20");
  assert.equal(p("este jueves").day, "2026-11-19", "este = hoy si es el mismo día");
  assert.equal(p("el jueves").day, "2026-11-26", "sin 'este', el de la semana siguiente");
  assert.equal(p("el próximo jueves").day, "2026-11-26");
  assert.equal(p("el sábado que viene").day, "2026-11-21");
});

test("fechas explícitas", () => {
  assert.equal(p("el 20 de diciembre").day, "2026-12-20");
  assert.equal(p("20/12").day, "2026-12-20");
  assert.equal(p("diciembre 3").day, "2026-12-03");
  assert.equal(p("5 de enero").day, "2027-01-05", "ya pasó este año: el siguiente");
  assert.equal(p("el 5").day, "2026-12-05", "día ya pasado del mes: el mes siguiente");
  assert.equal(p("el 25").day, "2026-11-25");
  assert.equal(p("31 de febrero").error, "fecha_invalida");
  assert.equal(p("15 de marzo 2025").error, "pasada");
});

test("horas", () => {
  assert.equal(p("el próximo domingo a las 12 pm").minutes, 12 * 60);
  assert.equal(p("a las 4").minutes, 16 * 60, "1 a 7 sin a.m./p.m. es de la tarde");
  assert.equal(p("a las 10").minutes, 10 * 60);
  assert.equal(p("10 am").minutes, 10 * 60);
  assert.equal(p("4:30 de la tarde").minutes, 16 * 60 + 30);
  assert.equal(p("a las cuatro y media").minutes, 16 * 60 + 30);
  assert.equal(p("mediodía").minutes, 12 * 60);
  assert.equal(p("9:15 p. m.").minutes, 21 * 60 + 15);
  const both = p("20 de diciembre a las 4");
  assert.equal(both.day, "2026-12-20");
  assert.equal(both.minutes, 16 * 60, "el 20 es el día, no la hora");
});

test("franjas y combinaciones", () => {
  assert.deepEqual(p("mañana en la mañana"), { day: "2026-11-20", minutes: null, period: "manana" });
  assert.equal(p("por la tarde").period, "tarde");
  const q = p("quiero cita el viernes a las 10 am");
  assert.equal(q.day, "2026-11-20");
  assert.equal(q.minutes, 600);
});

test("lo que no es fecha", () => {
  assert.equal(p("1"), null);
  assert.equal(p("hola"), null);
  assert.equal(p("Ana Pérez"), null);
});
