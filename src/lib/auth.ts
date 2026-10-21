import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/database.types";

/** Perfil del usuario actual (una sola consulta por request). */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
});

/** Exige sesión activa y, opcionalmente, uno de los roles indicados. */
export async function requireProfile(roles?: AppRole[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/login?error=inactivo");
  if (roles && !roles.includes(profile.role)) redirect("/?error=permiso");
  return profile;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  dentist: "Odontólogo",
  reception: "Recepción",
};

export function canSeeClinical(role: AppRole) {
  return role === "admin" || role === "dentist";
}
