import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PERMISSION_KEYS, type AppRole, type PermissionKey, type Profile } from "@/lib/database.types";
export { PERMISSIONS } from "@/lib/permission-catalog";

/** Lo que cada rol tenía antes de que los permisos fueran configurables. */
const DEFAULTS: Record<Exclude<AppRole, "admin">, PermissionKey[]> = {
  reception: ["caja", "whatsapp", "inventario", "laboratorio", "tablet"],
  dentist: ["inventario", "laboratorio", "tablet", "comisiones"],
};

/** Permisos efectivos del usuario actual (una consulta por request). */
export const getPermissions = cache(async (): Promise<Set<PermissionKey>> => {
  const profile = await getCurrentProfile();
  if (!profile) return new Set();
  if (profile.role === "admin") return new Set(PERMISSION_KEYS);
  const supabase = await createClient();
  const { data, error } = await supabase.from("role_permissions").select("permission, allowed").eq("role", profile.role);
  // Si la migración aún no corre, se conserva el comportamiento anterior.
  if (error || !data?.length) return new Set(DEFAULTS[profile.role]);
  return new Set(data.filter((r) => r.allowed).map((r) => r.permission));
});

export async function hasPermission(key: PermissionKey) {
  return (await getPermissions()).has(key);
}

/** Exige sesión y el permiso indicado; si no lo tiene, regresa al inicio. */
export async function requirePermission(key: PermissionKey): Promise<Profile> {
  const profile = await requireProfile();
  if (!(await hasPermission(key))) redirect("/?error=permiso");
  return profile;
}

/**
 * ¿Puede ver el expediente clínico? Admin y odontólogos siempre (la base limita al
 * odontólogo a su equipo de atención salvo que tenga el permiso); recepción sólo con permiso.
 */
export async function canViewClinical(profile: Profile) {
  return profile.role !== "reception" || (await hasPermission("expediente"));
}
