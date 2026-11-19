// Mensajes de los números de administrador: entradas de inventario ("ya compré 2 cajas de guantes")
// y consulta de alertas. Todo se confirma antes de tocar el inventario.
import { addMinutes, clinicParts, dayLabel } from "./dates.mjs";
import { normalize, parseWhen } from "./when.mjs";

const SESSION_MINUTES = 15;
export const EXPIRY_WARNING_DAYS = 60; // igual que en la app (src/lib/lab.ts)

const NUM_WORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, "media docena": 6, docena: 12 };
const IN_VERBS = /\b(compre|compramos|compraron|llego|llegaron|recibi|recibimos|entrada|entraron|agrega|agregar|agregue|suma|sumar|sume|meti|metimos|surti|surtimos|resurti)\b/;
const UNITS = [
  "cajas", "caja", "piezas", "pieza", "pzas", "pza", "paquetes", "paquete", "frascos", "frasco", "bolsas", "bolsa", "rollos", "rollo",
  "cartuchos", "cartucho", "jeringas", "jeringa", "tubos", "tubo", "litros", "litro", "galones", "galon", "kits", "kit", "unidades", "unidad",
  "sobres", "sobre", "botes", "bote", "cajitas", "cajita", "blisters", "blister", "pares", "par", "ampolletas", "ampolleta", "carpules", "carpule",
];
const STOP = new Set(["ya", "mas", "de", "del", "la", "el", "los", "las", "otra", "otras", "otro", "otros", "nuevas", "nuevos", "para", "y", "con", "que", "se", "me", "hoy", "a", "en", "por", "favor", "pf", "porfa", "le", "les"]);
const YES = /^(1|si|sí|s|confirmo|ok|va|dale|correcto|claro)\b/;
const NO = /^(2|no|cancela|cancelar|nel)\b/;

const singular = (u) => normalize(u).replace(/(es|s)$/, "").replace(/^pza$/, "pieza");
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

