import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Lee ../.env.local (el mismo de la app) y luego .env propio; las variables del sistema ganan. */
function loadEnvFiles() {
  for (const file of [resolve(root, "../.env.local"), resolve(root, ".env")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

export function loadConfig() {
  loadEnvFiles();
  const env = process.env;
  const config = {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    // Para disparar los recordatorios diarios en la app (/api/cron/recordatorios).
    appUrl: (env.BOT_APP_URL || env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
    cronSecret: env.CRON_SECRET || null,
    reminderHour: Number(env.BOT_REMINDER_HOUR ?? 8),
    authDir: resolve(root, env.BOT_AUTH_DIR || "auth"),
    // Horas que el bot se calla en un chat cuando el paciente pide hablar con recepción.
    humanPauseHours: Number(env.BOT_PAUSA_HUMANO_HORAS ?? 4),
    // Al reconectarse, contesta lo que llegó con el bot apagado si tiene a lo más estas horas.
    pendingHours: Number(env.BOT_PENDIENTES_HORAS ?? 12),
    // En modo prueba sólo contesta y sólo manda recordatorios a estos números (10 dígitos, separados por coma).
    testMode: (env.BOT_MODO ?? "prueba") !== "produccion",
    testNumbers: (env.BOT_NUMEROS_PRUEBA ?? "")
      .split(",")
      .map((n) => n.replace(/\D/g, "").slice(-10))
      .filter(Boolean),
  };
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", config.supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", config.serviceKey],
  ].filter(([, v]) => !v);
  if (missing.length) {
    throw new Error(`Faltan variables: ${missing.map(([k]) => k).join(", ")} (en .env.local de la app o bot/.env)`);
  }
  return config;
}
