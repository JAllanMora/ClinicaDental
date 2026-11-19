import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/permissions";
import { addDays, clinicParts, isValidDay, longDay, minutesToLabel, todayStr } from "@/lib/agenda";
import { METHODS, METHOD_LABEL } from "@/lib/finance";
import { formatDate, formatDateTime, fullName, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { VoidPaymentButton } from "../pacientes/[id]/cuenta/controls";
import { speiBanks } from "@/lib/spei";
import { CloseForm, ExpenseForm, VoidExpenseButton } from "./controls";
import { SpeiValidator } from "./spei";
import { cashDay } from "./data";

export const metadata: Metadata = { title: "Caja" };

export default async function CashPage({ searchParams }: PageProps<"/caja">) {
  await requirePermission("caja");
  const sp = await searchParams;
  const day = isValidDay(sp.fecha) ? sp.fecha : todayStr();
  const supabase = await createClient();
  const { data: branches } = await supabase.from("branches").select("id, name").eq("active", true).order("name");
  const branchId = typeof sp.sucursal === "string" ? sp.sucursal : (branches?.[0]?.id ?? "");
  const d = await cashDay(supabase, branchId, day);
  const { data: history } = await supabase
    .from("cash_closures")
    .select("id, day, counted_cash, expected_cash, difference, totals")
    .eq("branch_id", branchId)
    .order("day", { ascending: false })
    .limit(10);
  const transferIds = d.payments.filter((p) => p.method === "transferencia").map((p) => p.id);
  const [{ data: spei }, { data: validations }, banks] = await Promise.all([
    supabase.from("spei_settings").select("receiver_bank_code, receiver_bank_name, clabe").maybeSingle(),
    supabase
      .from("spei_validations")
      .select("id, payment_id, tracking_key, operation_date, sender_bank_name, amount, valid, found, message, created_at, validator:profiles!spei_validations_validated_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(8),
    speiBanks(),
  ]);
  const { data: paymentChecks } = transferIds.length
    ? await supabase.from("spei_validations").select("payment_id, valid, created_at").in("payment_id", transferIds).order("created_at", { ascending: false })
    : { data: [] };
  // Última validación de cada transferencia del día.
  const speiStatus = new Map<string, boolean>();
  for (const v of paymentChecks ?? []) if (v.payment_id && !speiStatus.has(v.payment_id)) speiStatus.set(v.payment_id, v.valid);
  const toValidate = d.payments
    .filter((p) => p.method === "transferencia" && !p.voided && speiStatus.get(p.id) !== true)
    .map((p) => ({ id: p.id, amount: Number(p.amount), label: `Recibo ${String(p.folio).padStart(5, "0")} · ${p.patient ? fullName(p.patient) : "—"}` }));
  const q = (fecha: string) => `?fecha=${fecha}${sp.sucursal ? `&sucursal=${branchId}` : ""}`;
  const closed = !!d.closure;

  return (
    <>
      <PageHeader title="Caja" description="Cobros del día por forma de pago, egresos y corte de caja." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={q(addDays(day, -1))} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Día anterior">
          ←
        </Link>
        <span className="font-semibold text-brand-900 first-letter:uppercase">{longDay(day)}</span>
        <Link href={q(addDays(day, 1))} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Día siguiente">
          →
        </Link>
        {day !== todayStr() && (
          <Link href={q(todayStr())} className="text-sm text-brand-600 hover:underline">
            Hoy
          </Link>
        )}
        {(branches?.length ?? 0) > 1 && (
          <span className="ml-auto flex gap-1">
            {branches!.map((b) => (
              <Link key={b.id} href={`?fecha=${day}&sucursal=${b.id}`} className={`rounded-lg px-3 py-1 text-sm ${b.id === branchId ? "bg-brand-500 text-white" : "text-brand-700 hover:bg-brand-50"}`}>
                {b.name}
              </Link>
            ))}
          </span>
        )}
        {closed && <Badge tone="green">Corte cerrado</Badge>}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {METHODS.map((m) => (
          <Card key={m.key} className="p-4">
            <p className="text-xs text-brand-700/80">{m.label}</p>
            <p className="mt-1 text-xl font-semibold text-brand-900">{money(d.byMethod[m.key])}</p>
            {d.feeByMethod[m.key] > 0 && <p className="text-[11px] text-brand-700/70">Comisión − {money(d.feeByMethod[m.key])}</p>}
          </Card>
        ))}
        <Card className="bg-gradient-to-br from-brand-500 to-magenta-500 p-4 text-white">
          <p className="text-xs text-white/80">Total cobrado</p>
          <p className="mt-1 text-xl font-semibold">{money(d.income)}</p>
          {d.fees > 0 && <p className="text-[11px] text-white/85">Neto tras comisiones {money(d.income - d.fees)}</p>}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold text-brand-900">Cobros ({d.payments.length})</h2>
            {!d.payments.length ? (
              <p className="text-sm text-brand-700/70">No hay cobros registrados este día.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-brand-50">
                  {d.payments.map((p) => (
                    <tr key={p.id} className={p.voided ? "text-brand-700/50" : ""}>
                      <td className="py-2 font-mono text-xs">{minutesToLabel(clinicParts(p.received_at).minutes)}</td>
                      <td className="py-2">
                        {p.patient ? (
                          <Link href={`/pacientes/${p.patient.id}/cuenta`} className="font-medium text-brand-900 hover:text-magenta-500">
                            {fullName(p.patient)}
                          </Link>
                        ) : (
                          "—"
                        )}
                        <span className="block text-xs text-brand-700/70">
                          Recibo {String(p.folio).padStart(5, "0")} · {p.receiver?.full_name}
                          {p.voided && ` · Cancelado: ${p.void_reason}`}
                        </span>
                      </td>
                      <td className="py-2">
                        {METHOD_LABEL[p.method]}
                        {p.method === "transferencia" && !p.voided && (
                          <span className="ml-1">
                            {speiStatus.get(p.id) === true ? (
                              <Badge tone="green">SPEI validado</Badge>
                            ) : speiStatus.get(p.id) === false ? (
                              <Badge tone="red">SPEI no válido</Badge>
                            ) : (
                              <Badge tone="amber">Sin validar</Badge>
                            )}
                          </span>
                        )}
                      </td>
                      <td className={`py-2 text-right font-medium ${p.voided ? "line-through" : "text-brand-900"}`}>{money(p.amount)}</td>
                      <td className="py-2 pl-3 text-right">{!closed && !p.voided && p.patient && <VoidPaymentButton patientId={p.patient.id} paymentId={p.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {d.cancelled > 0 && <p className="mt-2 text-xs text-brand-700/70">Cancelados: {money(d.cancelled)} (no suman al total)</p>}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-brand-900">Egresos de caja</h2>
            {d.expenses.length > 0 && (
              <ul className="mb-4 divide-y divide-brand-50 text-sm">
                {d.expenses.map((e) => (
                  <li key={e.id} className={`flex items-center justify-between gap-3 py-2 ${e.voided ? "text-brand-700/50 line-through" : ""}`}>
                    <span>
                      {e.concept}
                      <span className="block text-xs text-brand-700/70">
                        {formatDateTime(e.spent_at)} · {METHOD_LABEL[e.method]}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium">{money(e.amount)}</span>
                      {!closed && !e.voided && <VoidExpenseButton id={e.id} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!closed ? <ExpenseForm branchId={branchId} /> : !d.expenses.length && <p className="text-sm text-brand-700/70">Sin egresos.</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="self-start">
            <h2 className="mb-3 font-semibold text-brand-900">Corte de caja</h2>
            {d.closure ? (
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-brand-700">Fondo inicial</dt>
                  <dd>{money(d.closure.opening_cash)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-700">Esperado en efectivo</dt>
                  <dd>{money(d.closure.expected_cash)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-700">Contado</dt>
                  <dd>{money(d.closure.counted_cash)}</dd>
                </div>
                <div className={`flex justify-between font-semibold ${Number(d.closure.difference) === 0 ? "text-emerald-700" : "text-red-700"}`}>
                  <dt>Diferencia</dt>
                  <dd>{money(d.closure.difference)}</dd>
                </div>
                <p className="pt-2 text-xs text-brand-700/70">
                  Cerrado por {d.closure.closer?.full_name} el {formatDateTime(d.closure.closed_at)}
                </p>
                {d.closure.notes && <p className="text-xs">{d.closure.notes}</p>}
              </dl>
            ) : day > todayStr() ? (
              <p className="text-sm text-brand-700/70">No se puede cerrar un día futuro.</p>
            ) : (
              <CloseForm branchId={branchId} day={day} cashIn={d.byMethod.efectivo} cashOut={d.cashExpenses} />
            )}
          </Card>

          <Card>
            <h2 className="font-semibold text-brand-900">Validar transferencia SPEI</h2>
            <p className="mb-3 mt-1 text-xs text-brand-700/80">
              Se consulta el comprobante (CEP) en Banxico contra la cuenta de la clínica
              {spei?.clabe ? ` (${spei.receiver_bank_name ?? "banco"} ···${spei.clabe.slice(-4)})` : ""}.
            </p>
            <SpeiValidator banks={banks} payments={toValidate} today={todayStr()} configured={!!spei?.receiver_bank_code && !!spei?.clabe} />
            {!!validations?.length && (
              <ul className="mt-4 space-y-2 border-t border-brand-100 pt-3 text-xs">
                {validations.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="font-mono">{v.tracking_key}</span>
                      <span className="block text-brand-700/70">
                        {formatDate(v.operation_date)} · {v.sender_bank_name ?? "—"} · {v.validator?.full_name}
                      </span>
                    </span>
                    <span className="text-right">
                      <Badge tone={v.valid ? "green" : "red"}>{v.valid ? "Válida" : v.found ? "No coincide" : "No encontrada"}</Badge>
                      <span className="block">{money(v.amount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-brand-900">Cortes anteriores</h2>
            {!history?.length ? (
              <p className="text-sm text-brand-700/70">Aún no hay cortes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <Link href={q(h.day)} className="flex justify-between hover:text-magenta-500">
                      <span>{formatDate(h.day)}</span>
                      <span className={Number(h.difference) === 0 ? "text-emerald-700" : "text-red-700"}>
                        {Number(h.difference) === 0 ? "Cuadró" : money(h.difference)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
