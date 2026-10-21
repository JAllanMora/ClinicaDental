"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { REMINDER_SELECT, getReminderSettings, pendingReminders, sendReminder } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

const LABEL = { enviado: "Enviado", simulado: "Registrado (sin proveedor configurado)", fallido: "Falló el envío", pendiente: "Pendiente", sin_contacto: "El paciente no tiene teléfono ni correo, o pidió no recibir mensajes" };

export async function sendAppointmentReminder(id: string, channel?: "whatsapp" | "sms" | "email") {
  await requireProfile();
  const supabase = await createClient();
  const [{ data: appt }, settings] = await Promise.all([
    supabase.from("appointments").select(REMINDER_SELECT).eq("id", id).single(),
    getReminderSettings(supabase),
  ]);
  if (!appt || !settings) return { error: "No se encontró la cita." };
  const res = await sendReminder(supabase, appt, settings, { kind: "manual", channel });
  revalidatePath("/agenda");
  revalidatePath("/agenda/recordatorios");
  const msg = LABEL[res.status];
  return res.status === "enviado" || res.status === "simulado"
    ? { ok: `${msg} por ${res.channel === "email" ? "correo" : res.channel === "sms" ? "SMS" : "WhatsApp"}.` }
    : { error: res.error ? `${msg}: ${res.error}` : msg };
}

export async function sendPendingReminders(day: string) {
  await requireProfile(["admin", "reception"]);
  const supabase = await createClient();
  const settings = await getReminderSettings(supabase);
  if (!settings) return { error: "Falta la configuración de recordatorios." };
  const list = await pendingReminders(supabase, day);
  const count: Record<string, number> = {};
  for (const appt of list) {
    const r = await sendReminder(supabase, appt, settings);
    count[r.status] = (count[r.status] ?? 0) + 1;
  }
  revalidatePath("/agenda/recordatorios");
  if (!list.length) return { ok: "No había recordatorios pendientes." };
  const NAMES: Record<string, string> = { enviado: "enviados", simulado: "en modo prueba", fallido: "fallidos", sin_contacto: "sin teléfono ni correo" };
  const parts = Object.entries(count).map(([k, n]) => `${n} ${NAMES[k] ?? k}`);
  return { ok: `${list.length} cita${list.length === 1 ? "" : "s"}: ${parts.join(", ")}.` };
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  days_before: z.coerce.number().int().min(0).max(7),
  clinic_phone: z.string().trim().max(30),
  whatsapp_template: z.string().trim().min(10).max(1000),
  sms_template: z.string().trim().min(10).max(320),
  email_subject: z.string().trim().min(3).max(200),
  email_template: z.string().trim().min(10).max(4000),
});

export async function saveReminderSettings(_prev: { error?: string; ok?: string }, formData: FormData): Promise<{ error?: string; ok?: string }> {
  await requireProfile(["admin"]);
  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    days_before: formData.get("days_before"),
    clinic_phone: formData.get("clinic_phone") ?? "",
    whatsapp_template: formData.get("whatsapp_template"),
    sms_template: formData.get("sms_template"),
    email_subject: formData.get("email_subject"),
    email_template: formData.get("email_template"),
  });
  if (!parsed.success) return { error: "Revisa los textos: no pueden quedar vacíos y el SMS admite hasta 320 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminder_settings")
    .update({ ...parsed.data, clinic_phone: parsed.data.clinic_phone || null })
    .eq("id", true);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/agenda/recordatorios");
  return { ok: "Configuración guardada." };
}
