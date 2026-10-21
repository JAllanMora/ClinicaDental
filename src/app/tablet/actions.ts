"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const answersSchema = z.object({
  chief_complaint: z.string().trim().max(1000),
  conditions: z.record(z.string(), z.boolean()),
  other_conditions: z.string().trim().max(1000),
  allergies: z.array(z.string().trim().min(1).max(80)).max(30),
  medications: z.string().trim().max(1000),
  surgeries: z.string().trim().max(1000),
  pregnant: z.boolean().nullable(),
  breastfeeding: z.boolean().nullable(),
  last_dental_visit: z.string().trim().max(100),
  dental_history: z.string().trim().max(1000),
});

export async function submitQuestionnaire(
  patientId: string,
  input: { answers: z.input<typeof answersSchema>; signer_name: string; signature: string },
) {
  await requireProfile();
  const answers = answersSchema.safeParse(input.answers);
  if (!answers.success) return { error: "Revisa tus respuestas." };
  if (input.signer_name.trim().length < 3) return { error: "Escribe tu nombre completo." };
  if (!input.signature.startsWith("data:image/png;base64,") || input.signature.length > 1_500_000) return { error: "Falta tu firma." };
  const supabase = await createClient();
  const { error } = await supabase.from("patient_questionnaires").insert({
    patient_id: patientId,
    answers: answers.data,
    signer_name: input.signer_name.trim(),
    signature: input.signature,
  });
  if (error) return { error: "No se pudo guardar. Pide ayuda al personal." };
  redirect("/tablet/listo");
}
