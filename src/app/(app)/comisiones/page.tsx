import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/permissions";
import { CLINIC_OFFSET, todayStr } from "@/lib/agenda";
import { isMonth, monthLabel, round2, shiftMonth } from "@/lib/finance";
import { formatDate, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CommissionRules } from "./rules";

export const metadata: Metadata = { title: "Comisiones" };

export default async function CommissionsPage({ searchParams }: PageProps<"/comisiones">) {
  const profile = await requirePermission("comisiones");
  const isAdmin = profile.role === "admin";
  const seesAll = profile.role !== "dentist";
  const sp = await searchParams;
  const month = isMonth(sp.mes) ? sp.mes : todayStr().slice(0, 7);
  const start = `${month}-01T00:00:00${CLINIC_OFFSET}`;
  const end = `${shiftMonth(month, 1)}-01T00:00:00${CLINIC_OFFSET}`;

  const supabase = await createClient();
  // El reporte lo arma la base: el odontólogo sólo recibe sus tratamientos y su comisión,
  // sin costo de laboratorio ni porcentaje.
  const [{ data: report }, { data: dentists }, { data: rates }, { data: treatments }] = await Promise.all([
    supabase.rpc("commission_report", { p_from: start, p_to: end }),
    supabase.from("profiles").select("id, full_name, active").eq("role", "dentist").order("full_name"),
    isAdmin ? supabase.from("commission_rates").select("*") : Promise.resolve({ data: [] }),
    isAdmin ? supabase.from("treatments").select("id, name, price").eq("active", true).order("name") : Promise.resolve({ data: [] }),
  ]);

  const visible = (dentists ?? []).filter((d) => seesAll || d.id === profile.id);
  const rows = visible
    .map((d) => {
      const detail = (report ?? []).filter((r) => r.dentist_id === d.id);
      return {
        ...d,
        detail,
        production: round2(detail.reduce((s, i) => s + Number(i.line_total), 0)),
        lab: round2(detail.reduce((s, i) => s + Number(i.lab_cost ?? 0), 0)),
        commission: round2(detail.reduce((s, i) => s + Number(i.commission), 0)),
      };
    })
    .filter((r) => r.active || r.detail.length);
  const total = round2(rows.reduce((s, r) => s + r.commission, 0));

  return (
    <>
      <PageHeader
        title={seesAll ? "Comisiones" : "Mis comisiones"}
        description={
          isAdmin
            ? "Producción de cada odontólogo (tratamientos marcados como realizados), costo de laboratorio y comisión. Sólo tú ves los costos y los porcentajes."
            : seesAll
              ? "Producción de cada odontólogo y lo que le corresponde en el mes."
              : "Tus tratamientos realizados en el mes y lo que te corresponde por cada uno."
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link href={`?mes=${shiftMonth(month, -1)}`} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Mes anterior">
          ←
        </Link>
        <span className="font-semibold capitalize text-brand-900">{monthLabel(month)}</span>
        <Link href={`?mes=${shiftMonth(month, 1)}`} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Mes siguiente">
          →
        </Link>
        {isAdmin && <span className="ml-auto text-sm text-brand-700">Total a pagar: <b className="text-brand-900">{money(total)}</b></span>}
      </div>

      {!rows.length ? (
        <EmptyState title="No hay odontólogos registrados" />
      ) : (
        <div className="space-y-6">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <h2 className="font-semibold text-brand-900">{r.full_name}</h2>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-xs text-brand-700/70">Producción</p>
                    <p className="text-lg font-semibold text-brand-900">{money(r.production)}</p>
                  </div>
                  {isAdmin && (
                    <div>
                      <p className="text-xs text-brand-700/70">Laboratorio</p>
                      <p className="text-lg font-semibold text-brand-900">{money(r.lab)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-brand-700/70">{seesAll ? "Comisión" : "Te corresponde"}</p>
                    <p className="text-lg font-semibold text-magenta-500">{money(r.commission)}</p>
                  </div>
                </div>
              </div>
              {r.detail.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-sm">
                    <tbody className="divide-y divide-brand-50">
                      {r.detail.map((i) => (
                        <tr key={i.item_id}>
                          <td className="py-1.5 text-xs text-brand-700">{formatDate(i.completed_at)}</td>
                          <td className="py-1.5">{i.patient_name}</td>
                          <td className="py-1.5">
                            {i.description}
                            {i.tooth && <span className="text-brand-700/70"> · {i.tooth}</span>}
                          </td>
                          <td className="py-1.5 text-right">
                            {money(i.line_total)}
                            {isAdmin && Number(i.lab_cost) > 0 && <span className="block text-[11px] text-brand-700/70">− lab {money(i.lab_cost)}</span>}
                          </td>
                          {isAdmin && <td className="py-1.5 text-right text-xs text-brand-700/70">{Number(i.pct)}%</td>}
                          <td className="py-1.5 text-right font-medium">{money(i.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-brand-700/70">Sin tratamientos realizados este mes.</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {isAdmin && (
        <Card className="mt-6">
          <h2 className="font-semibold text-brand-900">Reglas de comisión</h2>
          <p className="mb-4 mt-1 text-sm text-brand-700/80">
            Se calcula sobre el precio del tratamiento menos su costo de laboratorio. Una regla de odontólogo + tratamiento gana a la del
            tratamiento, y ésta a la general del odontólogo. Los odontólogos no ven estos porcentajes.
          </p>
          <CommissionRules
            dentists={(dentists ?? []).filter((d) => d.active).map((d) => ({ id: d.id, name: d.full_name }))}
            treatments={(treatments ?? []).map((t) => ({ id: t.id, name: t.name }))}
            rates={rates ?? []}
          />
        </Card>
      )}
    </>
  );
}
