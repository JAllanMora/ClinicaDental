"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { addDays, isValidDay, toISO } from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const shiftsSchema = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), starts: time, ends: time }))
  .max(50);

/** Admin edita a cualquiera; el odontólogo sólo su propio horario. */
async function canEdit(dentistId: string) {
  const profile = await requireProfile();
  return profile.role === "admin" || (profile.role === "dentist" && profile.id === dentistId);
}

export async function saveWorkingHours(dentistId: string, shifts: z.input<typeof shiftsSchema>): Promise<Result> {
  if (!(await canEdit(dentistId))) return { error: "Sólo el administrador o el propio odontólogo pueden cambiar este horario." };
  const parsed = shiftsSchema.safeParse(shifts);
  if (!parsed.success) return { error: "Revisa las horas: usa el formato HH:MM." };
  for (const s of parsed.data) if (s.ends <= s.starts) return { error: "Cada turno debe terminar después de empezar." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_working_hours", { p_dentist: dentistId, p_shifts: parsed.data });
  if (error) {
    if (error.message.includes("empalmados")) return { error: "Hay turnos empalmados el mismo día." };
    return { error: error.code === "42501" ? "No tienes permiso para este horario." : "No se pudo guardar el horario." };
  }
  revalidatePath("/agenda/horarios");
  revalidatePath("/agenda");
  return { ok: "Horario guardado." };
}

const dayOffSchema = z.object({
  dentist_id: z.uuid(),
  from: z.string().refine(isValidDay),
  to: z.string().refine(isValidDay),
  allDay: z.boolean(),
  starts: time.optional(),
  ends: time.optional(),
  reason: z.string().trim().min(1).max(200),
});

export async function addDayOff(input: z.input<typeof dayOffSchema>): Promise<Result> {
  const profile = await requireProfile();
  const parsed = dayOffSchema.safeParse(input);
  if (!parsed.success) return { error: "Completa las fechas y el motivo." };
  const d = parsed.data;
  if (profile.role === "dentist" && profile.id !== d.dentist_id) return { error: "Sólo puedes bloquear tus propios días." };
  if (d.to < d.from) return { error: "La fecha final debe ser igual o posterior a la inicial." };

  let starts_at: string;
  let ends_at: string;
  if (d.allDay) {
    starts_at = toISO(d.from, 0);
    ends_at = toISO(addDays(d.to, 1), 0);
  } else {
    if (!d.starts || !d.ends || d.ends <= d.starts) return { error: "Indica la hora de inicio y fin del bloqueo." };
    if (d.from !== d.to) return { error: "Un bloqueo por horas debe ser de un solo día." };
    const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    starts_at = toISO(d.from, min(d.starts));
    ends_at = toISO(d.from, min(d.ends));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedule_blocks")
    .insert({ dentist_id: d.dentist_id, chair_id: null, starts_at, ends_at, reason: d.reason });
  if (error) return { error: "No se pudo guardar el bloqueo." };
  revalidatePath("/agenda/horarios");
  revalidatePath("/agenda");
  return { ok: "Bloqueo guardado." };
}

export async function removeDayOff(id: string): Promise<Result> {
  await requireProfile();
  const supabase = await createClient();
  const { error, count } = await supabase.from("schedule_blocks").delete({ count: "exact" }).eq("id", id);
  if (error || count === 0) return { error: "No se pudo quitar el bloqueo (¿tienes permiso?)." };
  revalidatePath("/agenda/horarios");
  revalidatePath("/agenda");
  return { ok: "Bloqueo quitado." };
}
