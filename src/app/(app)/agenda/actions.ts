"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { normalizeSearch } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string; id?: string };

const OVERLAP = "23P01"; // exclusion_violation

function friendly(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return undefined;
  if (error.code === OVERLAP) {
    return error.message?.includes("dentist")
      ? "El odontólogo ya tiene una cita en ese horario."
      : "El sillón ya está ocupado en ese horario.";
  }
  if (error.code === "42501") return "No tienes permiso para esta cita.";
  return fallback;
}

export async function searchPatients(query: string) {
  await requireProfile();
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  const supabase = await createClient();
  let req = supabase
    .from("patients")
    .select("id, record_number, first_name, last_name, second_last_name, phone, primary_dentist_id")
    .eq("active", true)
    .limit(8);
  for (const term of q.split(/\s+/)) req = req.ilike("search", `%${term}%`);
  const { data } = await req;
  return data ?? [];
}

const appointmentSchema = z.object({
  patient_id: z.uuid(),
  dentist_id: z.uuid(),
  chair_id: z.uuid(),
  type_id: z.uuid().nullable(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  reason: z.string().trim().max(300).nullable(),
  notes: z.string().trim().max(1000).nullable(),
});

export type AppointmentInput = z.input<typeof appointmentSchema>;

export async function createAppointment(input: AppointmentInput, waitlistId?: string): Promise<ActionResult> {
  await requireProfile();
  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return { error: "Completa paciente, odontólogo, sillón y horario." };
  if (parsed.data.ends_at <= parsed.data.starts_at) return { error: "La hora de fin debe ser posterior al inicio." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({ ...parsed.data, reason: parsed.data.reason || null, notes: parsed.data.notes || null })
    .select("id")
    .single();
  if (error || !data) return { error: friendly(error, "No se pudo agendar la cita.") };

  if (waitlistId) {
    await supabase.from("waitlist").update({ status: "agendada", appointment_id: data.id }).eq("id", waitlistId);
  }
  revalidatePath("/agenda");
  return { id: data.id };
}

export async function rescheduleAppointment(
  id: string,
  input: Pick<AppointmentInput, "dentist_id" | "chair_id" | "starts_at" | "ends_at" | "type_id" | "reason" | "notes">,
): Promise<ActionResult> {
  await requireProfile();
  const parsed = appointmentSchema.omit({ patient_id: true }).safeParse(input);
  if (!parsed.success) return { error: "Datos de la cita incompletos." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("appointments")
    .update({ ...parsed.data, reason: parsed.data.reason || null, notes: parsed.data.notes || null }, { count: "exact" })
    .eq("id", id);
  if (error) return { error: friendly(error, "No se pudo reprogramar.") };
  if (count === 0) return { error: "No tienes permiso para esta cita." };
  revalidatePath("/agenda");
  return {};
}

const statusSchema = z.enum(["programada", "confirmada", "en_sala", "en_atencion", "completada", "cancelada", "no_asistio"]);

export async function setAppointmentStatus(id: string, status: string, cancelReason?: string): Promise<ActionResult> {
  await requireProfile();
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Estado inválido." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("appointments")
    .update(
      { status: parsed.data, ...(parsed.data === "cancelada" ? { cancel_reason: cancelReason?.trim() || "Sin motivo" } : {}) },
      { count: "exact" },
    )
    .eq("id", id);
  if (error) return { error: friendly(error, "No se pudo cambiar el estado.") };
  if (count === 0) return { error: "No tienes permiso para esta cita." };
  revalidatePath("/agenda");
  revalidatePath("/");
  return {};
}

export async function addBlock(input: { dentist_id: string | null; chair_id: string | null; starts_at: string; ends_at: string; reason: string }) {
  const profile = await requireProfile();
  if (!input.reason.trim()) return { error: "Escribe el motivo del bloqueo." };
  const supabase = await createClient();
  const { error } = await supabase.from("schedule_blocks").insert({
    ...input,
    dentist_id: profile.role === "dentist" ? profile.id : input.dentist_id,
    reason: input.reason.trim(),
  });
  if (error) return { error: "No se pudo crear el bloqueo." };
  revalidatePath("/agenda");
  return {};
}

export async function removeBlock(id: string) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.from("schedule_blocks").delete().eq("id", id);
  revalidatePath("/agenda");
}

const waitlistSchema = z.object({
  patient_id: z.uuid(),
  type_id: z.uuid().nullable(),
  dentist_id: z.uuid().nullable(),
  preferred_time: z.enum(["manana", "tarde", "cualquiera"]),
  preferred_days: z.array(z.number().int().min(0).max(6)).min(1),
  short_notice: z.boolean(),
  priority: z.number().int().min(1).max(3),
  notes: z.string().trim().max(500).nullable(),
});

export async function addToWaitlist(input: z.input<typeof waitlistSchema>): Promise<ActionResult> {
  await requireProfile();
  const parsed = waitlistSchema.safeParse(input);
  if (!parsed.success) return { error: "Elige al paciente y al menos un día." };
  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({ ...parsed.data, notes: parsed.data.notes || null });
  if (error) return { error: "No se pudo agregar a la lista de espera." };
  revalidatePath("/agenda/espera");
  return {};
}

export async function setWaitlistStatus(id: string, status: "activa" | "descartada") {
  await requireProfile();
  const supabase = await createClient();
  await supabase.from("waitlist").update({ status }).eq("id", id);
  revalidatePath("/agenda/espera");
}
