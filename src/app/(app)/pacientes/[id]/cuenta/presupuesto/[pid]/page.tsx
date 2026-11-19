import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getPatient } from "../../../data";
import { PlanEditor } from "./plan-editor";

export const metadata: Metadata = { title: "Presupuesto" };

export default async function PlanPage({ params }: PageProps<"/pacientes/[id]/cuenta/presupuesto/[pid]">) {
  const profile = await requireProfile();
  const { id, pid } = await params;
  const supabase = await createClient();
  const [{ data: plan }, { data: items }, { data: treatments }, { data: dentists }, patient] = await Promise.all([
    supabase.from("treatment_plans").select("*").eq("id", pid).eq("patient_id", id).maybeSingle(),
    supabase
      .from("treatment_plan_items")
      .select("*, completer:profiles!treatment_plan_items_completed_by_fkey(full_name)")
      .eq("plan_id", pid)
      .order("phase")
      .order("sort"),
    supabase.from("treatments").select("id, name, category, price").eq("active", true).order("category").order("name"),
    supabase.from("profiles").select("id, full_name, professional_id").eq("role", "dentist").eq("active", true).order("full_name"),
    getPatient(id),
  ]);
  if (!plan || !patient) notFound();

  return (
    <PlanEditor
      key={plan.updated_at}
      patient={{ id, name: fullName(patient), phone: patient.phone }}
      plan={plan}
      items={items ?? []}
      treatments={treatments ?? []}
      dentists={dentists ?? []}
      role={profile.role}
    />
  );
}
