import { addDays, todayStr } from "@/lib/agenda";
import { getReminderSettings, pendingReminders, sendReminder } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Envío diario de recordatorios. Vercel Cron lo llama con
 * `Authorization: Bearer $CRON_SECRET` (ver vercel.json).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const db = createAdminClient();
  const settings = await getReminderSettings(db);
  if (!settings?.enabled) return Response.json({ skipped: "Recordatorios desactivados" });

  const day = addDays(todayStr(), settings.days_before);
  const appointments = await pendingReminders(db, day);
  const summary: Record<string, number> = {};
  for (const appt of appointments) {
    const { status } = await sendReminder(db, appt, settings);
    summary[status] = (summary[status] ?? 0) + 1;
  }
  return Response.json({ day, total: appointments.length, ...summary });
}
