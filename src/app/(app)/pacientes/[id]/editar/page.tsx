import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { updatePatient } from "../../actions";
import { getFormOptions } from "../../data";
import { PatientForm } from "../../patient-form";

export const metadata: Metadata = { title: "Editar paciente" };

export default async function EditPatientPage({ params }: PageProps<"/pacientes/[id]/editar">) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: patient }, { dentists, branches }] = await Promise.all([
    supabase.from("patients").select("*").eq("id", id).maybeSingle(),
    getFormOptions(),
  ]);
  if (!patient) notFound();

  return (
    <>
      <PageHeader title="Editar paciente" description={fullName(patient)} />
      <PatientForm
        action={updatePatient.bind(null, id)}
        patient={patient}
        dentists={dentists}
        branches={branches}
        cancelHref={`/pacientes/${id}`}
      />
    </>
  );
}
