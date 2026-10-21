"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: string };

const roleSchema = z.enum(["admin", "dentist", "reception"]);

export async function inviteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const parsed = z
    .object({ email: z.email(), full_name: z.string().trim().min(2), role: roleSchema })
    .safeParse({
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      full_name: formData.get("full_name"),
      role: formData.get("role"),
    });
  if (!parsed.success) return { error: "Revisa el nombre, el correo y el rol." };
  const { email, full_name, role } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/actualizar-contrasena`,
  });
  if (error || !data.user) {
    return { error: error?.message.includes("already") ? "Ese correo ya tiene cuenta." : "No se pudo enviar la invitación." };
  }

  // El trigger handle_new_user crea el perfil inactivo; aquí fijamos el rol y lo activamos.
  await admin.from("profiles").update({ role, full_name, active: true }).eq("id", data.user.id);

  revalidatePath("/configuracion");
  return { ok: `Invitación enviada a ${email}.` };
}

export async function updateStaff(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireProfile(["admin"]);
  const parsed = z
    .object({
      full_name: z.string().trim().min(2),
      role: roleSchema,
      specialty: z.string().trim(),
      professional_id: z.string().trim(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      active: z.boolean(),
    })
    .safeParse({
      full_name: formData.get("full_name"),
      role: formData.get("role"),
      specialty: formData.get("specialty") ?? "",
      professional_id: formData.get("professional_id") ?? "",
      color: formData.get("color"),
      active: formData.get("active") === "on",
    });
  if (!parsed.success) return { error: "Datos inválidos." };
  if (id === me.id && (parsed.data.role !== "admin" || !parsed.data.active)) {
    return { error: "No puedes quitarte el rol de administrador ni desactivarte." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      ...parsed.data,
      specialty: parsed.data.specialty || null,
      professional_id: parsed.data.professional_id || null,
    })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar." };

  revalidatePath("/configuracion");
  return { ok: "Guardado." };
}

export async function addBranch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Escribe el nombre de la sucursal." };
  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
    name,
    address: String(formData.get("address") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
  });
  if (error) return { error: "No se pudo crear la sucursal." };
  revalidatePath("/configuracion");
  return { ok: "Sucursal creada." };
}

export async function addChair(branchId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Escribe el nombre del sillón." };
  const supabase = await createClient();
  const { error } = await supabase.from("chairs").insert({ branch_id: branchId, name });
  if (error) return { error: error.code === "23505" ? "Ya existe un sillón con ese nombre." : "No se pudo crear el sillón." };
  revalidatePath("/configuracion");
  return { ok: "Sillón agregado." };
}

export async function toggleChair(id: string, active: boolean) {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  await supabase.from("chairs").update({ active }).eq("id", id);
  revalidatePath("/configuracion");
}
