"use server";

import { revalidatePath } from "next/cache";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { todayStr } from "@/lib/agenda";
import { addMonths, isDay } from "@/lib/recalls";
import { createClient } from "@/lib/supabase/server";

export type NoteState = { error?: string; saved?: number; recall?: string };

/** Lee y valida el «Recordarle regresar» de la nota. Devuelve null si no se pidió. */
function readRecall(formData: FormData, noteDay: string, procedure: string) {
  if (formData.get("recall") !== "on") return null;
  const months = String(formData.get("recall_months") ?? "6");
  const due = months === "custom" ? String(formData.get("recall_date") ?? "") : addMonths(noteDay, Number(months));
  if (!isDay(due)) return { error: "Elige la fecha del recordatorio." };
  if (due <= todayStr()) return { error: "La fecha del recordatorio debe ser futura." };
  if (due > addMonths(todayStr(), 36)) return { error: "El recordatorio puede ser a lo más a 3 años." };
  const reason = String(formData.get("recall_reason") ?? "").trim() || procedure;
  if (reason.length < 2 || reason.length > 200) return { error: "Escribe el motivo del regreso (máx. 200 caracteres)." };
  const type = String(formData.get("recall_type_id") ?? "");
  return { due_on: due, reason, appointment_type_id: /^[0-9a-f-]{36}$/i.test(type) ? type : null };
}

export async function addNote(patientId: string, _prev: NoteState, formData: FormData): Promise<NoteState> {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) return { error: "Sin permiso." };

  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const procedure = text("procedure");
  if (!procedure) return { error: "Escribe el procedimiento realizado." };

  const teeth = String(formData.get("teeth") ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  const valid = (t: number) =>
    Number.isInteger(t) &&
    ((Math.floor(t / 10) >= 1 && Math.floor(t / 10) <= 4 && t % 10 >= 1 && t % 10 <= 8) ||
      (Math.floor(t / 10) >= 5 && Math.floor(t / 10) <= 8 && t % 10 >= 1 && t % 10 <= 5));
  if (!teeth.every(valid)) return { error: "Revisa las piezas: usa notación FDI (p. ej. 16, 46, 55)." };

  const noteDay = text("note_date") ?? todayStr();
  const recall = readRecall(formData, isDay(noteDay) ? noteDay : todayStr(), procedure);
  if (recall && "error" in recall) return { error: recall.error };

  const supabase = await createClient();
  const { data: note, error } = await supabase
    .from("clinical_notes")
    .insert({
      patient_id: patientId,
      dentist_id: profile.id,
      note_date: text("note_date") ?? undefined,
      teeth,
      procedure,
      materials: text("materials"),
      anesthesia: text("anesthesia"),
      description: text("description"),
      next_steps: text("next_steps"),
      amends_note_id: text("amends_note_id"),
    })
    .select("id")
    .single();
  if (error || !note) return { error: "No se pudo guardar la nota." };

  let recallMsg: string | undefined;
  if (recall) {
    const { error: recallError } = await supabase.from("patient_recalls").insert({
      patient_id: patientId,
      dentist_id: profile.id,
      note_id: note.id,
      created_by: profile.id,
      due_on: recall.due_on,
      reason: recall.reason,
      appointment_type_id: recall.appointment_type_id,
    });
    if (recallError) return { saved: Date.now(), error: "La nota se guardó, pero no se pudo programar el recordatorio. Inténtalo desde Seguimientos." };
    recallMsg = recall.due_on;
  }

  revalidatePath(`/pacientes/${patientId}/evolucion`);
  revalidatePath(`/pacientes/${patientId}`);
  return { saved: Date.now(), recall: recallMsg };
}
