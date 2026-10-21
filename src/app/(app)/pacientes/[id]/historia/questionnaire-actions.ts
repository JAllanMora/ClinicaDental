"use server";

import { revalidatePath } from "next/cache";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Une un texto declarado por el paciente con lo que ya hay en la historia. */
function merge(current: string | null, incoming: string | undefined, date: string) {
  const v = incoming?.trim();
  if (!v) return current;
  if (!current?.trim()) return v;
  if (current.includes(v)) return current;
  return `${current}\n[Paciente ${date}] ${v}`;
}

export async function reviewQuestionnaire(patientId: string, questionnaireId: string, apply: boolean) {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) return { error: "Sin permiso." };
  const supabase = await createClient();
  const { data: q } = await supabase.from("patient_questionnaires").select("*").eq("id", questionnaireId).single();
  if (!q) return { error: "No se encontró el cuestionario." };

  if (apply) {
    const { data: h } = await supabase.from("medical_histories").select("*").eq("patient_id", patientId).maybeSingle();
    const a = q.answers;
    const date = formatDate(q.submitted_at);
    const prevConditions = (h?.pathological_history ?? {}) as Record<string, boolean>;
    const conditions = { ...prevConditions };
    for (const [k, v] of Object.entries(a.conditions ?? {})) if (v) conditions[k] = true;
    const allergies = [...new Set([...(h?.allergies ?? []), ...(a.allergies ?? [])])];
    const { error } = await supabase.from("medical_histories").upsert({
      patient_id: patientId,
      pathological_history: conditions,
      pathological_notes: merge(h?.pathological_notes ?? null, a.other_conditions, date),
      allergies,
      current_medications: merge(h?.current_medications ?? null, a.medications, date),
      surgeries: merge(h?.surgeries ?? null, a.surgeries, date),
      pregnant: a.pregnant ?? h?.pregnant ?? null,
      breastfeeding: a.breastfeeding ?? h?.breastfeeding ?? null,
      chief_complaint: merge(h?.chief_complaint ?? null, a.chief_complaint, date),
      dental_history: merge(h?.dental_history ?? null, [a.dental_history, a.last_dental_visit && `Última visita: ${a.last_dental_visit}`].filter(Boolean).join(". "), date),
      completed_by_patient: true,
      updated_by: profile.id,
    });
    if (error) return { error: "No se pudo actualizar la historia clínica." };
  }
  const { error } = await supabase.from("patient_questionnaires").update({ reviewed_at: new Date().toISOString() }).eq("id", questionnaireId);
  if (error) return { error: "No se pudo marcar como revisado." };
  revalidatePath(`/pacientes/${patientId}`, "layout");
  return {};
}
