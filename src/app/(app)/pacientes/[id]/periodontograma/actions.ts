"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PerioData } from "@/lib/database.types";

const num = z.number().int().min(-5).max(20).nullable().optional();
const site = z.object({ pd: num, rec: num, bop: z.boolean().optional(), sup: z.boolean().optional() });
const toothSchema = z.object({
  mobility: z.number().int().min(0).max(3).nullable().optional(),
  furcation: z.number().int().min(0).max(3).nullable().optional(),
  missing: z.boolean().optional(),
  implant: z.boolean().optional(),
  sites: z.partialRecord(z.enum(["MV", "V", "DV", "ML", "L", "DL"]), site).optional(),
});
const examSchema = z.object({
  exam_date: z.iso.date(),
  dentition: z.enum(["permanente", "temporal"]),
  notes: z.string().trim().max(2000).nullable(),
  data: z.record(z.string().regex(/^[1-8][1-8]$/), toothSchema),
});

export async function saveExam(
  patientId: string,
  examId: string | null,
  input: { exam_date: string; dentition: "permanente" | "temporal"; notes: string | null; data: PerioData },
) {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) return { error: "Sin permiso." };
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { error: "Hay valores fuera de rango." };

  const supabase = await createClient();
  const payload = { ...parsed.data, data: parsed.data.data as PerioData, notes: parsed.data.notes || null };
  let id = examId;
  if (examId) {
    const { error } = await supabase.from("periodontal_exams").update(payload).eq("id", examId);
    if (error) return { error: "No se pudo guardar." };
  } else {
    const { data, error } = await supabase
      .from("periodontal_exams")
      .insert({ ...payload, patient_id: patientId, examiner_id: profile.id })
      .select("id")
      .single();
    if (error || !data) return { error: "No se pudo guardar." };
    id = data.id;
  }
  revalidatePath(`/pacientes/${patientId}/periodontograma`);
  if (!examId) redirect(`/pacientes/${patientId}/periodontograma?examen=${id}`);
  return { saved: true };
}