/** Distancia de edición (para tolerar faltas: "guantez", "anestecia"). */
function lev(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const tokens = (s) => normalize(s).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
const tokenMatch = (q, w) => w === q || (q.length >= 3 && w.startsWith(q)) || (q.length >= 4 && w.length >= 4 && lev(q, w) <= (q.length >= 7 ? 2 : 1)) || singular(q) === singular(w);

/** Artículos que se parecen a lo que escribió, mejor puntaje primero. */
export function matchItems(query, items) {
  return scoreItems(query, items).map((x) => x.item);
}

export function scoreItems(query, items) {
  const q = tokens(query);
  if (!q.length) return [];
  return items
    .map((it) => {
      const words = tokens(it.name);
      const hits = q.filter((t) => words.some((w) => tokenMatch(t, w))).length;
      const exact = normalize(it.name) === q.join(" ") ? 1 : 0;
      return { item: it, score: hits / q.length + exact + (hits ? hits / (words.length * 10) : 0) };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score);
}

/** "ya compré 2 cajas más de guantes de nitrilo, lote A12, caduca 15/03/2027, a $250 c/u" */
export function parseEntry(text, nowIso) {
  let t = ` ${normalize(text)} `;
  if (!IN_VERBS.test(t)) return null;
  let lot = null;
  let expires = null;
  let cost = null;
  let costIsTotal = false;

  let m = t.match(/\blote:? ?([a-z0-9-]+)/);
  if (m) {
    lot = m[1].toUpperCase();
    t = t.replace(m[0], " ");
  }
  m = t.match(/\b(?:caduca|caducidad|cad|vence|vencimiento|expira)(?: el| en)?:? ?([0-9a-z/ -]+?)(?=,| a \$| por \$| \$|$| lote)/);
  if (m) {
    const ym = m[1].trim().match(/^(\d{1,2})[/-](\d{4})$/) ?? m[1].trim().match(/^([a-z]+) (?:de |del )?(\d{4})$/);
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    if (ym) {
      const mo = Number(ym[1]) || months.indexOf(ym[1]) + 1;
      if (mo >= 1 && mo <= 12) expires = new Date(Date.UTC(Number(ym[2]), mo, 0)).toISOString().slice(0, 10); // fin de mes
    } else {
      const w = parseWhen(m[1], nowIso);
      if (w?.day) expires = w.day;
    }
    t = t.replace(m[0], " ");
  }
  m = t.match(/(?:a|por|en|costo|costaron|costo de|precio)? ?\$ ?(\d+(?:\.\d{1,2})?)( (?:c\/u|cada una?|c u|por pieza|por caja|cada caja|cada pieza))?|(\d+(?:\.\d{1,2})?) pesos( (?:c\/u|cada una?|c u))?/);
  if (m) {
    cost = Number(m[1] ?? m[3]);
    costIsTotal = !(m[2] ?? m[4]) && /\b(por|en|costaron|total)\b/.test(m[0] + t.slice(Math.max(0, t.indexOf(m[0]) - 12), t.indexOf(m[0])));
    t = t.replace(m[0], " ");
  }

  // Cantidad: número o palabra, justo antes de la unidad o del artículo.
  m = t.match(/\b(\d+(?:\.\d+)?|media docena|docena|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte)\b/);
  if (!m) return { qty: null, unit: null, query: tokens(t.replace(IN_VERBS, " ")).join(" "), lot, expires, cost, costIsTotal };
  const qty = Number(m[1]) || NUM_WORDS[m[1]];
  let rest = t.slice(t.indexOf(m[0]) + m[0].length);
  let unit = null;
  const um = rest.match(new RegExp(`^ ?(?:mas )?(${UNITS.join("|")})\\b`));
  if (um) {
    unit = um[1];
    rest = rest.slice(um[0].length);
  }
  const query = tokens(rest.replace(IN_VERBS, " ")).join(" ") || tokens(t.slice(0, t.indexOf(m[0])).replace(IN_VERBS, " ")).join(" ");
  return { qty, unit, query, lot, expires, cost, costIsTotal };
}

/** Alertas vigentes con clave estable (para no repetirlas). */
export async function currentAlerts(db, nowIso = new Date().toISOString()) {
  const today = clinicParts(nowIso).day;
  const limit = clinicParts(addMinutes(nowIso, EXPIRY_WARNING_DAYS * 24 * 60)).day;
  const [items, labs] = await Promise.all([db.inventory(), db.lateLabOrders(today)]);
  const out = [];
  for (const i of items) {
    if (i.stock <= i.min_stock) out.push({ key: `stock:${i.id}`, message: `Hace falta ${i.name}: quedan ${fmt(i.stock)} ${i.unit}${i.stock === 1 ? "" : "s"} (mínimo ${fmt(i.min_stock)}).` });
    if (i.expired_qty > 0) out.push({ key: `caducado:${i.id}`, message: `${i.name}: ${fmt(i.expired_qty)} ${i.unit}(s) ya caducaron. Hay que darlas de baja.` });
    else if (i.next_expiry && i.next_expiry <= limit) out.push({ key: `caduca:${i.id}:${i.next_expiry}`, message: `${i.name}: un lote caduca el ${dayLabel(i.next_expiry)}.` });
  }
  for (const o of labs) {
    const who = o.patient ? `${o.patient.first_name} ${o.patient.last_name}` : "paciente";
    out.push({ key: `lab:${o.id}:${o.due_date}`, message: `Laboratorio atrasado: ${o.work_type} de ${who}${o.lab?.name ? ` (${o.lab.name})` : ""}, se esperaba el ${dayLabel(o.due_date)}.` });
  }
  return out;
}

/**
 * Una pasada de alertas a administradores: a partir de `alertHour` manda el resumen
 * del día (una vez); el resto del día sólo lo nuevo. Lo resuelto se olvida para que,
 * si vuelve a pasar, se avise otra vez. Devuelve el mensaje enviado (o null).
 */
export async function runAdminAlerts(db, { recipients, alertHour, send, nowIso = new Date().toISOString() }) {
  const alerts = await currentAlerts(db, nowIso);
  const sent = await db.sentAlerts();
  const sentKeys = new Set(sent.map((r) => r.key));
  const live = new Set(alerts.map((a) => a.key));
  const { day, minutes } = clinicParts(nowIso);
  const digestKey = `digest:${day}`;
  await db.clearAlerts(sent.map((r) => r.key).filter((k) => (k.startsWith("digest:") ? k !== digestKey : !live.has(k))));

  let body = null;
  let mark = [];
  if (minutes >= alertHour * 60 && !sentKeys.has(digestKey)) {
    mark = [...alerts, { key: digestKey, message: "Resumen diario" }];
    if (alerts.length) body = ["☀️ Resumen del día — alertas de la clínica:", ...alerts.map((a) => `• ${a.message}`)].join("\n");
  } else {
    mark = alerts.filter((a) => !sentKeys.has(a.key));
    if (mark.length) body = ["⚠️ Nueva alerta:", ...mark.map((a) => `• ${a.message}`), "", "Escribe «alertas» para ver todas."].join("\n");
  }
  if (body) for (const p of recipients) await send(p, body);
  await db.markAlerts(mark);
  return body;
}

export function createAdminFlow(db, { now = () => new Date() } = {}) {
  const sessions = new Map();
  const set = (phone, step, data = {}) => sessions.set(phone, { step, data, at: now().getTime() });

  const help = [
    "Modo administrador. Puedes escribirme:",
    "• «ya compré 2 cajas de guantes» → registro la entrada (te pido confirmar)",
    "• Opcional en el mismo mensaje: «lote A12», «caduca 15/03/2027», «a $250 c/u» o «por $500»",
    "• «alertas» → lo que hace falta, lo que caduca y el laboratorio atrasado",
    "• «existencia de guantes» → cuánto hay de un artículo",
    "Para el menú de citas escribe «menú».",
  ].join("\n");

  function isAdminText(t) {
    return /^(admin|ayuda admin|alertas?|inventario|faltantes|que falta|existencias?|stock)\b/.test(t) || /^(existencia|cuanto hay|cuantos hay|cuantas hay|stock) /.test(t) || IN_VERBS.test(` ${t} `);
  }

  async function confirmText(entry, item, admin) {
    const unitNote = entry.unit && singular(entry.unit) !== singular(item.unit) ? ` (lo dijiste en ${entry.unit}; en el sistema se cuenta por ${item.unit})` : "";
    const extras = [entry.lot && `lote ${entry.lot}`, entry.expires && `caduca ${dayLabel(entry.expires)}`, entry.unitCost != null && `costo $${fmt(entry.unitCost)} c/u`].filter(Boolean);
    return [
      `¿Registro entrada de ${fmt(entry.qty)} ${item.unit}${entry.qty === 1 ? "" : "(s)"} de ${item.name}${extras.length ? ` (${extras.join(", ")})` : ""}?${unitNote}`,
      `Hoy hay ${fmt(item.stock)}; quedarían ${fmt(item.stock + entry.qty)}.`,
      "1. Sí, registrar",
      "2. No",
      ...(unitNote ? ["3. Corregir la cantidad"] : []),
      admin ? "" : "(Quedará registrado como entrada por WhatsApp del administrador.)",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function startEntry(phone, entry, admin) {
    if (!entry.qty || entry.qty <= 0) return ["¿Cuántas fueron? Escríbelo así: «compré 2 cajas de guantes»."];
    if (!entry.query) return ["¿De qué artículo? Escríbelo así: «compré 2 cajas de guantes»."];
    const items = await db.inventory();
    const scored = scoreItems(entry.query, items);
    const found = scored.map((x) => x.item);
    if (entry.cost != null) entry.unitCost = entry.costIsTotal ? Math.round((entry.cost / entry.qty) * 100) / 100 : entry.cost;
    if (!found.length) {
      set(phone, "idle");
      return [`No encontré «${entry.query}» en el inventario. Revisa el nombre o dalo de alta en el sistema (Inventario → Nuevo artículo).`];
    }
    const top = found[0];
    // Ambiguo si el segundo lugar empata o casi empata con el primero: se pregunta.
    if (scored.length > 1 && scored[0].score - scored[1].score < 0.34) {
      const options = found.slice(0, 5);
      set(phone, "pick_item", { entry, options });
      return [[`¿Cuál de estos es?`, ...options.map((o, i) => `${i + 1}. ${o.name} (hay ${fmt(o.stock)} ${o.unit})`), "0. Ninguno"].join("\n")];
    }
    set(phone, "confirm_entry", { entry, item: top });
    return [await confirmText(entry, top, admin)];
  }

  async function alertsText() {
    const alerts = await currentAlerts(db, now().toISOString());
    if (!alerts.length) return "Sin alertas: el inventario está arriba del mínimo y no hay laboratorio atrasado. ✅";
    return ["⚠️ Alertas de la clínica:", ...alerts.map((a) => `• ${a.message}`)].join("\n");
  }

  /** Regresa las respuestas, o null si el mensaje no es para el modo administrador. */
  async function handle(phone, text) {
    const t = normalize(text);
    let session = sessions.get(phone);
    if (session && now().getTime() - session.at > SESSION_MINUTES * 60_000) session = undefined;
    const active = session && session.step !== "idle";
    if (!active && !isAdminText(t)) return null;

    const admin = await db.adminProfile(phone);
    const reply = async () => {
      if (active) {
        const { step, data } = session;
        if (/^(menu|cancelar|salir)$/.test(t)) {
          set(phone, "idle");
          return ["Listo, cancelado."];
        }
        if (step === "pick_item") {
          const n = Number(t.match(/^\d+/)?.[0] ?? NaN);
          if (n === 0) {
            set(phone, "idle");
            return ["Ok, no registré nada."];
          }
          const item = data.options[n - 1];
          if (!item) return [`Responde con un número del 1 al ${data.options.length}, o 0.`];
          set(phone, "confirm_entry", { entry: data.entry, item });
          return [await confirmText(data.entry, item, admin)];
        }
        if (step === "fix_qty") {
          const q = Number(t.replace(",", ".").match(/\d+(\.\d+)?/)?.[0] ?? NaN);
          if (!(q > 0)) return [`¿Cuántas ${data.item.unit}s son en total? Escribe sólo el número.`];
          const entry = { ...data.entry, qty: q, unit: data.item.unit };
          if (entry.cost != null) entry.unitCost = entry.costIsTotal ? Math.round((entry.cost / q) * 100) / 100 : entry.unitCost;
          set(phone, "confirm_entry", { entry, item: data.item });
          return [await confirmText(entry, data.item, admin)];
        }
        if (step === "confirm_entry") {
          if (/^3\b/.test(t)) {
            set(phone, "fix_qty", data);
            return [`¿Cuántas ${data.item.unit}s son en total?`];
          }
          if (NO.test(t)) {
            set(phone, "idle");
            return ["Ok, no registré nada."];
          }
          if (!YES.test(t)) return ["Responde 1 para registrar o 2 para cancelar."];
          const { entry, item } = data;
          await db.inventoryIn({
            itemId: item.id,
            qty: entry.qty,
            actorId: admin?.id ?? null,
            lot: entry.lot,
            expires: entry.expires,
            cost: entry.unitCost ?? null,
            reason: `Entrada por WhatsApp (${admin?.full_name ?? `admin ${phone.slice(-4)}`}): «${String(entry.original).slice(0, 120)}»`,
          });
          set(phone, "idle");
          return [`✅ Registré ${fmt(entry.qty)} ${item.unit}(s) de ${item.name}. Existencia: ${fmt(item.stock + entry.qty)} ${item.unit}(s).`];
        }
      }

      if (/^(admin|ayuda admin)\b/.test(t)) return [help];
      if (/^(alertas?|faltantes|que falta|inventario)$/.test(t)) return [await alertsText()];
      const ex = t.match(/^(?:existencias?|cuant[oa]s? hay|stock)(?: de)? (.+)$/);
      if (ex) {
        const found = matchItems(ex[1], await db.inventory()).slice(0, 5);
        if (!found.length) return [`No encontré «${ex[1]}» en el inventario.`];
        return [found.map((i) => `• ${i.name}: ${fmt(i.stock)} ${i.unit}(s)${i.stock <= i.min_stock ? " ⚠️ bajo mínimo" : ""}`).join("\n")];
      }
      const entry = parseEntry(text, now().toISOString());
      if (entry) return startEntry(phone, { ...entry, original: String(text) }, admin);
      return [help];
    };

    const out = await reply();
    // Bitácora de la conversación (Agenda → WhatsApp).
    await db.log({ phone, direction: "entrante", body: `[admin] ${String(text)}` });
    for (const body of out) await db.log({ phone, direction: "saliente", body });
    return out;
  }

  return { handle, sessions };
}
