import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { CLINIC_OFFSET, todayStr } from "@/lib/agenda";
import { round2 } from "@/lib/finance";
import { formatDate, fullName, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Comisiones" };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function CommissionsPage({ searchParams }: PageProps<"/comisiones">) {
  const profile = await requireProfile(["admin", "dentist"]);
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : todayStr().slice(0, 7);
  const start = `${month}-01T00:00:00${CLINIC_OFFSET}`;
  const end = `${shiftMonth(month, 1)}-01T00:00:00${CLINIC_OFFSET}`;

  const supabase = await createClient();
  let dentistQuery = supabase.from("profiles").select("id, full_name, commission_pct").eq("role", "dentist").order("full_name");
  if (profile.role === "dentist") dentistQuery = dentistQuery.eq("id", profile.id);
  let itemsQuery = supabase
    .from("treatment_plan_items")
    .select("id, description, tooth, line_total, completed_at, completed_by, treatment:treatments(commission_pct), plan:treatment_plans(patient:patients(id, first_name, last_name, second_last_name))")
    .eq("status", "realizado")
    .gte("completed_at", start)
    .lt("completed_at", end)
    .order("completed_at");
  if (profile.role === "dentist") itemsQuery = itemsQuery.eq("completed_by", profile.id);
  const [{ data: dentists }, { data: items }] = await Promise.all([dentistQuery, itemsQuery]);

  const rows = (dentists ?? []).map((d) => {
    const mine = (items ?? []).filter((i) => i.completed_by === d.id);
    const detail = mine.map((i) => {
      const pct = Number(i.treatment?.commission_pct ?? d.commission_pct);
      return { ...i, pct, commission: round2((Number(i.line_total) * pct) / 100) };
    });
    return {
      ...d,
      detail,
      production: round2(detail.reduce((s, i) => s + Number(i.line_total), 0)),
      commission: round2(detail.reduce((s, i) => s + i.commission, 0)),
    };
  });
  const [y, m] = month.split("-").map(Number);

  return (
    <>
      <PageHeader
        title="Comisiones"
        description="Producción de cada odontólogo (tratamientos marcados como realizados) y su comisión. El porcentaje se define por odontólogo en Configuración o por tratamiento en el arancel."
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

      {!rows.length ? (
        <EmptyState title="No hay odontólogos registrados" />
      ) : (
        <div className="space-y-6">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-brand-900">{r.full_name}</h2>
                  <p className="text-xs text-brand-700/70">Comisión base {Number(r.commission_pct)}%</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-xs text-brand-700/70">Producción</p>
                    <p className="text-lg font-semibold text-brand-900">{money(r.production)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-700/70">Comisión</p>
                    <p className="text-lg font-semibold text-magenta-500">{money(r.commission)}</p>
                  </div>
                </div>
              </div>
              {r.detail.length ? (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-brand-50">
                    {r.detail.map((i) => (
                      <tr key={i.id}>
                        <td className="py-1.5 text-xs text-brand-700">{i.completed_at && formatDate(i.completed_at)}</td>
                        <td className="py-1.5">{i.plan?.patient ? fullName(i.plan.patient) : "—"}</td>
                        <td className="py-1.5">
                          {i.description}
                          {i.tooth && <span className="text-brand-700/70"> · {i.tooth}</span>}
                        </td>
                        <td className="py-1.5 text-right">{money(i.line_total)}</td>
                        <td className="py-1.5 text-right text-xs text-brand-700/70">{i.pct}%</td>
                        <td className="py-1.5 text-right font-medium">{money(i.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-brand-700/70">Sin tratamientos realizados este mes.</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
