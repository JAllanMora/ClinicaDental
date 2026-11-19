import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Odontólogos activos y sucursales para los selectores del formulario. */
export async function getFormOptions() {
  const supabase = await createClient();
  const [{ data: dentists }, { data: branches }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "dentist").eq("active", true).order("full_name"),
    supabase.from("branches").select("id, name").eq("active", true).order("name"),
  ]);
  return { dentists: dentists ?? [], branches: branches ?? [] };
}
