import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayRange } from "@/lib/agenda";
import type { Database, PaymentMethod } from "@/lib/database.types";
import { METHODS, round2 } from "@/lib/finance";

/** Movimientos y totales de caja de un día y sucursal. */
export async function cashDay(db: SupabaseClient<Database>, branchId: string, day: string) {
  const [start, end] = dayRange(day);
  const [{ data: payments }, { data: expenses }, { data: closure }] = await Promise.all([
    db
      .from("payments")
      .select("*, patient:patients(id, first_name, last_name, second_last_name), receiver:profiles!payments_received_by_fkey(full_name)")
      .eq("branch_id", branchId)
      .gte("received_at", start)
      .lt("received_at", end)
      .order("received_at"),
    db.from("cash_expenses").select("*").eq("branch_id", branchId).gte("spent_at", start).lt("spent_at", end).order("spent_at"),
    db.from("cash_closures").select("*, closer:profiles!cash_closures_closed_by_fkey(full_name)").eq("branch_id", branchId).eq("day", day).maybeSingle(),
  ]);
  const byMethod = Object.fromEntries(METHODS.map((m) => [m.key, 0])) as Record<PaymentMethod, number>;
  const feeByMethod = Object.fromEntries(METHODS.map((m) => [m.key, 0])) as Record<PaymentMethod, number>;
  let cancelled = 0;
  for (const p of payments ?? []) {
    if (p.voided) cancelled += Number(p.amount);
    else {
      byMethod[p.method] += Number(p.amount);
      feeByMethod[p.method] = round2(feeByMethod[p.method] + Number(p.fee ?? 0));
    }
  }
  const fees = round2(Object.values(feeByMethod).reduce((s, n) => s + n, 0));
  const liveExpenses = (expenses ?? []).filter((e) => !e.voided);
  const cashExpenses = round2(liveExpenses.filter((e) => e.method === "efectivo").reduce((s, e) => s + Number(e.amount), 0));
  const totalExpenses = round2(liveExpenses.reduce((s, e) => s + Number(e.amount), 0));
  const income = round2(Object.values(byMethod).reduce((s, n) => s + n, 0));
  return {
    payments: payments ?? [],
    expenses: expenses ?? [],
    closure,
    byMethod,
    feeByMethod,
    fees,
    cancelled: round2(cancelled),
    cashExpenses,
    totalExpenses,
    income,
  };
}
