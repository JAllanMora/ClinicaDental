import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, fullName, money } from "@/lib/format";
import { LAB_STATUS } from "@/lib/lab";
import { createClient } from "@/lib/supabase/server";
import { OrderForm, StatusButtons } from "../forms";

export const metadata: Metadata = { title: "Orden de laboratorio" };

export default async function LabOrderPage({ params }: PageProps<"/laboratorio/[id]">) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("lab_orders")
    .select("*, patient:patients(id, first_name, last_name, second_last_name)")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();
  const [{ data: events }, { data: dentists }, { data: labs }, { data: items }] = await Promise.all([
    supabase.from("lab_order_events").select("*, author:profiles!lab_order_events_created_by_fkey(full_name)").eq("order_id", id).order("created_at"),
    supabase.from("profiles").select("id, full_name").eq("role", "dentist").order("full_name"),
    supabase.from("labs").select("id, name").order("name"),
    supabase
      .from("treatment_plan_items")
      .select("id, description, tooth, line_total, plan:treatment_plans!inner(patient_id, folio)")
      .eq("plan.patient_id", order.patient_id)
      .neq("status", "cancelado"),
  ]);
  const canEdit = profile.role !== "dentist" || order.dentist_id === profile.id;

  return (
    <>
      <PageHeader
        title={`L-${String(order.folio).padStart(4, "0")} · ${order.work_type}`}
        description={order.patient ? fullName(order.patient) : undefined}
        actions={
          <Link href="/laboratorio" className="text-sm text-brand-600 hover:underline">
            ← Laboratorio
          </Link>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={LAB_STATUS[order.status].tone}>{LAB_STATUS[order.status].label}</Badge>
        {order.cost !== null && <span className="text-sm text-brand-700">Costo {money(order.cost)}</span>}
        {canEdit && <StatusButtons id={order.id} status={order.status} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          {canEdit ? (
            <OrderForm
              order={order}
              dentists={(dentists ?? []).map((d) => ({ id: d.id, label: d.full_name }))}
              labs={(labs ?? []).map((l) => ({ id: l.id, label: l.name }))}
              planItems={(items ?? []).map((i) => ({
                id: i.id,
                label: `P-${String(i.plan.folio).padStart(4, "0")} · ${i.description}${i.tooth ? ` (${i.tooth})` : ""} · ${money(i.line_total)}`,
              }))}
              lockDentist={profile.role === "dentist"}
              defaultDentist={order.dentist_id}
            />
          ) : (
            <p className="text-sm text-brand-700">{order.instructions ?? "Sin indicaciones."}</p>
          )}
        </Card>
        <Card className="self-start">
          <h2 className="mb-3 font-semibold text-brand-900">Historial</h2>
          <ol className="space-y-3 border-l-2 border-brand-100 pl-4 text-sm">
            {events?.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-magenta-500" />
                <span className="font-medium text-brand-900">{LAB_STATUS[e.status].label}</span>
                <span className="block text-xs text-brand-700/70">
                  {formatDateTime(e.created_at)}
                  {e.author && ` · ${e.author.full_name}`}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
