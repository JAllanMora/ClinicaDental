"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };

const itemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  unit: z.string().trim().min(1).max(30),
  sku: z.string().trim().max(60),
  supplier: z.string().trim().max(120),
  min_stock: z.coerce.number().min(0).max(1_000_000),
});

export async function saveItem(id: string | null, branchId: string, _prev: Result, formData: FormData): Promise<Result> {
  await requireProfile(["admin", "reception"]);
  const parsed = itemSchema.safeParse(Object.fromEntries(["name", "category", "unit", "sku", "supplier", "min_stock"].map((k) => [k, formData.get(k) ?? ""])));
  if (!parsed.success) return { error: "Revisa nombre, categoría, unidad y mínimo." };
  const data = { ...parsed.data, sku: parsed.data.sku || null, supplier: parsed.data.supplier || null };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("inventory_items").update(data).eq("id", id)
    : await supabase.from("inventory_items").insert({ ...data, branch_id: branchId });
  if (error) return { error: error.code === "23505" ? "Ya existe un artículo con ese nombre." : "No se pudo guardar." };
  revalidatePath("/inventario", "layout");
  return { ok: id ? "Guardado." : "Artículo agregado." };
}

function dbError(message: string, fallback: string) {
  return /existencias|cantidad|permiso|encontrado/i.test(message) ? message : fallback;
}

export async function stockIn(itemId: string, input: { qty: number; lot: string; expires: string; cost: string }): Promise<Result> {
  await requireProfile();
  const parsed = z
    .object({ qty: z.number().positive().max(1_000_000), lot: z.string().trim().max(60), expires: z.union([z.iso.date(), z.literal("")]), cost: z.string() })
    .safeParse(input);
  if (!parsed.success) return { error: "Escribe una cantidad válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("inventory_in", {
    p_item: itemId,
    p_qty: parsed.data.qty,
    p_lot: parsed.data.lot || null,
    p_expires: parsed.data.expires || null,
    p_cost: parsed.data.cost === "" ? null : Number(parsed.data.cost),
  });
  if (error) return { error: dbError(error.message, "No se pudo registrar la entrada.") };
  revalidatePath("/inventario", "layout");
  return { ok: "Entrada registrada." };
}

export async function stockOut(itemId: string, input: { qty: number; kind: "salida" | "merma" | "ajuste"; reason: string }): Promise<Result> {
  await requireProfile();
  const parsed = z
    .object({ qty: z.number().positive().max(1_000_000), kind: z.enum(["salida", "merma", "ajuste"]), reason: z.string().trim().max(200) })
    .safeParse(input);
  if (!parsed.success) return { error: "Escribe una cantidad válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("inventory_out", {
    p_item: itemId,
    p_qty: parsed.data.qty,
    p_kind: parsed.data.kind,
    p_reason: parsed.data.reason || null,
  });
  if (error) return { error: dbError(error.message, "No se pudo registrar la salida.") };
  revalidatePath("/inventario", "layout");
  return { ok: "Salida registrada." };
}
