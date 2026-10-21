"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const png = z.string().startsWith("data:image/png;base64,").max(1_500_000);

const consentSchema = z.object({
  template_id: z.uuid().nullable(),
  title: z.string().trim().min(3),
  body: z.string().trim().min(20),
  signer_name: z.string().trim().min(3),
  signer_relation: z.string().trim().nullable(),
  signature: png,
  dentist_signature: png.nullable(),
});

export async function signConsent(patientId: string, input: z.input<typeof consentSchema>, from?: "tablet") {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) return { error: "Sin permiso." };
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return { error: "Falta la firma del paciente o algún dato." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consents")
    .insert({
      ...parsed.data,
      signer_relation: parsed.data.signer_relation || null,
      patient_id: patientId,
      dentist_id: profile.id,
      user_agent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo guardar el consentimiento." };

  revalidatePath(`/pacientes/${patientId}/consentimientos`);
  redirect(from === "tablet" ? "/tablet/listo" : `/pacientes/${patientId}/consentimientos/${data.id}`);
}

export async function revokeConsent(patientId: string, id: string, reason: string) {
  const profile = await requireProfile();
  if (!canSeeClinical(profile.role)) return;
  const supabase = await createClient();
  await supabase
    .from("consents")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason.trim() || "Sin motivo" })
    .eq("id", id);
  revalidatePath(`/pacientes/${patientId}/consentimientos/${id}`);
}
