// Fechas en hora de la clínica. México (centro) no tiene horario de verano desde 2022: UTC−6.
const OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Día (YYYY-MM-DD), minutos desde medianoche y día de la semana en hora de la clínica. */
export function clinicParts(iso) {
  const local = new Date(new Date(iso).getTime() - OFFSET_MS);
  return {
    day: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay(),
  };
}

/** "9:00 a. m." · "4:30 p. m." · "12:00 p. m." */
export function timeLabel(minutes) {
  const h = Math.floor(minutes / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "jueves 20 de noviembre" */
export function dayLabel(day) {
  const [, m, d] = day.split("-").map(Number);
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return `${DAY_NAMES[wd]} ${d} de ${MONTH_NAMES[m - 1]}`;
}

/** "jueves 20 de noviembre a las 10:00 a. m." */
export function whenLabel(iso) {
  const { day, minutes } = clinicParts(iso);
  return `${dayLabel(day)} a las ${timeLabel(minutes)}`;
}

/** Inicio del día siguiente (hora de la clínica) como ISO. */
export function nextDayStart(iso) {
  const { day } = clinicParts(iso);
  const d = new Date(`${day}T00:00:00-06:00`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
