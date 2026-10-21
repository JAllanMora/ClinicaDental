import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { todayStr } from "@/lib/agenda";
import { formatDate, fullName, money } from "@/lib/format";
import { LAB_OPEN, LAB_PENDING, LAB_STATUS } from "@/lib/lab";
import { createClient } from "@/lib/supabase/server";
import { LabForm } from "./forms";

export const metadata: Metadata = { title: "Laboratorio" };

export default async function LabPage({ searchParams }: PageProps<"/laboratorio">) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const all = sp.vista === "todas";
  const supabase = await createClient();
  let q = supabase
    .from("lab_orders")
    .select("*, patient:patients(id, first_name, last_name, second_last_name), dentist:profiles!lab_orders_dentist_id_fkey(full_name), lab:labs(name)")
    .order("due_date", { nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (!all) q = q.in("status", LAB_OPEN);
  const [{ data: orders }, { data: labs }] = await Promise.all([q, supabase.from("labs").select("*").order("name")]);
  const today = todayStr();

  return (
    <>
      <PageHeader
        title="Laboratorio"
        description="Trabajos enviados a laboratorio: estado, fecha comprometida y costo."
        actions={<ButtonLink href="/laboratorio/nueva">+ Nueva orden</ButtonLink>}
      />
      <div className="mb-4 flex gap-2">
        <Link href="?" className={`rounded-lg px-3 py-1.5 text-sm ${!all ? "bg-brand-500 text-white" : "text-brand-700 hover:bg-brand-50"}`}>
          Activas
        </Link>
        <Link href="?vista=todas" className={`rounded-lg px-3 py-1.5 text-sm ${all ? "bg-brand-500 text-white" : "text-brand-700 hover:bg-brand-50"}`}>
          Todas
        </Link>
      </div>
      <div className={profile.role === "admin" ? "grid gap-6 lg:grid-cols-[1fr_18rem]" : ""}>
        <Card className="p-0">
          {!orders?.length ? (
            <div className="p-6">
              <EmptyState title="No hay trabajos de laboratorio" />
            </div>
          ) : (
            <ul className="divide-y divide-brand-50">
              {orders.map((o) => {
                const late = !!o.due_date && o.due_date < today && LAB_PENDING.includes(o.status);
                return (
                  <li key={o.id}>
                    <Link href={`/laboratorio/${o.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-brand-50/50">
                      <span className="font-mono text-xs text-brand-700">L-{String(o.folio).padStart(4, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-brand-900">{o.work_type}</span>
                        {o.teeth && <span className="text-brand-700/70"> · {o.teeth}</span>}
                        <span className="block text-xs text-brand-700/70">
                          {o.patient ? fullName(o.patient) : "—"} · {o.dentist?.full_name} · {o.lab?.name ?? "Sin laboratorio"}
                        </span>
                      </span>
                      <span className="text-right text-xs">
                        {o.due_date && <span className={late ? "font-semibold text-red-600" : "text-brand-700"}>{late ? "Atrasado · " : "Para "}{formatDate(o.due_date)}</span>}
                        {o.cost !== null && <span className="block text-brand-700/70">{money(o.cost)}</span>}
                      </span>
                      <Badge tone={LAB_STATUS[o.status].tone}>{LAB_STATUS[o.status].label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        {profile.role === "admin" && (
          <Card className="self-start">
            <h2 className="mb-3 font-semibold text-brand-900">Laboratorios</h2>
            <ul className="mb-4 space-y-1.5 text-sm">
              {labs?.map((l) => (
                <li key={l.id}>
                  <span className="font-medium text-brand-900">{l.name}</span>
                  <span className="block text-xs text-brand-700/70">{[l.contact, l.phone, l.email].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
            <LabForm />
          </Card>
        )}
      </div>
    </>
  );
}
