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
      commission_pct: z.coerce.number().min(0).max(100),
    })
    .safeParse({
      full_name: formData.get("full_name"),
      role: formData.get("role"),
      specialty: formData.get("specialty") ?? "",
      professional_id: formData.get("professional_id") ?? "",
      color: formData.get("color"),
      active: formData.get("active") === "on",
      commission_pct: formData.get("commission_pct") || 0,
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

const typeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean(),
});

export async function saveAppointmentType(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const parsed = typeSchema.safeParse({
    name: formData.get("name"),
    duration_minutes: formData.get("duration_minutes"),
    color: formData.get("color"),
    active: id ? formData.get("active") === "on" : true,
  });
  if (!parsed.success) return { error: "Revisa el nombre y la duración (5 a 480 minutos)." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("appointment_types").update(parsed.data).eq("id", id)
    : await supabase.from("appointment_types").insert(parsed.data);
  if (error) return { error: error.code === "23505" ? "Ya existe un tipo de cita con ese nombre." : "No se pudo guardar." };
  revalidatePath("/configuracion");
  return { ok: id ? "Guardado." : "Tipo de cita agregado." };
}

const treatmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  price: z.coerce.number().min(0).max(1_000_000),
  commission_pct: z.union([z.literal("").transform(() => null), z.coerce.number().min(0).max(100)]),
  active: z.boolean(),
});

export async function saveTreatment(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const parsed = treatmentSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    price: formData.get("price"),
    commission_pct: String(formData.get("commission_pct") ?? ""),
    active: id ? formData.get("active") === "on" : true,
  });
  if (!parsed.success) return { error: "Revisa nombre, categoría y precio." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("treatments").update(parsed.data).eq("id", id)
    : await supabase.from("treatments").insert(parsed.data);
  if (error) return { error: error.code === "23505" ? "Ya existe un tratamiento con ese nombre." : "No se pudo guardar." };
  revalidatePath("/configuracion");
  return { ok: id ? "Guardado." : "Tratamiento agregado." };
}
