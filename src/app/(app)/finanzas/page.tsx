import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { CLINIC_OFFSET, clinicParts, todayStr } from "@/lib/agenda";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/database.types";
import { METHOD_LABEL, isMonth, monthLabel, round2, shiftMonth } from "@/lib/finance";
import { formatDate, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ApplyRecurring, ExpenseForm, RecurringForm, RecurringToggle, VoidExpense } from "./controls";

export const metadata: Metadata = { title: "Finanzas" };

const inMonth = (iso: string | null, month: string) => !!iso && clinicParts(iso).day.startsWith(month);

export default async function FinancePage({ searchParams }: PageProps<"/finanzas">) {
  await requireProfile(["admin"]);
  const sp = await searchParams;
  const month = isMonth(sp.mes) ? sp.mes : todayStr().slice(0, 7);
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  const start = `${first}T00:00:00${CLINIC_OFFSET}`;
  const end = `${next}T00:00:00${CLINIC_OFFSET}`;

  const supabase = await createClient();
  const [payments, commissions, labCosts, lotCosts, expenses, recurring, petty] = await Promise.all([
    supabase.from("payments").select("amount").eq("voided", false).gte("received_at", start).lt("received_at", end),
    supabase.rpc("commission_report", { p_from: start, p_to: end }),
    supabase.from("lab_order_costs").select("cost, order:lab_orders(status, created_at, sent_at, received_at)"),
    supabase.from("inventory_lot_costs").select("unit_cost, lot:inventory_lots(received_qty, remaining, received_at)"),
    supabase.from("expenses").select("*").gte("spent_on", first).lt("spent_on", next).order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("recurring_expenses").select("*").order("active", { ascending: false }).order("category").order("concept"),
    supabase.from("cash_expenses").select("amount").eq("voided", false).gte("spent_at", start).lt("spent_at", end),
  ]);

  const sum = (xs: number[]) => round2(xs.reduce((s, n) => s + n, 0));
  const income = sum((payments.data ?? []).map((p) => Number(p.amount)));
  const production = sum((commissions.data ?? []).map((c) => Number(c.line_total)));
  const commissionTotal = sum((commissions.data ?? []).map((c) => Number(c.commission)));
  // Laboratorio: se cuenta en el mes en que se recibió el trabajo (o se envió / pidió, si aún no llega).
  const lab = sum(
    (labCosts.data ?? [])
      .filter((c) => c.order && c.order.status !== "cancelado" && inMonth(c.order.received_at ?? c.order.sent_at ?? c.order.created_at, month))
      .map((c) => Number(c.cost)),
  );
  const purchases = sum((lotCosts.data ?? []).filter((c) => c.lot && inMonth(c.lot.received_at, month)).map((c) => Number(c.unit_cost) * Number(c.lot!.received_qty)));
  const stockValue = sum((lotCosts.data ?? []).filter((c) => c.lot).map((c) => Number(c.unit_cost) * Number(c.lot!.remaining)));
  const liveExpenses = (expenses.data ?? []).filter((e) => !e.voided);
  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of liveExpenses) byCategory.set(e.category, round2((byCategory.get(e.category) ?? 0) + Number(e.amount)));
  const operating = sum(liveExpenses.map((e) => Number(e.amount)));
  const pettyCash = sum((petty.data ?? []).map((e) => Number(e.amount)));
  const costs = round2(commissionTotal + lab + purchases + operating + pettyCash);
  const profit = round2(income - costs);
  const margin = income > 0 ? Math.round((profit / income) * 100) : null;

  const recurringList = recurring.data ?? [];
  const registered = new Set(liveExpenses.map((e) => e.recurring_id).filter(Boolean));
  const missing = recurringList.filter((r) => r.active && !registered.has(r.id)).length;
  const today = todayStr();
  const defaultDay = today.startsWith(month) ? today : first;

  type Line = { label: string; amount: number; hint?: string; href?: string };
  const allLines: Line[] = [
    { label: "Comisiones de odontólogos", amount: commissionTotal, hint: `Sobre ${money(production)} de producción`, href: `/comisiones?mes=${month}` },
    { label: "Laboratorio", amount: lab, hint: "Costos capturados en las órdenes", href: "/laboratorio?vista=todas" },
    { label: "Compras de inventario", amount: purchases, hint: "Lotes recibidos con costo", href: "/inventario" },
    ...[...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: EXPENSE_CATEGORIES[k], amount: v })),
    { label: "Egresos de caja chica", amount: pettyCash, hint: "Registrados en Caja", href: "/caja" },
  ];
  const lines = allLines.filter((l) => l.amount > 0 || l.href);
  const maxLine = Math.max(income, ...lines.map((l) => l.amount), 1);

  return (
    <>
      <PageHeader
        title="Finanzas"
        description="Estado de resultados del mes: lo que entra, lo que cuesta operar la clínica y lo que queda. Sólo lo ve el administrador."
      />
      <div className="mb-6 flex items-center gap-2">
        <Link href={`?mes=${shiftMonth(month, -1)}`} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Mes anterior">
          ←
        </Link>
        <span className="font-semibold capitalize text-brand-900">{monthLabel(month)}</span>
        <Link href={`?mes=${shiftMonth(month, 1)}`} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Mes siguiente">
          →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-brand-700">Ingresos cobrados</p>
          <p className="mt-1 text-2xl font-bold text-brand-900">{money(income)}</p>
        </Card>
        <Card>
          <p className="text-sm text-brand-700">Costos y gastos</p>
          <p className="mt-1 text-2xl font-bold text-brand-900">{money(costs)}</p>
        </Card>
        <Card>
          <p className="text-sm text-brand-700">Utilidad</p>
          <p className={`mt-1 text-2xl font-bold ${profit < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(profit)}</p>
          {margin !== null && <p className="text-xs text-brand-700/70">Margen {margin}%</p>}
        </Card>
        <Card>
          <p className="text-sm text-brand-700">Inventario en existencia</p>
          <p className="mt-1 text-2xl font-bold text-brand-900">{money(stockValue)}</p>
          <p className="text-xs text-brand-700/70">A costo de compra</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <h2 className="mb-4 font-semibold text-brand-900">Estado de resultados</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-2 font-medium text-brand-900">Ingresos cobrados</td>
                <td className="w-1/3 py-2">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(income / maxLine) * 100}%` }} />
                </td>
                <td className="py-2 text-right font-semibold text-brand-900">{money(income)}</td>
              </tr>
              {lines.map((l) => (
                <tr key={l.label} className="border-t border-brand-50">
                  <td className="py-2 text-brand-800">
                    {l.href ? (
                      <Link href={l.href} className="hover:underline">
                        {l.label}
                      </Link>
                    ) : (
                      l.label
                    )}
                    {l.hint && <span className="block text-xs text-brand-700/60">{l.hint}</span>}
                  </td>
                  <td className="py-2">
                    <div className="h-2 rounded-full bg-brand-400" style={{ width: `${(l.amount / maxLine) * 100}%` }} />
                  </td>
                  <td className="py-2 text-right text-brand-900">− {money(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-brand-200">
                <td className="pt-3 font-semibold text-brand-900">Utilidad del mes</td>
                <td />
                <td className={`pt-3 text-right text-base font-bold ${profit < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(profit)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-4 text-xs text-brand-700/70">
            Los ingresos son los pagos cobrados en el mes. Las comisiones se calculan sobre los tratamientos realizados en el mes. Las compras
            de inventario y los costos de laboratorio se suman solos: no los registres otra vez como gasto.
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-brand-900">Gastos fijos mensuales</h2>
          <p className="mb-3 mt-1 text-sm text-brand-700/80">Renta, servicios, nómina… Se registran cada mes con un clic.</p>
          {recurringList.length > 0 && (
            <ul className="mb-4 divide-y divide-brand-50">
              {recurringList.map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-3 py-2 text-sm ${r.active ? "" : "text-brand-700/50"}`}>
                  <span className="flex-1">
                    <span className="text-brand-900">{r.concept}</span>
                    <span className="block text-xs text-brand-700/70">
                      {EXPENSE_CATEGORIES[r.category]} · día {r.day_of_month}
                      {registered.has(r.id) && " · registrado este mes"}
                    </span>
                  </span>
                  <span className="font-medium">{money(r.amount)}</span>
                  <RecurringToggle id={r.id} active={r.active} />
                </li>
              ))}
            </ul>
          )}
          {recurringList.length > 0 && (
            <div className="mb-5">
              <ApplyRecurring month={month} pending={missing} />
            </div>
          )}
          <RecurringForm />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-4 font-semibold text-brand-900">Gastos del mes</h2>
        <ExpenseForm defaultDay={defaultDay} />
        <div className="mt-6 overflow-x-auto">
          {(expenses.data ?? []).length ? (
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-brand-700/70">
                <tr>
                  <th className="py-2 font-medium">Fecha</th>
                  <th className="py-2 font-medium">Concepto</th>
                  <th className="py-2 font-medium">Categoría</th>
                  <th className="py-2 font-medium">Pagado con</th>
                  <th className="py-2 text-right font-medium">Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {(expenses.data ?? []).map((e) => (
                  <tr key={e.id} className={e.voided ? "text-brand-700/50" : ""}>
                    <td className="py-2">{formatDate(e.spent_on)}</td>
                    <td className="py-2">
                      {e.concept}
                      {e.recurring_id && (
                        <Badge tone="brand" className="ml-2">
                          Fijo
                        </Badge>
                      )}
                      {(e.supplier || e.voided) && (
                        <span className="block text-xs text-brand-700/70">
                          {e.supplier}
                          {e.voided && `${e.supplier ? " · " : ""}Anulado: ${e.void_reason}`}
                        </span>
                      )}
                    </td>
                    <td className="py-2">{EXPENSE_CATEGORIES[e.category]}</td>
                    <td className="py-2">{METHOD_LABEL[e.method]}</td>
                    <td className={`py-2 text-right font-medium ${e.voided ? "line-through" : "text-brand-900"}`}>{money(e.amount)}</td>
                    <td className="py-2 pl-3 text-right">{!e.voided && <VoidExpense id={e.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-brand-700/70">Aún no hay gastos registrados este mes.</p>
          )}
        </div>
      </Card>
    </>
  );
}
