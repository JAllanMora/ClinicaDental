// Configuración del bot. Todo se puede cambiar con variables en ../.env.local.
const env = process.env;

const list = (v) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Horario de atención para ofrecer citas, por día (0 = domingo … 6 = sábado).
 * Formato de BOT_HORARIO: "1-5=09:00-19:00;6=09:00-14:00" (días sin rango = cerrado).
 */
function parseHours(spec) {
  const hours = {};
  for (const part of spec.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [days, range] = part.split("=");
    const [open, close] = range.split("-").map((t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    });
    const [a, b] = days.split("-").map(Number);
    for (let d = a; d <= (b ?? a); d++) hours[d] = { open, close };
  }
  return hours;
}

export const config = {
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  clinicName: env.BOT_CLINICA ?? "Clínica Dental Villa San Juan",
  hours: parseHours(env.BOT_HORARIO ?? "1-5=09:00-19:00;6=09:00-14:00"),
  /** Cada cuántos minutos se ofrece un horario. */
  slotStep: Number(env.BOT_PASO_MINUTOS ?? 30),
  /** Anticipación mínima para agendar (horas). */
  minNoticeHours: Number(env.BOT_ANTICIPACION_HORAS ?? 2),
  /** Cuántos días hacia adelante se buscan horarios. */
  daysAhead: Number(env.BOT_DIAS_ADELANTE ?? 14),
  /**
   * Modo prueba (por defecto): el bot SOLO contesta y SOLO manda recordatorios a
   * los números de BOT_NUMEROS_PRUEBA. Así los pacientes de demostración no
   * reciben mensajes. Pon BOT_MODO=produccion para atender a todos.
   */
  production: env.BOT_MODO === "produccion",
  testNumbers: list(env.BOT_NUMEROS_PRUEBA).map((n) => n.replace(/\D/g, "")),
  remindersEnabled: env.BOT_RECORDATORIOS !== "no",
  /** Ventana del día en que se pueden mandar recordatorios (hora de la clínica). */
  reminderWindow: { from: 9 * 60, to: 20 * 60 },
  /** Cada cuánto se revisan recordatorios pendientes (minutos). */
  reminderEveryMinutes: Number(env.BOT_RECORDATORIOS_CADA_MIN ?? 30),
  /** Pausa entre recordatorios (segundos) para no parecer envío masivo. */
  reminderGap: [8, 20],
  /** Horas que el bot se queda callado en un chat cuando el paciente pide hablar con recepción. */
  humanPauseHours: Number(env.BOT_PAUSA_HUMANO_HORAS ?? 4),
};

if (!config.supabaseUrl || !config.serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
