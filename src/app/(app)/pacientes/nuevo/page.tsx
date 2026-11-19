import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createPatient } from "../actions";
import { getFormOptions } from "../data";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Nuevo paciente" };

export default async function NewPatientPage() {
  await requireProfile();
  const { dentists, branches } = await getFormOptions();

  return (
    <>
      <PageHeader title="Nuevo paciente" description="Los campos con * son obligatorios." />
      <PatientForm action={createPatient} dentists={dentists} branches={branches} cancelHref="/pacientes" />
    </>
  );
}
