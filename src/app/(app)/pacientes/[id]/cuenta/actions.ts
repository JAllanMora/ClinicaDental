"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import type { PlanItemStatus, PlanStatus } from "@/lib/database.types";
import { CONDITION_LABEL, SURFACE_LABEL } from "@/lib/odontogram";
import { createClient } from "@/lib/supabase/server";

export type Result = { error?: string; ok?: string };
type FormResult = Result & { values?: Record<string, string> };

/** Tratamiento sugerido del arancel para un hallazgo "propuesto" del odontograma. */
function suggestedTreatment(condition: string, tooth: number, surfaces: number) {
  const unit = tooth % 10;
  switch (condition) {
    case "resina":
    case "caries":
      return surfaces > 1 ? "Resina (2 o más superficies)" : "Resina (1 superficie)";
    case "sellador":
      return "Sellador de fosetas y fisuras";
    case "incrustacion":
      return "Incrustación";
    case "extraccion":
    case "resto_radicular":
      return unit === 8 ? "Extracción de tercer molar" : "Extracción simple";
    case "endodoncia":
      return unit >= 6 ? "Endodoncia multirradicular" : unit >= 4 ? "Endodoncia birradicular" : "Endodoncia unirradicular";
    case "corona":
      return tooth > 50 ? "Corona de acero (dentición temporal)" : "Corona de zirconia";
    case "implante":
      return "Implante dental (fase quirúrgica)";
    case "perno":
      return "Poste de fibra de vidrio";
    default:
      return null;
  }
}

