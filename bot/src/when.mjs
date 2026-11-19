// Fechas y horas escritas en español ("el próximo domingo a las 12 pm", "20 de diciembre",
// "mañana en la tarde", "20/12 4:30"). Determinista: sin servicios externos.
import { clinicParts } from "./dates.mjs";

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5,
  junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sep: 9, sept: 9,
  octubre: 10, oct: 10, noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};
const NUMBER_WORDS = { una: 1, uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¡!¿?,;]/g, " ")
    .replace(/\b(a|p)\s*\.\s*m\s*\.?/g, "$1m")
    .replace(/\s+/g, " ")
    .trim();
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function addDaysTo(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Interpreta fecha y hora. Regresa null si el texto no menciona ninguna.
 * { day: "YYYY-MM-DD" | null, minutes: número | null, period: "manana" | "tarde" | null, error?: "fecha_invalida" | "pasada" }
 */
export function parseWhen(text, nowIso = new Date().toISOString()) {
  let t = ` ${normalize(text)} `;
  const today = clinicParts(nowIso).day;
  const todayWd = clinicParts(nowIso).weekday;
  const [ty, tm, td] = today.split("-").map(Number);
  let day = null;
  let error;
  let period = null;
  let minutes = null;
  const cut = (re) => {
    t = t.replace(re, " ");
  };

  // Franja del día. "mañana en la mañana": la primera es el día, la segunda la franja.
  if (/\b(en|por|de|a) la manana\b|\btemprano\b|\bmatutin/.test(t)) period = "manana";
  if (/\b(en|por|de|a) la (tarde|noche)\b|\bvespertin/.test(t)) period = "tarde";
  const ampmHint = period;
  cut(/\b(en|por|de|a) la (manana|tarde|noche)\b/g);
  if (/\b(a(l)? )?medio ?dia\b/.test(t)) {
    minutes = 12 * 60;
    cut(/\b(a(l)? )?medio ?dia\b/g);
  }

  // --- Fecha ---------------------------------------------------------------
  let m;
  if (/\bpasado manana\b/.test(t)) {
    day = addDaysTo(today, 2);
    cut(/\bpasado manana\b/g);
  } else if (/\bmanana\b/.test(t)) {
    day = addDaysTo(today, 1);
    cut(/\bmanana\b/g);
  } else if (/\bhoy\b/.test(t)) {
    day = today;
    cut(/\bhoy\b/g);
  } else if ((m = t.match(/\ben (\d{1,2}|una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) (dias?|semanas?)\b/))) {
    const n = Number(m[1]) || NUMBER_WORDS[m[1]];
    day = addDaysTo(today, m[2].startsWith("semana") ? n * 7 : n);
    cut(m[0]);
  } else if ((m = t.match(new RegExp(`\\b(\\d{1,2}) (?:de )?(${MONTH_RE})\\b(?:\\.)?(?: (?:de |del )?(\\d{4}))?`)))) {
    ({ day, error } = explicitDate(Number(m[1]), MONTHS[m[2]], m[3] ? Number(m[3]) : null, ty, today));
    cut(m[0]);
  } else if ((m = t.match(new RegExp(`\\b(${MONTH_RE}) (\\d{1,2})\\b(?: (?:de |del )?(\\d{4}))?`)))) {
    ({ day, error } = explicitDate(Number(m[2]), MONTHS[m[1]], m[3] ? Number(m[3]) : null, ty, today));
    cut(m[0]);
  } else if ((m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    ({ day, error } = explicitDate(Number(m[1]), Number(m[2]), year, ty, today));
    cut(m[0]);
  } else if ((m = t.match(new RegExp(`\\b(proximo|siguiente|este|esta|el|la|para el)? ?(${WEEKDAYS.join("|")})( (que viene|proximo|siguiente))?\\b`)))) {
    const wd = WEEKDAYS.indexOf(m[2]);
    let delta = (wd - todayWd + 7) % 7;
    const next = /proximo|siguiente|que viene/.test(m[0]);
    if (delta === 0 && !/\b(este|esta|hoy)\b/.test(m[0])) delta = 7;
    if (next && delta === 0) delta = 7;
    if (/\b(proxima|siguiente) semana\b|\bsemana que viene\b/.test(t) && delta < 7) {
      // "el lunes de la próxima semana": el de la semana calendario siguiente.
      const daysToNextMonday = (8 - todayWd) % 7 || 7;
      if (delta < daysToNextMonday) delta += 7;
    }
    day = addDaysTo(today, delta);
    cut(m[0]);
  } else if ((m = t.match(/\b(?:el|para el|dia) (\d{1,2})\b(?! ?(?::|am|pm|hrs?|horas|de la))/))) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) {
      let y = ty;
      let mo = tm;
      if (d < td) mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
      day = validDate(y, mo, d) ? iso(y, mo, d) : null;
      if (!day) error = "fecha_invalida";
      cut(m[0]);
    }
  }

  // --- Hora ----------------------------------------------------------------
  if (minutes === null) {
    const timeRes = [
      /\b(?:a las|a la|las|tipo|como a las|despues de las|antes de las)? ?(\d{1,2})[:.](\d{2}) ?(am|pm|hrs?|horas)?\b/,
      /\b(?:a las|a la|las|tipo|como a las)? ?(\d{1,2}) ?(am|pm|hrs?|horas)\b/,
      /\b(?:a las|a la|como a las|tipo) (\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?: (y media|y cuarto|menos cuarto))?\b/,
    ];
    for (const re of timeRes) {
      const x = t.match(re);
      if (!x) continue;
      let h = Number(x[1]) || NUMBER_WORDS[x[1]];
      let min = 0;
      let suffix = null;
      if (re === timeRes[0]) {
        min = Number(x[2]);
        suffix = x[3] ?? null;
      } else if (re === timeRes[1]) {
        suffix = x[2];
      } else if (x[2] === "y media") min = 30;
      else if (x[2] === "y cuarto") min = 15;
      else if (x[2] === "menos cuarto") {
        h -= 1;
        min = 45;
      }
      if (h > 23 || min > 59) break;
      if (suffix === "pm" && h < 12) h += 12;
      else if (suffix === "am" && h === 12) h = 0;
      else if (!suffix || /^h/.test(suffix)) {
        if (ampmHint === "tarde" && h < 12) h += 12;
        else if (!ampmHint && h >= 1 && h <= 7) h += 12; // "a las 4" en una clínica es de la tarde
      }
      minutes = h * 60 + min;
      cut(x[0]);
      break;
    }
  }

  if (day === null && minutes === null && period === null && !error) return null;
  if (day && day < today && !error) error = "pasada";
  return { day, minutes, period, ...(error ? { error } : {}) };
}

function explicitDate(d, mo, year, ty, today) {
  if (!mo || mo > 12 || d < 1) return { day: null, error: "fecha_invalida" };
  let y = year ?? ty;
  if (!validDate(y, mo, d)) return { day: null, error: "fecha_invalida" };
  let day = iso(y, mo, d);
  // Sin año y ya pasó este año: el del año siguiente.
  if (!year && day < today) {
    y += 1;
    if (!validDate(y, mo, d)) return { day: null, error: "fecha_invalida" };
    day = iso(y, mo, d);
  }
  return { day };
}

/** ¿El texto suena a que quiere una cita? ("quiero cita", "agendar", "consulta"…) */
export const wantsAppointment = (text) => /\b(cita|agend|consulta|turno|reserv|apart)/.test(normalize(text));
