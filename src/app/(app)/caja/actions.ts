"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/permissions";
import { round2 } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { todayStr } from "@/lib/agenda";
import { BanxicoCepError, consultarCepBanxico } from "@/lib/banxico-cep";
import { DISCREPANCY_LABEL, speiBanks, toBanxicoDate } from "@/lib/spei";
import { cashDay } from "./data";

type Result = { error?: string; ok?: string };

export async function addExpense(branchId: string, _prev: Result, formData: FormData): Promise<Result> {
  await requirePermission("caja");
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
  await requirePermission("caja");
  if (reason.trim().length < 3) return { error: "Escribe el motivo." };
  const supabase = await createClient();
  const { error } = await supabase.from("cash_expenses").update({ voided: true, void_reason: reason.trim() }).eq("id", id);
  if (error) return { error: error.message.includes("corte") ? error.message : "No se pudo cancelar." };
  revalidatePath("/caja");
  return {};
}

export async function closeDay(branchId: string, day: string, _prev: Result, formData: FormData): Promise<Result> {
  await requirePermission("caja");
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

export type SpeiResult = {
  error?: string;
  status?: "valida" | "no_coincide" | "no_encontrada";
  message?: string;
};

/** Consulta el CEP en Banxico con la clave de rastreo y guarda el resultado. */
export async function validateSpei(_prev: SpeiResult, formData: FormData): Promise<SpeiResult> {
  await requirePermission("caja");
  const parsed = z
    .object({
      tracking_key: z.string().trim().min(6).max(40),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      sender: z.string().trim().regex(/^\d{3,6}$/),
      amount: z.coerce.number().positive().max(100_000_000),
      payment_id: z.union([z.uuid(), z.literal("")]),
    })
    .safeParse({
      tracking_key: formData.get("tracking_key"),
      date: formData.get("date"),
      sender: formData.get("sender"),
      amount: formData.get("amount"),
      payment_id: formData.get("payment_id") ?? "",
    });
  if (!parsed.success) return { error: "Revisa la clave de rastreo, la fecha, el banco que envía y el monto." };
  const { tracking_key, date, sender, amount, payment_id } = parsed.data;
  if (date > todayStr()) return { error: "La fecha no puede ser futura." };

  const supabase = await createClient();
  const { data: cfg } = await supabase.from("spei_settings").select("*").maybeSingle();
  if (!cfg?.receiver_bank_code || !cfg.clabe) {
    return { error: "Falta configurar la cuenta receptora (banco y CLABE) en Configuración → Transferencias SPEI." };
  }

  let result: Awaited<ReturnType<typeof consultarCepBanxico>>;
  try {
    result = await consultarCepBanxico({
      fecha: toBanxicoDate(date),
      criterio: tracking_key.toUpperCase(),
      emisor: sender,
      receptor: cfg.receiver_bank_code,
      cuenta: cfg.clabe,
      monto: amount.toFixed(2),
    });
  } catch (e) {
    return { error: e instanceof BanxicoCepError ? `Banxico: ${e.message}. Intenta de nuevo en un momento.` : "No se pudo consultar Banxico." };
  }

  const banks = await speiBanks();
  const status: SpeiResult["status"] = !result.encontrado ? "no_encontrada" : result.valido ? "valida" : "no_coincide";
  const message = result.captchaRequerido
    ? "Banxico pidió verificación manual (captcha). Valídala en banxico.org.mx/cep."
    : status === "valida"
      ? "Transferencia válida: Banxico confirma el pago a la cuenta de la clínica."
      : status === "no_coincide"
        ? `Banxico encontró la operación pero no coincide en: ${(result.discrepancias ?? []).map((d) => DISCREPANCY_LABEL[d] ?? d).join(", ")}.`
        : `Banxico no encontró la operación. ${result.mensaje}`.trim();

  await supabase.from("spei_validations").insert({
    payment_id: payment_id || null,
    tracking_key: tracking_key.toUpperCase(),
    operation_date: date,
    sender_bank_code: sender,
    sender_bank_name: banks.find((b) => b.clave === sender)?.nombre ?? null,
    amount,
    receiver_bank_code: cfg.receiver_bank_code,
    clabe: cfg.clabe,
    found: result.encontrado,
    valid: result.valido,
    message,
    details: result.validaciones ? { validaciones: result.validaciones, discrepancias: result.discrepancias ?? [] } : null,
  });
  revalidatePath("/caja");
  return { status, message };
}