export async function createPlan(patientId: string, fromOdontogram: boolean) {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("primary_dentist_id").eq("id", patientId).single();
  const { data: plan, error } = await supabase
    .from("treatment_plans")
    .insert({
      patient_id: patientId,
      dentist_id: me.role === "dentist" ? me.id : (patient?.primary_dentist_id ?? null),
      valid_until: new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error || !plan) return { error: "No se pudo crear el presupuesto." };

  if (fromOdontogram) {
    const [{ data: findings }, { data: treatments }] = await Promise.all([
      supabase
        .from("dental_findings")
        .select("tooth, surface, condition")
        .eq("patient_id", patientId)
        .eq("layer", "propuesto")
        .is("voided_at", null)
        .is("completed_at", null)
        .order("tooth"),
      supabase.from("treatments").select("id, name, price").eq("active", true),
    ]);
    // Agrupa superficies de la misma pieza y condición en una sola partida.
    const groups = new Map<string, { tooth: number; condition: string; surfaces: string[] }>();
    for (const f of findings ?? []) {
      const key = `${f.tooth}-${f.condition}`;
      const g = groups.get(key) ?? { tooth: f.tooth, condition: f.condition, surfaces: [] };
      if (f.surface) g.surfaces.push(f.surface);
      groups.set(key, g);
    }
    const byName = new Map((treatments ?? []).map((t) => [t.name, t]));
    const items = [...groups.values()].map((g, i) => {
      const t = byName.get(suggestedTreatment(g.condition, g.tooth, g.surfaces.length) ?? "");
      const surf = g.surfaces.length ? ` (${g.surfaces.map((s) => SURFACE_LABEL[s as keyof typeof SURFACE_LABEL] ?? s).join(", ")})` : "";
      return {
        plan_id: plan.id,
        treatment_id: t?.id ?? null,
        description: (t?.name ?? CONDITION_LABEL[g.condition] ?? g.condition) + surf,
        tooth: g.tooth,
        unit_price: t?.price ?? 0,
        sort: i,
      };
    });
    if (items.length) await supabase.from("treatment_plan_items").insert(items);
  }
  redirect(`/pacientes/${patientId}/cuenta/presupuesto/${plan.id}`);
}

const planSchema = z.object({
  title: z.string().trim().min(2).max(120),
  dentist_id: z.uuid().nullable(),
  valid_until: z.iso.date().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export async function updatePlan(patientId: string, planId: string, input: z.input<typeof planSchema>): Promise<Result> {
  await requireProfile();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa el título y la vigencia." };
  const supabase = await createClient();
  const { error } = await supabase.from("treatment_plans").update(parsed.data).eq("id", planId);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath(`/pacientes/${patientId}/cuenta`, "layout");
  return { ok: "Guardado." };
}

export async function setPlanStatus(patientId: string, planId: string, status: PlanStatus): Promise<Result> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("treatment_plans").update({ status }).eq("id", planId);
  if (error) return { error: "No se pudo cambiar el estado." };
  revalidatePath(`/pacientes/${patientId}/cuenta`, "layout");
  return {};
}

const itemSchema = z.object({
  treatment_id: z.uuid().nullable(),
  description: z.string().trim().min(2).max(200),
  tooth: z.number().int().min(11).max(85).nullable(),
  phase: z.number().int().min(1).max(9),
  quantity: z.number().int().min(1).max(99),
  unit_price: z.number().min(0).max(1_000_000),
  discount_pct: z.number().min(0).max(100),
});
export type ItemInput = z.input<typeof itemSchema>;

export async function saveItem(patientId: string, planId: string, itemId: string | null, input: ItemInput): Promise<Result> {
  await requireProfile();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa descripción, pieza (FDI), cantidad y precio." };
  const supabase = await createClient();
  const { error } = itemId
    ? await supabase.from("treatment_plan_items").update(parsed.data).eq("id", itemId)
    : await supabase.from("treatment_plan_items").insert({ ...parsed.data, plan_id: planId, sort: Date.now() % 1_000_000_000 });
  if (error) return { error: error.message.includes("realizado") ? error.message : "No se pudo guardar la partida." };
  revalidatePath(`/pacientes/${patientId}/cuenta`, "layout");
  return {};
}

export async function setItemStatus(patientId: string, itemId: string, status: PlanItemStatus): Promise<Result> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("treatment_plan_items").update({ status }).eq("id", itemId);
  if (error) return { error: error.message.startsWith("Sólo") ? error.message : "No se pudo actualizar la partida." };
  revalidatePath(`/pacientes/${patientId}/cuenta`, "layout");
  return {};
}

export async function deleteItem(patientId: string, itemId: string): Promise<Result> {
  await requireProfile();
  const supabase = await createClient();
  const { count } = await supabase.from("treatment_plan_items").delete({ count: "exact" }).eq("id", itemId);
  if (!count) return { error: "Sólo se eliminan partidas pendientes de un presupuesto en borrador; en otro caso, cancélala." };
  revalidatePath(`/pacientes/${patientId}/cuenta`, "layout");
  return {};
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  method: z.enum(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "otro"]),
  plan_id: z.union([z.uuid(), z.literal("")]),
  reference: z.string().trim().max(100),
  notes: z.string().trim().max(500),
});

export async function addPayment(patientId: string, branchId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireProfile(["admin", "reception"]);
  const raw = Object.fromEntries(["amount", "method", "plan_id", "reference", "notes"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return { error: "Escribe un monto válido y la forma de pago.", values: raw };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      patient_id: patientId,
      branch_id: branchId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      plan_id: parsed.data.plan_id || null,
      reference: parsed.data.reference || null,
      notes: parsed.data.notes || null,
    })
    .select("folio")
    .single();
  if (error || !data) return { error: error?.message.includes("corte") ? error.message : "No se pudo registrar el pago.", values: raw };
  revalidatePath(`/pacientes/${patientId}/cuenta`, "layout");
  revalidatePath("/caja");
  return { ok: `Pago registrado (recibo ${String(data.folio).padStart(5, "0")}).` };
}

export async function voidPayment(patientId: string, paymentId: string, reason: string): Promise<Result> {
  await requireProfile(["admin", "reception"]);
  if (reason.trim().length < 3) return { error: "Escribe el motivo de la cancelación." };
  const supabase = await createClient();
  const { error } = await supabase.from("payments").update({ voided: true, void_reason: reason.trim() }).eq("id", paymentId);
  if (error) return { error: error.message.includes("corte") ? error.message : "No se pudo cancelar el pago." };
  revalidatePath(`/pacientes/${patientId}/cuenta`, "layout");
  revalidatePath("/caja");
  return {};
}
