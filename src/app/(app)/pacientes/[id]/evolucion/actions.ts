"use server";

import { revalidatePath } from "next/cache";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NoteState = { error?: string; saved?: number };

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

  const supabase = await createClient();
  const { error } = await supabase.from("clinical_notes").insert({
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
  });
  if (error) return { error: "No se pudo guardar la nota." };

  revalidatePath(`/pacientes/${patientId}/evolucion`);
  return { saved: Date.now() };
}
