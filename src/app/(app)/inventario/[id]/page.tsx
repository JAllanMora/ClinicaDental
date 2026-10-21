import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { todayStr } from "@/lib/agenda";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { MOVE_LABEL } from "@/lib/lab";
import { createClient } from "@/lib/supabase/server";
import { ItemForm, StockButtons } from "../controls";

export const metadata: Metadata = { title: "Artículo de inventario" };

export default async function ItemPage({ params }: PageProps<"/inventario/[id]">) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: item }, { data: lots }, { data: moves }] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("id", id).maybeSingle(),
    supabase.from("inventory_lots").select("*").eq("item_id", id).order("expires_on", { nullsFirst: false }).order("received_at"),
    supabase
      .from("inventory_movements")
      .select("*, lot:inventory_lots(lot_code), author:profiles!inventory_movements_created_by_fkey(full_name)")
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (!item) notFound();
  const stock = (lots ?? []).reduce((s, l) => s + Number(l.remaining), 0);
  const today = todayStr();

  return (
    <>
      <PageHeader
        title={item.name}
        description={`${item.category} · existencia ${stock} ${item.unit} · mínimo ${Number(item.min_stock)}`}
        actions={
          <Link href="/inventario" className="text-sm text-brand-600 hover:underline">
            ← Inventario
          </Link>
        }
      />
      <div className="mb-6 flex justify-end">
        <StockButtons itemId={item.id} unit={item.unit} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold text-brand-900">Lotes con existencia</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-brand-700/70">
                <tr>
                  <th className="py-2 font-medium">Lote</th>
                  <th className="py-2 font-medium">Caducidad</th>
                  <th className="py-2 font-medium">Recibido</th>
                  <th className="py-2 text-right font-medium">Costo</th>
                  <th className="py-2 text-right font-medium">Queda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {(lots ?? [])
                  .filter((l) => Number(l.remaining) > 0)
                  .map((l) => (
                    <tr key={l.id}>
                      <td className="py-2">{l.lot_code ?? "—"}</td>
                      <td className="py-2">
                        {l.expires_on ? formatDate(l.expires_on) : "—"} {l.expires_on && l.expires_on < today && <Badge tone="red">Caducado</Badge>}
                      </td>
                      <td className="py-2 text-brand-700/80">{formatDate(l.received_at)}</td>
                      <td className="py-2 text-right">{l.unit_cost !== null ? money(l.unit_cost) : "—"}</td>
                      <td className="py-2 text-right font-medium">
                        {Number(l.remaining)} / {Number(l.received_qty)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold text-brand-900">Movimientos</h2>
            <ul className="divide-y divide-brand-50 text-sm">
              {(moves ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium text-brand-900">{MOVE_LABEL[m.kind]}</span>
                    {m.lot?.lot_code && <span className="text-brand-700/70"> · lote {m.lot.lot_code}</span>}
                    {m.reason && <span className="text-brand-700/70"> · {m.reason}</span>}
                    <span className="block text-xs text-brand-700/60">
                      {formatDateTime(m.created_at)} · {m.author?.full_name}
                    </span>
                  </span>
                  <span className={`font-semibold ${m.kind === "entrada" ? "text-emerald-700" : "text-brand-900"}`}>
                    {m.kind === "entrada" ? "+" : "−"}
                    {Number(m.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        {profile.role !== "dentist" && (
          <Card className="self-start">
            <h2 className="mb-3 font-semibold text-brand-900">Datos del artículo</h2>
            <ItemForm item={item} branchId={item.branch_id} categories={[item.category]} />
          </Card>
        )}
      </div>
    </>
  );
}
