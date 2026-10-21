"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import type { LabStatus } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string; values?: Record<string, string> };

const FIELDS = ["dentist_id", "lab_id", "plan_item_id", "work_type", "teeth", "shade", "instructions", "due_date", "cost", "notes"] as const;

const orderSchema = z.object({
  dentist_id: z.uuid(),
  lab_id: z.union([z.uuid(), z.literal("")]),
  plan_item_id: z.union([z.uuid(), z.literal("")]),
  work_type: z.string().trim().min(2).max(200),
  teeth: z.string().trim().max(60),
  shade: z.string().trim().max(30),
  instructions: z.string().trim().max(2000),
  due_date: z.union([z.iso.date(), z.literal("")]),
  cost: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000)]),
  notes: z.string().trim().max(1000),
});

function read(formData: FormData) {
  const raw = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
  return { raw, parsed: orderSchema.safeParse(raw) };
}

function clean(d: z.output<typeof orderSchema>) {
  return {
    dentist_id: d.dentist_id,
    lab_id: d.lab_id || null,
    plan_item_id: d.plan_item_id || null,
    work_type: d.work_type,
    teeth: d.teeth || null,
    shade: d.shade || null,
    instructions: d.instructions || null,
    due_date: d.due_date || null,
    cost: d.cost === "" ? null : d.cost,
    notes: d.notes || null,
  };
}

export async function createOrder(patientId: string, _prev: Result, formData: FormData): Promise<Result> {
  const me = await requireProfile();
  if (me.role === "dentist") formData.set("dentist_id", me.id);
  const { raw, parsed } = read(formData);
  if (!parsed.success) return { error: "Indica el odontólogo y el tipo de trabajo.", values: raw };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lab_orders")
    .insert({ ...clean(parsed.data), patient_id: patientId })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear la orden.", values: raw };
  revalidatePath("/laboratorio");
  redirect(`/laboratorio/${data.id}`);
}

export async function updateOrder(id: string, _prev: Result, formData: FormData): Promise<Result> {
  await requireProfile();
  const { raw, parsed } = read(formData);
  if (!parsed.success) return { error: "Revisa los datos de la orden.", values: raw };
  const supabase = await createClient();
  const { error, count } = await supabase.from("lab_orders").update(clean(parsed.data), { count: "exact" }).eq("id", id);
  if (error || !count) return { error: "No se pudo guardar.", values: raw };
  revalidatePath("/laboratorio", "layout");
  return { ok: "Guardado." };
}

export async function setOrderStatus(id: string, status: LabStatus): Promise<Result> {
  await requireProfile();
  const supabase = await createClient();
  const { error, count } = await supabase.from("lab_orders").update({ status }, { count: "exact" }).eq("id", id);
  if (error || !count) return { error: "No se pudo cambiar el estado." };
  revalidatePath("/laboratorio", "layout");
  return {};
}

export async function saveLab(id: string | null, _prev: Result, formData: FormData): Promise<Result> {
  await requireProfile(["admin"]);
  const parsed = z
    .object({ name: z.string().trim().min(2).max(120), contact: z.string().trim().max(120), phone: z.string().trim().max(40), email: z.string().trim().max(120) })
    .safeParse(Object.fromEntries(["name", "contact", "phone", "email"].map((k) => [k, formData.get(k) ?? ""])));
  if (!parsed.success) return { error: "Escribe el nombre del laboratorio." };
  const data = { name: parsed.data.name, contact: parsed.data.contact || null, phone: parsed.data.phone || null, email: parsed.data.email || null };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("labs").update(data).eq("id", id) : await supabase.from("labs").insert(data);
  if (error) return { error: error.code === "23505" ? "Ya existe ese laboratorio." : "No se pudo guardar." };
  revalidatePath("/laboratorio", "layout");
  return { ok: id ? "Guardado." : "Laboratorio agregado." };
}
