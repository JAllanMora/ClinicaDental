import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getPatient } from "../../data";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Firmar consentimiento" };

export default async function NewConsentPage({ params }: PageProps<"/pacientes/[id]/consentimientos/nuevo">) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  const [patient, { data: templates }] = await Promise.all([
    getPatient(id),
    supabase.from("consent_templates").select("id, title, body").eq("active", true).order("title"),
  ]);

  return (
    <ConsentForm
      patientId={id}
      patientName={patient ? fullName(patient) : ""}
      guardian={patient?.guardian_name ?? null}
      dentistName={profile.full_name}
      templates={templates ?? []}
    />
  );
}
