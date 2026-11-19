"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { PERMISSION_KEYS, type PaymentMethod } from "@/lib/database.types";
import { METHODS } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { speiBanks } from "@/lib/spei";
import type { ActionState } from "./actions";

/** Guarda la matriz de permisos de recepción y odontólogos. */
export async function savePermissions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const rows = (["reception", "dentist"] as const).flatMap((role) =>
    PERMISSION_KEYS.map((permission) => ({ role, permission, allowed: formData.get(`${role}:${permission}`) === "on" })),
  );
  const supabase = await createClient();
  const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role,permission" });
  if (error) return { error: "No se pudieron guardar los permisos." };
  revalidatePath("/", "layout");
  return { ok: "Permisos guardados. Se aplican la próxima vez que cada usuario abra una pantalla." };
}

/** Comisión bancaria por forma de pago. Sólo afecta a los cobros nuevos. */
export async function saveFees(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const schema = z.object({ pct: z.coerce.number().min(0).max(30), fixed_fee: z.coerce.number().min(0).max(10_000) });
  const rows: { method: PaymentMethod; pct: number; fixed_fee: number; add_iva: boolean }[] = [];
  for (const m of METHODS) {
    const parsed = schema.safeParse({ pct: formData.get(`${m.key}:pct`) || 0, fixed_fee: formData.get(`${m.key}:fixed`) || 0 });
    if (!parsed.success) return { error: `Revisa la comisión de ${m.label} (porcentaje entre 0 y 30).` };
    rows.push({ method: m.key, ...parsed.data, add_iva: formData.get(`${m.key}:iva`) === "on" });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("payment_method_fees").upsert(rows, { onConflict: "method" });
  if (error) return { error: "No se pudieron guardar las comisiones." };
  revalidatePath("/configuracion");
  revalidatePath("/caja");
  return { ok: "Comisiones guardadas. Se aplican a los cobros que se registren desde ahora." };
}

/** Datos fijos de la cuenta que recibe las transferencias. */
export async function saveSpeiSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile(["admin"]);
  const parsed = z
    .object({
      receiver_bank_code: z.string().trim().regex(/^\d{3,6}$/),
      clabe: z.string().trim().transform((s) => s.replace(/[\s-]/g, "")).pipe(z.string().regex(/^\d{18}$/)),
      holder: z.string().trim().max(120),
    })
    .safeParse({ receiver_bank_code: formData.get("receiver_bank_code"), clabe: formData.get("clabe"), holder: formData.get("holder") ?? "" });
  if (!parsed.success) return { error: "Elige el banco y escribe la CLABE de 18 dígitos." };
  if (!clabeOk(parsed.data.clabe)) return { error: "La CLABE no es válida (el dígito verificador no coincide)." };

  const banks = await speiBanks();
  const supabase = await createClient();
  const { error } = await supabase
    .from("spei_settings")
    .update({
      receiver_bank_code: parsed.data.receiver_bank_code,
      receiver_bank_name: banks.find((b) => b.clave === parsed.data.receiver_bank_code)?.nombre ?? null,
      clabe: parsed.data.clabe,
      holder: parsed.data.holder || null,
    })
    .eq("id", 1);
  if (error) return { error: "No se pudo guardar la cuenta." };
  revalidatePath("/configuracion");
  revalidatePath("/caja");
  return { ok: "Cuenta receptora guardada." };
}

/** Dígito verificador de la CLABE (ponderación 3-7-1, módulo 10). */
function clabeOk(clabe: string) {
  const w = [3, 7, 1];
  const sum = [...clabe.slice(0, 17)].reduce((s, d, i) => s + ((Number(d) * w[i % 3]) % 10), 0);
  return (10 - (sum % 10)) % 10 === Number(clabe[17]);
}
