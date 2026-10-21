import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom } from "@/lib/format";
import { getPatient } from "../data";
import { Odontogram } from "./odontogram";

export const metadata: Metadata = { title: "Odontograma" };

export default async function OdontogramPage({ params }: PageProps<"/pacientes/[id]/odontograma">) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  const [patient, { data: findings }, { data: staff }] = await Promise.all([
    getPatient(id),
    supabase.from("dental_findings").select("*").eq("patient_id", id).order("recorded_at"),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const age = ageFrom(patient?.birth_date ?? null);
  const names = Object.fromEntries((staff ?? []).map((s) => [s.id, s.full_name]));

  return (
    <Odontogram
      patientId={id}
      findings={findings ?? []}
      staffNames={names}
      initialDentition={age !== null && age < 6 ? "temporal" : age !== null && age < 13 ? "mixta" : "permanente"}
    />
  );
}
