import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { todayStr } from "@/lib/agenda";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ItemForm, StockButtons } from "./controls";
import { stockRows } from "./data";

export const metadata: Metadata = { title: "Inventario" };

export default async function InventoryPage({ searchParams }: PageProps<"/inventario">) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const onlyAlerts = sp.vista === "alertas";
  const supabase = await createClient();
  const { data: branches } = await supabase.from("branches").select("id, name").eq("active", true).order("name");
  const branchId = typeof sp.sucursal === "string" ? sp.sucursal : (branches?.[0]?.id ?? "");
  const rows = await stockRows(supabase, branchId);
  const alerts = rows.filter((r) => r.low || r.expiring);
  const shown = onlyAlerts ? alerts : rows;
  const categories = [...new Set(rows.map((r) => r.category))];
  const today = todayStr();
  const manager = profile.role !== "dentist";

  return (
    <>
      <PageHeader title="Inventario" description="Existencias por lote, caducidades y alertas de stock mínimo. Las salidas descuentan primero lo que caduca antes." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="?" className={`rounded-lg px-3 py-1.5 text-sm ${!onlyAlerts ? "bg-brand-500 text-white" : "text-brand-700 hover:bg-brand-50"}`}>
          Todo ({rows.length})
        </Link>
        <Link href="?vista=alertas" className={`rounded-lg px-3 py-1.5 text-sm ${onlyAlerts ? "bg-brand-500 text-white" : "text-brand-700 hover:bg-brand-50"}`}>
          Alertas ({alerts.length})
        </Link>
      </div>

      <div className={manager ? "grid gap-6 lg:grid-cols-[1fr_20rem]" : ""}>
        <Card className="p-0">
          {!shown.length ? (
            <div className="p-6">
              <EmptyState title={onlyAlerts ? "Sin alertas" : "Aún no hay artículos"}>{onlyAlerts ? "Todo en orden." : "Da de alta el primer artículo."}</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-brand-50">
              {shown.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/inventario/${r.id}`} className="font-medium text-brand-900 hover:text-magenta-500">
                      {r.name}
                    </Link>
                    <p className="text-xs text-brand-700/70">
                      {r.category}
                      {r.supplier && ` · ${r.supplier}`}
                      {r.next_expiry && ` · caduca ${formatDate(r.next_expiry)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.low && <Badge tone="red">Bajo mínimo ({Number(r.min_stock)})</Badge>}
                    {r.next_expiry && r.next_expiry < today ? (
                      <Badge tone="red">Caducado</Badge>
                    ) : (
                      r.expiring && <Badge tone="amber">Por caducar</Badge>
                    )}
                  </div>
                  <span className="w-24 text-right">
                    <span className={`text-lg font-semibold ${r.low ? "text-red-600" : "text-brand-900"}`}>{r.stock}</span>
                    <span className="text-xs text-brand-700/70"> {r.unit}</span>
                  </span>
                  <StockButtons itemId={r.id} unit={r.unit} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        {manager && (
          <Card className="self-start">
            <h2 className="mb-3 font-semibold text-brand-900">Nuevo artículo</h2>
            <ItemForm branchId={branchId} categories={categories} />
          </Card>
        )}
      </div>
    </>
  );
}
