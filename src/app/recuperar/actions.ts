"use server";

import { createClient } from "@/lib/supabase/server";

export type RecoverState = { sent?: boolean; error?: string };

export async function requestReset(_prev: RecoverState, formData: FormData): Promise<RecoverState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Escribe tu correo." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/actualizar-contrasena`,
  });
  // Misma respuesta exista o no la cuenta, para no revelar correos registrados.
  return { sent: true };
}
