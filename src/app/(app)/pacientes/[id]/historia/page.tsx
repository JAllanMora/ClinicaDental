import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { saveMedicalHistory } from "../../actions";
import { getMedicalHistory } from "../data";
import { HistoryForm } from "./history-form";

export const metadata: Metadata = { title: "Historia clínica" };

export default async function MedicalHistoryPage({ params }: PageProps<"/pacientes/[id]/historia">) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const history = await getMedicalHistory(id);

  return (
    <>
      {history && (
        <p className="mb-4 text-xs text-brand-700/70">Última actualización: {formatDateTime(history.updated_at)}</p>
      )}
      <HistoryForm action={saveMedicalHistory.bind(null, id)} history={history} />
    </>
  );
}
