import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { todayStr } from "@/lib/agenda";
import { METHODS } from "@/lib/finance";
import { fullName, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { monthReport, shiftMonth } from "./data";
import { IncomeChart } from "./income-chart";

export const metadata: Metadata = { title: "Reportes" };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pct = (n: number) => `${Math.round(n * 100)}%`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-brand-700/80">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-brand-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-brand-700/60">{hint}</p>}
    </Card>
  );
}

function BarList({ rows }: { rows: { label: string; value: number; extra?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-3">
            <span className="truncate text-brand-900">{r.label}</span>
            <span className="shrink-0 font-medium text-brand-950">
              {money(r.value)}
              {r.extra && <span className="ml-1 text-xs font-normal text-brand-700/70">{r.extra}</span>}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-brand-50">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reportes">) {
  await requireProfile(["admin"]);
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : todayStr().slice(0, 7);
  const supabase = await createClient();
  const r = await monthReport(supabase, month);
  const ids = [...r.byDentist.map((d) => d.id)];
  const patientIds = r.receivables.top.map((b) => b.patient_id);
  const [{ data: dentists }, { data: debtors }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, full_name").in("id", ids) : Promise.resolve({ data: [] }),
    patientIds.length
      ? supabase.from("patients").select("id, first_name, last_name, second_last_name, phone").in("id", patientIds)
      : Promise.resolve({ data: [] }),
  ]);
  const dentistName = new Map((dentists ?? []).map((d) => [d.id, d.full_name]));
  const debtor = new Map((debtors ?? []).map((p) => [p.id, p]));
  const [y, m] = month.split("-").map(Number);
  const a = r.appointments;

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Indicadores del mes: ingresos, producción, agenda y cuentas por cobrar."
        actions={
          <a href={`/reportes/pagos.csv?mes=${month}`} className="rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50">
            Descargar pagos (CSV)
          </a>
        }
      />
      <div className="mb-6 flex items-center gap-2">
        <Link href={`?mes=${shiftMonth(month, -1)}`} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Mes anterior">
          ←
        </Link>
        <span className="font-semibold capitalize text-brand-900">
          {MONTHS[m - 1]} {y}
        </span>
        <Link href={`?mes=${shiftMonth(month, 1)}`} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Mes siguiente">
          →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ingresos cobrados" value={money(r.income)} hint={`Egresos de caja ${money(r.expenses)}`} />
        <Stat label="Producción (tratamientos realizados)" value={money(r.production)} />
        <Stat label="Pacientes nuevos" value={String(r.newPatients)} />
        <Stat label="Por cobrar (todos los pacientes)" value={money(r.receivables.total)} />
        <Stat label="Citas agendadas" value={String(a.scheduled)} hint={`${a.completed} atendidas`} />
        <Stat label="Inasistencias" value={a.scheduled ? pct(a.noShow / a.scheduled) : "—"} hint={`${a.noShow} citas · ${a.cancelled} canceladas`} />
        <Stat label="Ocupación de sillones" value={pct(r.occupancy)} hint="Lun–sáb, 8:00 a 20:00" />
        <Stat
          label="Aceptación de presupuestos"
          value={r.plans.presented ? pct(r.plans.accepted / r.plans.presented) : "—"}
          hint={`${r.plans.accepted} de ${r.plans.presented} presentados`}
        />
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-brand-900">Ingresos cobrados por día</h2>
        <IncomeChart days={r.days} />
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-brand-600">Ver como tabla</summary>
          <table className="mt-2 w-full max-w-sm">
            <tbody className="divide-y divide-brand-50">
              {r.days
                .filter((d) => d.amount > 0)
                .map((d) => (
                  <tr key={d.day}>
                    <td className="py-1">{d.day}</td>
                    <td className="py-1 text-right">{money(d.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold text-brand-900">Por forma de pago</h2>
          <BarList rows={METHODS.map((mm) => ({ label: mm.label, value: r.byMethod[mm.key] })).filter((x) => x.value > 0)} />
          {!r.income && <p className="text-sm text-brand-700/70">Sin cobros.</p>}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-brand-900">Producción por odontólogo</h2>
          <BarList rows={r.byDentist.map((d) => ({ label: dentistName.get(d.id) ?? "—", value: d.total }))} />
          {!r.byDentist.length && <p className="text-sm text-brand-700/70">Sin tratamientos realizados.</p>}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-brand-900">Tratamientos que más producen</h2>
          <BarList rows={r.topTreatments.map((t) => ({ label: t.name, value: t.total, extra: `×${t.count}` }))} />
          {!r.topTreatments.length && <p className="text-sm text-brand-700/70">Sin tratamientos realizados.</p>}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold text-brand-900">Saldos pendientes más altos</h2>
        {!r.receivables.top.length ? (
          <p className="text-sm text-brand-700/70">Ningún paciente tiene saldo pendiente.</p>
        ) : (
          <ul className="divide-y divide-brand-50 text-sm">
            {r.receivables.top.map((b) => {
              const p = debtor.get(b.patient_id);
              return (
                <li key={b.patient_id}>
                  <Link href={`/pacientes/${b.patient_id}/cuenta`} className="flex justify-between py-2 hover:text-magenta-500">
                    <span>
                      {p ? fullName(p) : "—"}
                      {p?.phone && <span className="text-brand-700/70"> · {p.phone}</span>}
                    </span>
                    <span className="font-medium text-red-600">{money(b.balance)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
