import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { saveMedicalHistory } from "../../actions";
import { createClient } from "@/lib/supabase/server";
import { getMedicalHistory } from "../data";
import { PendingQuestionnaire } from "./pending-questionnaire";
import { HistoryForm } from "./history-form";

export const metadata: Metadata = { title: "Historia clínica" };

export default async function MedicalHistoryPage({ params }: PageProps<"/pacientes/[id]/historia">) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  const [history, { data: pending }, { count: reviewed }] = await Promise.all([
    getMedicalHistory(id),
    supabase.from("patient_questionnaires").select("*").eq("patient_id", id).is("reviewed_at", null).order("submitted_at", { ascending: false }),
    supabase.from("patient_questionnaires").select("id", { count: "exact", head: true }).eq("patient_id", id).not("reviewed_at", "is", null),
  ]);

  return (
    <>
      {pending?.map((q) => <PendingQuestionnaire key={q.id} patientId={id} q={q} submittedLabel={`Enviado ${formatDateTime(q.submitted_at)}`} />)}
      {history && (
        <p className="mb-4 text-xs text-brand-700/70">Última actualización: {formatDateTime(history.updated_at)}</p>
      )}
      {/* Remonta el formulario cuando se aplica un cuestionario para mostrar los datos nuevos. */}
      <HistoryForm key={`revisados-${reviewed ?? 0}`} action={saveMedicalHistory.bind(null, id)} history={history} />
    </>
  );
}
