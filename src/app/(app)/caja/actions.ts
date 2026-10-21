"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { round2 } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { cashDay } from "./data";

type Result = { error?: string; ok?: string };

export async function addExpense(branchId: string, _prev: Result, formData: FormData): Promise<Result> {
  await requireProfile(["admin", "reception"]);
  const parsed = z
    .object({
      amount: z.coerce.number().positive().max(1_000_000),
      concept: z.string().trim().min(2).max(200),
      method: z.enum(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "otro"]),
    })
    .safeParse({ amount: formData.get("amount"), concept: formData.get("concept"), method: formData.get("method") });
  if (!parsed.success) return { error: "Escribe el concepto y un monto válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("cash_expenses").insert({ ...parsed.data, branch_id: branchId });
  if (error) return { error: error.message.includes("corte") ? error.message : "No se pudo registrar el egreso." };
  revalidatePath("/caja");
  return { ok: "Egreso registrado." };
}

export async function voidExpense(id: string, reason: string): Promise<Result> {
  await requireProfile(["admin", "reception"]);
  if (reason.trim().length < 3) return { error: "Escribe el motivo." };
  const supabase = await createClient();
  const { error } = await supabase.from("cash_expenses").update({ voided: true, void_reason: reason.trim() }).eq("id", id);
  if (error) return { error: error.message.includes("corte") ? error.message : "No se pudo cancelar." };
  revalidatePath("/caja");
  return {};
}

export async function closeDay(branchId: string, day: string, _prev: Result, formData: FormData): Promise<Result> {
  await requireProfile(["admin", "reception"]);
  const parsed = z
    .object({
      opening_cash: z.coerce.number().min(0).max(1_000_000),
      counted_cash: z.coerce.number().min(0).max(10_000_000),
      notes: z.string().trim().max(1000),
    })
    .safeParse({ opening_cash: formData.get("opening_cash") || 0, counted_cash: formData.get("counted_cash"), notes: formData.get("notes") ?? "" });
  if (!parsed.success || formData.get("counted_cash") === "") return { error: "Escribe el efectivo contado en caja." };

  const supabase = await createClient();
  // Los totales se calculan aquí, no se confía en lo que muestra la pantalla.
  const d = await cashDay(supabase, branchId, day);
  const expected = round2(parsed.data.opening_cash + d.byMethod.efectivo - d.cashExpenses);
  const { error } = await supabase.from("cash_closures").insert({
    branch_id: branchId,
    day,
    opening_cash: parsed.data.opening_cash,
    counted_cash: parsed.data.counted_cash,
    expected_cash: expected,
    totals: { ...d.byMethod, egresos: d.totalExpenses, cancelados: d.cancelled },
    notes: parsed.data.notes || null,
  });
  if (error) return { error: error.code === "23505" ? "Ese día ya tiene corte." : "No se pudo cerrar la caja." };
  revalidatePath("/caja");
  return { ok: "Corte de caja cerrado." };
}
