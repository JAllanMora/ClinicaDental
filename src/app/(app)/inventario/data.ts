import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayStr } from "@/lib/agenda";
import type { Database } from "@/lib/database.types";
import { EXPIRY_WARNING_DAYS } from "@/lib/lab";

export type StockRow = Database["public"]["Tables"]["inventory_items"]["Row"] & {
  stock: number;
  next_expiry: string | null;
  expired_qty: number;
  low: boolean;
  expiring: boolean;
};

/** Artículos activos con existencias y banderas de alerta. */
export async function stockRows(db: SupabaseClient<Database>, branchId?: string): Promise<StockRow[]> {
  let q = db.from("inventory_items").select("*").eq("active", true).order("category").order("name");
  if (branchId) q = q.eq("branch_id", branchId);
  const [{ data: items }, { data: stock }] = await Promise.all([q, db.from("inventory_stock").select("*")]);
  const byId = new Map((stock ?? []).map((s) => [s.item_id, s]));
  const limit = addDays(todayStr(), EXPIRY_WARNING_DAYS);
  return (items ?? []).map((i) => {
    const s = byId.get(i.id);
    const qty = Number(s?.stock ?? 0);
    return {
      ...i,
      stock: qty,
      next_expiry: s?.next_expiry ?? null,
      expired_qty: Number(s?.expired_qty ?? 0),
      low: qty <= Number(i.min_stock),
      expiring: !!s?.next_expiry && s.next_expiry <= limit,
    };
  });
}
