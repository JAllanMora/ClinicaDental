import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLINIC_OFFSET, addDays, clinicParts, weekday } from "@/lib/agenda";
import type { Database, PaymentMethod } from "@/lib/database.types";
import { METHODS, round2 } from "@/lib/finance";

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Jornada que se usa para calcular la ocupación de sillones (lunes a sábado, 8:00 a 20:00). */
export const WORK_MINUTES_PER_DAY = 12 * 60;

export async function monthReport(db: SupabaseClient<Database>, month: string) {
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  const start = `${first}T00:00:00${CLINIC_OFFSET}`;
  const end = `${next}T00:00:00${CLINIC_OFFSET}`;

  const [payments, items, appts, patients, plans, chairs, balances, expenses] = await Promise.all([
    db.from("payments").select("amount, method, received_at").eq("voided", false).gte("received_at", start).lt("received_at", end),
    db
      .from("treatment_plan_items")
      .select("description, line_total, completed_by, treatment:treatments(name)")
      .eq("status", "realizado")
      .gte("completed_at", start)
      .lt("completed_at", end),
    db.from("appointments").select("status, starts_at, ends_at").gte("starts_at", start).lt("starts_at", end),
    db.from("patients").select("id", { count: "exact", head: true }).gte("created_at", start).lt("created_at", end),
    db.from("treatment_plans").select("status").gte("created_at", start).lt("created_at", end),
    db.from("chairs").select("id", { count: "exact", head: true }).eq("active", true),
    db.from("patient_balances").select("patient_id, balance").gt("balance", 0).order("balance", { ascending: false }),
    db.from("cash_expenses").select("amount").eq("voided", false).gte("spent_at", start).lt("spent_at", end),
  ]);

  // Ingresos por día y por forma de pago
  const days: string[] = [];
  for (let d = first; d < next; d = addDays(d, 1)) days.push(d);
  const daily = new Map(days.map((d) => [d, 0]));
  const byMethod = Object.fromEntries(METHODS.map((m) => [m.key, 0])) as Record<PaymentMethod, number>;
  for (const p of payments.data ?? []) {
    const d = clinicParts(p.received_at).day;
    daily.set(d, (daily.get(d) ?? 0) + Number(p.amount));
    byMethod[p.method] += Number(p.amount);
  }
  const income = round2(Object.values(byMethod).reduce((s, n) => s + n, 0));

  // Producción
  const byDentist = new Map<string, number>();
  const byTreatment = new Map<string, { total: number; count: number }>();
  for (const i of items.data ?? []) {
    const v = Number(i.line_total);
    if (i.completed_by) byDentist.set(i.completed_by, (byDentist.get(i.completed_by) ?? 0) + v);
    const name = i.treatment?.name ?? i.description;
    const t = byTreatment.get(name) ?? { total: 0, count: 0 };
    byTreatment.set(name, { total: t.total + v, count: t.count + 1 });
  }
  const production = round2([...byDentist.values()].reduce((s, n) => s + n, 0));

  // Citas
  const list = appts.data ?? [];
  const count = (s: string) => list.filter((a) => a.status === s).length;
  const cancelled = count("cancelada");
  const noShow = count("no_asistio");
  const scheduled = list.length - cancelled;
  const bookedMinutes = list
    .filter((a) => a.status !== "cancelada" && a.status !== "no_asistio")
    .reduce((s, a) => s + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000, 0);
  const workDays = days.filter((d) => weekday(d) !== 0).length;
  const capacity = (chairs.count ?? 0) * workDays * WORK_MINUTES_PER_DAY;

  // Presupuestos
  const presented = (plans.data ?? []).filter((p) => ["presentado", "aceptado", "rechazado", "terminado"].includes(p.status));
  const accepted = presented.filter((p) => p.status === "aceptado" || p.status === "terminado").length;

  return {
    days: days.map((d) => ({ day: d, amount: round2(daily.get(d) ?? 0) })),
    byMethod,
    income,
    expenses: round2((expenses.data ?? []).reduce((s, e) => s + Number(e.amount), 0)),
    production,
    byDentist: [...byDentist.entries()].map(([id, total]) => ({ id, total: round2(total) })).sort((a, b) => b.total - a.total),
    topTreatments: [...byTreatment.entries()]
      .map(([name, t]) => ({ name, total: round2(t.total), count: t.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    appointments: { scheduled, completed: count("completada"), cancelled, noShow, total: list.length },
    occupancy: capacity ? Math.min(1, bookedMinutes / capacity) : 0,
    newPatients: patients.count ?? 0,
    plans: { presented: presented.length, accepted },
    receivables: {
      total: round2((balances.data ?? []).reduce((s, b) => s + Number(b.balance), 0)),
      top: (balances.data ?? []).slice(0, 8),
    },
  };
}
