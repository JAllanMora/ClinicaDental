import { notFound, redirect } from "next/navigation";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { TabletConsent } from "./tablet-consent";

export default async function TabletConsentPage({ params }: PageProps<"/tablet/[pid]/consentimiento">) {
  const profile = await requireProfile();
  const { pid } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/tablet/${pid}`);
  const supabase = await createClient();
  const [{ data: patient }, { data: templates }] = await Promise.all([
    supabase.from("patients").select("id, first_name, last_name, second_last_name, guardian_name").eq("id", pid).maybeSingle(),
    supabase.from("consent_templates").select("id, title, body").eq("active", true).order("title"),
  ]);
  if (!patient) notFound();
  return (
    <div className="space-y-6 pt-4">
      <h1 className="text-3xl font-semibold text-brand-900">Consentimiento informado</h1>
      <TabletConsent
        patientId={patient.id}
        signerDefault={patient.guardian_name ?? fullName(patient)}
        relationDefault={patient.guardian_name ? "Tutor" : "Paciente"}
        templates={templates ?? []}
      />
    </div>
  );
}
