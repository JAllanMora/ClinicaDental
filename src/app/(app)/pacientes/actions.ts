"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { PATHOLOGICAL_CONDITIONS } from "@/lib/clinical";
import { createClient } from "@/lib/supabase/server";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Valores enviados, para no perderlos si hay errores (React reinicia el formulario). */
  values?: Record<string, string>;
  saved?: boolean;
};

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const patientSchema = z.object({
  first_name: z.string().trim().min(1, "Requerido"),
  last_name: z.string().trim().min(1, "Requerido"),
  second_last_name: optionalText,
  birth_date: optionalText.refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha inválida"),
  sex: z
    .enum(["F", "M", "X", ""])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  curp: optionalText
    .transform((v) => v?.toUpperCase() ?? null)
    .refine((v) => !v || /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d$/.test(v), "CURP inválida"),
  phone: optionalText,
  email: optionalText.refine((v) => !v || z.email().safeParse(v).success, "Correo inválido"),
  address: optionalText,
  occupation: optionalText,
  emergency_contact_name: optionalText,
  emergency_contact_phone: optionalText,
  guardian_name: optionalText,
  referred_by: optionalText,
  notes: optionalText,
  primary_dentist_id: optionalText,
  branch_id: optionalText,
});

function readForm(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(patientSchema.shape)) {
    raw[key] = String(formData.get(key) ?? "");
  }
  return { raw, parsed: patientSchema.safeParse(raw) };
}

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

export async function createPatient(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireProfile();
  const { raw, parsed } = readForm(formData);
  if (!parsed.success) {
    return { error: "Revisa los campos marcados.", fieldErrors: fieldErrors(parsed.error), values: raw };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("patients").insert(parsed.data).select("id").single();
  if (error || !data) return { error: "No se pudo guardar el paciente.", values: raw };

  revalidatePath("/pacientes");
  redirect(`/pacientes/${data.id}`);
}

export async function updatePatient(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireProfile();
  const { raw, parsed } = readForm(formData);
  if (!parsed.success) {
    return { error: "Revisa los campos marcados.", fieldErrors: fieldErrors(parsed.error), values: raw };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("patients").update(parsed.data).eq("id", id);
  if (error) return { error: "No se pudo actualizar el paciente.", values: raw };

  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}`);
}

export async function setPatientActive(id: string, active: boolean) {
  await requireProfile(["admin", "reception"]);
  const supabase = await createClient();
  await supabase.from("patients").update({ active }).eq("id", id);
  revalidatePath(`/pacientes/${id}`);
}

export async function saveMedicalHistory(patientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) return { error: "No tienes permiso para editar la historia clínica." };

  const text = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v === "" ? null : v;
  };
  const tri = (key: string) => {
    const v = formData.get(key);
    return v === "si" ? true : v === "no" ? false : null;
  };

  const pathological: Record<string, boolean> = {};
  for (const c of PATHOLOGICAL_CONDITIONS) {
    pathological[c.key] = formData.get(`cond_${c.key}`) === "on";
  }

  const allergies = String(formData.get("allergies") ?? "")
    .split(/[,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase.from("medical_histories").upsert({
    patient_id: patientId,
    pathological_history: pathological,
    pathological_notes: text("pathological_notes"),
    non_pathological_history: text("non_pathological_history"),
    family_history: text("family_history"),
    allergies,
    current_medications: text("current_medications"),
    surgeries: text("surgeries"),
    pregnant: tri("pregnant"),
    breastfeeding: tri("breastfeeding"),
    blood_pressure: text("blood_pressure"),
    chief_complaint: text("chief_complaint"),
    current_illness: text("current_illness"),
    dental_history: text("dental_history"),
    updated_by: profile.id,
  });
  if (error) return { error: "No se pudo guardar la historia clínica." };

  revalidatePath(`/pacientes/${patientId}`);
  return { saved: true };
}
