"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

const category = z.enum(Object.keys(EXPENSE_CATEGORIES) as [keyof typeof EXPENSE_CATEGORIES, ...(keyof typeof EXPENSE_CATEGORIES)[]]);
const method = z.enum(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "otro"]);

export async function addExpense(_prev: Result, formData: FormData): Promise<Result> {
  await requireProfile(["admin"]);
  const parsed = z
    .object({
      spent_on: z.iso.date(),
      category,
      concept: z.string().trim().min(2).max(160),
      amount: z.coerce.number().positive().max(10_000_000),
      method,
      supplier: z.string().trim().max(120),
      notes: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(["spent_on", "category", "concept", "amount", "method", "supplier", "notes"].map((k) => [k, String(formData.get(k) ?? "")])));
  if (!parsed.success) return { error: "Revisa la fecha, la categoría, el concepto y el monto." };
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({ ...parsed.data, supplier: parsed.data.supplier || null, notes: parsed.data.notes || null });
  if (error) return { error: "No se pudo registrar el gasto." };
  revalidatePath("/finanzas");
  return { ok: "Gasto registrado." };
}

export async function voidExpense(id: string, reason: string): Promise<Result> {
  await requireProfile(["admin"]);
  if (!reason.trim()) return { error: "Escribe el motivo." };
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").update({ voided: true, void_reason: reason.trim() }).eq("id", id);
  if (error) return { error: "No se pudo anular." };
  revalidatePath("/finanzas");
  return {};
}

export async function saveRecurring(_prev: Result, formData: FormData): Promise<Result> {
  await requireProfile(["admin"]);
  const parsed = z
    .object({
      category,
      concept: z.string().trim().min(2).max(160),
      amount: z.coerce.number().positive().max(10_000_000),
      day_of_month: z.coerce.number().int().min(1).max(28),
    })
    .safeParse(Object.fromEntries(["category", "concept", "amount", "day_of_month"].map((k) => [k, String(formData.get(k) ?? "")])));
  if (!parsed.success) return { error: "Revisa el concepto, el monto y el día (1 a 28)." };
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_expenses").insert(parsed.data);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/finanzas");
  return { ok: "Gasto fijo agregado." };
}

export async function toggleRecurring(id: string, active: boolean): Promise<Result> {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_expenses").update({ active }).eq("id", id);
  if (error) return { error: "No se pudo cambiar." };
  revalidatePath("/finanzas");
  return {};
}

export async function applyRecurring(month: string): Promise<Result> {
  await requireProfile(["admin"]);
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Mes inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_recurring_expenses", { p_month: `${month}-01` });
  if (error) return { error: "No se pudieron registrar." };
  revalidatePath("/finanzas");
  return { ok: data ? `Se registraron ${data} gastos fijos.` : "Los gastos fijos de este mes ya estaban registrados." };
}
