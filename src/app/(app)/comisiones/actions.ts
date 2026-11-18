"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

const ruleSchema = z.object({
  dentist_id: z.union([z.uuid(), z.literal("")]),
  treatment_id: z.union([z.uuid(), z.literal("")]),
  pct: z.coerce.number().min(0).max(100),
});

/** Crea o cambia una regla (odontólogo, tratamiento o ambos). */
export async function saveCommissionRule(_prev: Result, formData: FormData): Promise<Result> {
  await requireProfile(["admin"]);
  const parsed = ruleSchema.safeParse({
    dentist_id: formData.get("dentist_id") ?? "",
    treatment_id: formData.get("treatment_id") ?? "",
    pct: formData.get("pct"),
  });
  if (!parsed.success) return { error: "El porcentaje va de 0 a 100." };
  const { dentist_id, treatment_id, pct } = parsed.data;
  if (!dentist_id && !treatment_id) return { error: "Elige un odontólogo, un tratamiento o ambos." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("commission_rates")
    .upsert({ dentist_id: dentist_id || null, treatment_id: treatment_id || null, pct }, { onConflict: "dentist_id,treatment_id" });
  if (error) return { error: "No se pudo guardar la regla." };
  revalidatePath("/comisiones");
  return { ok: "Regla guardada." };
}

export async function setDentistRate(dentistId: string, pct: number): Promise<Result> {
  await requireProfile(["admin"]);
  if (!z.uuid().safeParse(dentistId).success || !(pct >= 0 && pct <= 100)) return { error: "El porcentaje va de 0 a 100." };
  const supabase = await createClient();
  const { error } = await supabase.from("commission_rates").upsert({ dentist_id: dentistId, treatment_id: null, pct }, { onConflict: "dentist_id,treatment_id" });
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/comisiones");
  return { ok: "Guardado." };
}

export async function removeCommissionRule(id: string): Promise<Result> {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("commission_rates").delete().eq("id", id);
  if (error) return { error: "No se pudo quitar." };
  revalidatePath("/comisiones");
  return {};
}
