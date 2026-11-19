"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { todayStr } from "@/lib/agenda";
import { addMonths, isDay } from "@/lib/recalls";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

function refresh(patientId?: string) {
  revalidatePath("/agenda/seguimientos");
  if (patientId) {
    revalidatePath(`/pacientes/${patientId}`);
    revalidatePath(`/pacientes/${patientId}/evolucion`);
  }
}

/** Cambia la fecha del recordatorio; vuelve a quedar programado (se reinician los envíos). */
export async function rescheduleRecall(id: string, due: string): Promise<Result> {
  await requireProfile();
  if (!isDay(due) || due <= todayStr() || due > addMonths(todayStr(), 36)) return { error: "Elige una fecha futura (máx. 3 años)." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patient_recalls")
    .update({ due_on: due, status: "pendiente", sent_count: 0, sent_at: null, responded_at: null })
    .eq("id", id)
    .in("status", ["pendiente", "enviado", "declinado"])
    .select("patient_id")
    .maybeSingle();
  if (error || !data) return { error: "No se pudo cambiar la fecha." };
  refresh(data.patient_id);
  return { ok: "Fecha actualizada." };
}

export async function cancelRecall(id: string, reason: string): Promise<Result> {
  await requireProfile();
  const why = reason.trim();
  if (why.length < 3) return { error: "Escribe el motivo de la cancelación." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patient_recalls")
    .update({ status: "cancelado", cancel_reason: why.slice(0, 200) })
    .eq("id", id)
    .in("status", ["pendiente", "enviado", "declinado"])
    .select("patient_id")
    .maybeSingle();
  if (error || !data) return { error: "No se pudo cancelar." };
  refresh(data.patient_id);
  return { ok: "Recordatorio cancelado." };
}
