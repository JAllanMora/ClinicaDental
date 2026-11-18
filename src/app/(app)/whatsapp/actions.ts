"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

/** Recepción ya atendió el chat: el bot vuelve a contestar en ese número. */
export async function markAttended(phone: string): Promise<Result> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ attended_at: new Date().toISOString(), attended_by: profile.id })
    .eq("phone", phone)
    .eq("needs_attention", true)
    .is("attended_at", null);
  if (error) return { error: "No se pudo marcar." };
  revalidatePath("/whatsapp");
  revalidatePath("/");
  return { ok: "Atendido." };
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  ask_dentist: z.boolean(),
  days_ahead: z.coerce.number().int().min(1).max(60),
  min_notice_minutes: z.coerce.number().int().min(0).max(10080),
  bookable_type_ids: z.array(z.uuid()).min(1, "Elige al menos un tipo de cita."),
  welcome_message: z.string().trim().min(5).max(500),
  handoff_message: z.string().trim().min(5).max(500),
});

export async function saveWhatsappSettings(_prev: Result, formData: FormData): Promise<Result> {
  await requireProfile(["admin"]);
  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    ask_dentist: formData.get("ask_dentist") === "on",
    days_ahead: formData.get("days_ahead"),
    min_notice_minutes: Number(formData.get("min_notice_hours") ?? 0) * 60,
    bookable_type_ids: formData.getAll("bookable_type_ids").map(String),
    welcome_message: formData.get("welcome_message"),
    handoff_message: formData.get("handoff_message"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_settings").update(parsed.data).eq("id", true);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/whatsapp");
  return { ok: "Configuración guardada." };
}
