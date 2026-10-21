import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { fullName, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { OrderForm, PickPatient } from "../forms";

export const metadata: Metadata = { title: "Nueva orden de laboratorio" };

export default async function NewLabOrderPage({ searchParams }: PageProps<"/laboratorio/nueva">) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const patientId = typeof sp.paciente === "string" ? sp.paciente : null;
  const supabase = await createClient();

  const [{ data: patient }, { data: dentists }, { data: labs }, { data: items }] = await Promise.all([
    patientId
      ? supabase.from("patients").select("id, first_name, last_name, second_last_name, primary_dentist_id").eq("id", patientId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("id, full_name").eq("role", "dentist").eq("active", true).order("full_name"),
    supabase.from("labs").select("id, name").eq("active", true).order("name"),
    patientId
      ? supabase
          .from("treatment_plan_items")
          .select("id, description, tooth, line_total, plan:treatment_plans!inner(patient_id, folio)")
          .eq("plan.patient_id", patientId)
          .neq("status", "cancelado")
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <PageHeader
        title="Nueva orden de laboratorio"
        actions={
          <Link href="/laboratorio" className="text-sm text-brand-600 hover:underline">
            ← Laboratorio
          </Link>
        }
      />
      <Card className="max-w-3xl">
        {!patient ? (
          <div>
            <span className="label">Paciente</span>
            <PickPatient />
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm">
              Paciente:{" "}
              <Link href={`/pacientes/${patient.id}`} className="font-medium text-brand-900 hover:text-magenta-500">
                {fullName(patient)}
              </Link>{" "}
              <Link href="/laboratorio/nueva" className="text-xs text-brand-600 hover:underline">
                Cambiar
              </Link>
            </p>
            <OrderForm
              patientId={patient.id}
              dentists={(dentists ?? []).map((d) => ({ id: d.id, label: d.full_name }))}
              labs={(labs ?? []).map((l) => ({ id: l.id, label: l.name }))}
              planItems={(items ?? []).map((i) => ({
                id: i.id,
                label: `P-${String(i.plan.folio).padStart(4, "0")} · ${i.description}${i.tooth ? ` (${i.tooth})` : ""} · ${money(i.line_total)}`,
              }))}
              lockDentist={profile.role === "dentist"}
              defaultDentist={profile.role === "dentist" ? profile.id : (patient.primary_dentist_id ?? dentists?.[0]?.id ?? "")}
            />
          </>
        )}
      </Card>
    </>
  );
}
