"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { FILE_KINDS } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

const fileSchema = z.object({
  kind: z.enum(FILE_KINDS.map((k) => k.key) as [string, ...string[]]),
  storage_path: z.string().min(10),
  file_name: z.string().min(1).max(200),
  mime_type: z.string().max(100).nullable(),
  size_bytes: z.number().int().nonnegative(),
  format: z.enum(["imagen", "dicom", "stl", "pdf", "otro"]),
  taken_on: z.iso.date(),
  teeth: z.array(z.number().int().min(11).max(85)),
  description: z.string().trim().max(500).nullable(),
});

export type RegisterFileInput = z.input<typeof fileSchema>;

/** Registra en el expediente un archivo que el navegador ya subió a Storage. */
export async function registerFile(patientId: string, input: RegisterFileInput) {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) return { error: "Sin permiso." };
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success || !parsed.data.storage_path.startsWith(`${patientId}/`)) return { error: "Datos del archivo inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("patient_files").insert({
    ...parsed.data,
    kind: parsed.data.kind as never,
    patient_id: patientId,
    uploaded_by: profile.id,
    description: parsed.data.description || null,
  });
  if (error) return { error: "El archivo se subió pero no se pudo registrar." };
  revalidatePath(`/pacientes/${patientId}/imagenes`);
  return {};
}

export async function voidFile(patientId: string, id: string, reason: string) {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) return;
  const supabase = await createClient();
  await supabase
    .from("patient_files")
    .update({ voided_at: new Date().toISOString(), void_reason: reason.trim() || "Sin motivo" })
    .eq("id", id);
  revalidatePath(`/pacientes/${patientId}/imagenes`);
}
