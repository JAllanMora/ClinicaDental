import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { Questionnaire } from "./questionnaire";

export default async function TabletQuestionnaire({ params }: PageProps<"/tablet/[pid]/cuestionario">) {
  await requireProfile();
  const { pid } = await params;
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("id, first_name, last_name, second_last_name, sex, guardian_name").eq("id", pid).maybeSingle();
  if (!patient) notFound();
  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">Cuestionario de salud</h1>
        <p className="mt-1 text-base text-brand-700/80">
          {patient.first_name}, tus respuestas ayudan a que tu tratamiento sea seguro. Sólo las verá tu odontólogo.
        </p>
      </div>
      <Questionnaire patientId={patient.id} patientName={patient.guardian_name ?? fullName(patient)} female={patient.sex === "F"} />
    </div>
  );
}
