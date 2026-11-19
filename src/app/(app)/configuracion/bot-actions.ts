"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./actions";

/** Teléfono a 10 dígitos (quita lada 52 / 521). */
function phone10(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) return d.slice(3);
  if (d.length === 12 && d.startsWith("52")) return d.slice(2);
  return d;
}

/** Doctor de primera vez, doctor del expediente, números de administrador y alertas del bot. */
export async function saveBotAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const phones = String(formData.get("admin_phones") ?? "")
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(phone10);
  if (phones.some((p) => p.length !== 10)) return { error: "Cada número de administrador debe tener 10 dígitos (sin lada internacional)." };
  if (phones.length > 5) return { error: "Máximo 5 números de administrador." };

  const parsed = z
    .object({
      first_visit_dentist_id: z.union([z.uuid(), z.literal("")]),
      alert_hour: z.coerce.number().int().min(0).max(23),
    })
    .safeParse({ first_visit_dentist_id: formData.get("first_visit_dentist_id") ?? "", alert_hour: formData.get("alert_hour") });
  if (!parsed.success) return { error: "Revisa el doctor y la hora del resumen." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_settings")
    .update({
      first_visit_dentist_id: parsed.data.first_visit_dentist_id || null,
      keep_own_dentist: formData.get("keep_own_dentist") === "on",
      admin_phones: [...new Set(phones)],
      alerts_enabled: formData.get("alerts_enabled") === "on",
      alert_hour: parsed.data.alert_hour,
    })
    .eq("id", true);
  if (error) return { error: "No se pudo guardar la configuración del bot." };
  revalidatePath("/configuracion");
  revalidatePath("/whatsapp");
  return { ok: "Configuración del bot guardada. El bot la toma en su siguiente mensaje." };
}
