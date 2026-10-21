import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { METHOD_LABEL, PLAN_STATUS } from "@/lib/finance";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { NewPlanButtons, PaymentForm, VoidPaymentButton } from "./controls";

export const metadata: Metadata = { title: "Presupuestos y pagos" };

export default async function AccountPage({ params }: PageProps<"/pacientes/[id]/cuenta">) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: balance }, { data: plans }, { data: payments }, { data: patient }] = await Promise.all([
    supabase.from("patient_balances").select("*").eq("patient_id", id).maybeSingle(),
    supabase
      .from("treatment_plans")
      .select("*, dentist:profiles!treatment_plans_dentist_id_fkey(full_name), items:treatment_plan_items(line_total, status)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("*, receiver:profiles!payments_received_by_fkey(full_name), plan:treatment_plans(folio)")
      .eq("patient_id", id)
      .order("received_at", { ascending: false }),
    supabase.from("patients").select("branch_id").eq("id", id).single(),
  ]);
  const { data: branches } = await supabase.from("branches").select("id").eq("active", true).limit(1);
  const branchId = patient?.branch_id ?? branches?.[0]?.id ?? "";
  const cashier = profile.role === "admin" || profile.role === "reception";
  const owed = Number(balance?.balance ?? 0);

  const planRows = (plans ?? []).map((p) => {
    const live = p.items.filter((i) => i.status !== "cancelado");
    return {
      ...p,
      total: live.reduce((s, i) => s + Number(i.line_total), 0),
      done: live.filter((i) => i.status === "realizado").reduce((s, i) => s + Number(i.line_total), 0),
    };
  });
  const openPlans = planRows.filter((p) => ["aceptado", "presentado", "borrador"].includes(p.status));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-brand-700/80">{owed >= 0 ? "Saldo pendiente" : "Saldo a favor"}</p>
          <p className={`mt-1 text-2xl font-semibold ${owed > 0 ? "text-red-600" : "text-emerald-600"}`}>{money(Math.abs(owed))}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-brand-700/80">Tratamientos realizados</p>
          <p className="mt-1 text-2xl font-semibold text-brand-900">{money(balance?.charged)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-brand-700/80">Pagado</p>
          <p className="mt-1 text-2xl font-semibold text-brand-900">{money(balance?.paid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-brand-700/80">Por realizar (planes aceptados)</p>
          <p className="mt-1 text-2xl font-semibold text-magenta-500">{money(balance?.pending_treatment)}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-brand-900">Presupuestos</h2>
              <NewPlanButtons patientId={id} canImport={canSeeClinical(profile.role)} />
            </div>
            {!planRows.length ? (
              <EmptyState title="Sin presupuestos">Crea uno en blanco o a partir de lo propuesto en el odontograma.</EmptyState>
            ) : (
              <ul className="divide-y divide-brand-50">
                {planRows.map((p) => (
                  <li key={p.id}>
                    <Link href={`/pacientes/${id}/cuenta/presupuesto/${p.id}`} className="flex flex-wrap items-center gap-3 py-3 text-sm hover:text-magenta-500">
                      <span className="font-mono text-xs text-brand-700">P-{String(p.folio).padStart(4, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-brand-900">{p.title}</span>
                        <span className="block text-xs text-brand-700/70">
                          {formatDate(p.created_at)} · {p.dentist?.full_name ?? "Sin odontólogo"}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold text-brand-900">{money(p.total)}</span>
                        <span className="block text-xs text-brand-700/70">realizado {money(p.done)}</span>
                      </span>
                      <Badge tone={PLAN_STATUS[p.status].tone}>{PLAN_STATUS[p.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-brand-900">Pagos</h2>
            {!payments?.length ? (
              <p className="text-sm text-brand-700/70">Aún no hay pagos.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-brand-700/70">
                  <tr>
                    <th className="py-2 font-medium">Recibo</th>
                    <th className="py-2 font-medium">Fecha</th>
                    <th className="py-2 font-medium">Forma</th>
                    <th className="py-2 text-right font-medium">Monto</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50">
                  {payments.map((p) => (
                    <tr key={p.id} className={p.voided ? "text-brand-700/50" : ""}>
                      <td className="py-2 font-mono text-xs">{String(p.folio).padStart(5, "0")}</td>
                      <td className="py-2">
                        {formatDateTime(p.received_at)}
                        <span className="block text-xs text-brand-700/70">
                          {p.receiver?.full_name}
                          {p.plan && ` · P-${String(p.plan.folio).padStart(4, "0")}`}
                          {p.voided && ` · Cancelado: ${p.void_reason}`}
                        </span>
                      </td>
                      <td className="py-2">
                        {METHOD_LABEL[p.method]}
                        {p.reference && <span className="block text-xs text-brand-700/70">{p.reference}</span>}
                      </td>
                      <td className={`py-2 text-right font-medium ${p.voided ? "line-through" : "text-brand-900"}`}>{money(p.amount)}</td>
                      <td className="py-2 pl-3 text-right">{cashier && !p.voided && <VoidPaymentButton patientId={id} paymentId={p.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {cashier && (
          <Card className="self-start">
            <h2 className="mb-3 font-semibold text-brand-900">Registrar pago</h2>
            <PaymentForm
              patientId={id}
              branchId={branchId}
              suggested={owed}
              plans={openPlans.map((p) => ({ id: p.id, label: `P-${String(p.folio).padStart(4, "0")} · ${p.title}` }))}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
