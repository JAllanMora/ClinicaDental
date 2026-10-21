"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { CONDITION_BY_KEY } from "@/lib/odontogram";
import { createClient } from "@/lib/supabase/server";

const findingSchema = z.object({
  tooth: z.number().int().min(11).max(85),
  surface: z.enum(["M", "O", "D", "V", "L"]).nullable(),
  condition: z.string().refine((c) => c in CONDITION_BY_KEY, "Condición desconocida"),
  layer: z.enum(["previo", "patologia", "propuesto", "realizado"]),
  notes: z.string().trim().max(500).nullable(),
});

export type FindingInput = z.input<typeof findingSchema>;

async function guard() {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) throw new Error("Sin permiso");
  return profile;
}

export async function addFinding(patientId: string, input: FindingInput) {
  const profile = await guard();
  const data = findingSchema.parse(input);
  // Una condición de pieza completa no lleva cara.
  if (CONDITION_BY_KEY[data.condition].scope === "tooth") data.surface = null;

  const supabase = await createClient();
  const { error } = await supabase.from("dental_findings").insert({
    ...data,
    patient_id: patientId,
    recorded_by: profile.id,
    ...(data.layer === "realizado" ? { completed_at: new Date().toISOString(), completed_by: profile.id } : {}),
  });
  if (error) return { error: "No se pudo guardar el hallazgo." };
  revalidatePath(`/pacientes/${patientId}/odontograma`);
  return {};
}

export async function completeFinding(patientId: string, id: string) {
  await guard();
  const supabase = await createClient();
  const { error } = await supabase.from("dental_findings").update({ layer: "realizado" }).eq("id", id);
  if (error) return { error: "No se pudo actualizar." };
  revalidatePath(`/pacientes/${patientId}/odontograma`);
  return {};
}

export async function voidFinding(patientId: string, id: string, reason: string) {
  await guard();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dental_findings")
    .update({ voided_at: new Date().toISOString(), void_reason: reason.trim() || "Sin motivo" })
    .eq("id", id);
  if (error) return { error: "No se pudo anular." };
  revalidatePath(`/pacientes/${patientId}/odontograma`);
  return {};
}
