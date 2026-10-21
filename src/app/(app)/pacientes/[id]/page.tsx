import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDate, formatDateTime, fullName } from "@/lib/format";
import { getPatient } from "./data";
import { ActiveToggle } from "./active-toggle";

export async function generateMetadata({ params }: PageProps<"/pacientes/[id]">): Promise<Metadata> {
  const patient = await getPatient((await params).id);
  return { title: patient ? fullName(patient) : "Paciente" };
}

const SEX: Record<string, string> = { F: "Femenino", M: "Masculino", X: "Otro" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm">
      <dt className="text-brand-700/70">{label}</dt>
      <dd className="col-span-2 text-brand-950">{value || "—"}</dd>
    </div>
  );
}

export default async function PatientSummaryPage({ params }: PageProps<"/pacientes/[id]">) {
  const profile = await requireProfile();
  const { id } = await params;
  const patient = (await getPatient(id))!;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-2 font-semibold text-brand-900">Datos personales</h2>
        <dl className="divide-y divide-brand-50">
          <Row label="Fecha de nacimiento" value={formatDate(patient.birth_date)} />
          <Row label="Sexo" value={patient.sex ? SEX[patient.sex] : null} />
          <Row label="CURP" value={patient.curp} />
          <Row label="Ocupación" value={patient.occupation} />
          <Row label="Tutor" value={patient.guardian_name} />
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold text-brand-900">Contacto</h2>
        <dl className="divide-y divide-brand-50">
          <Row label="Teléfono" value={patient.phone} />
          <Row label="Correo" value={patient.email} />
          <Row label="Domicilio" value={patient.address} />
          <Row
            label="Emergencia"
            value={[patient.emergency_contact_name, patient.emergency_contact_phone].filter(Boolean).join(" · ")}
          />
          <Row label="Referido por" value={patient.referred_by} />
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold text-brand-900">Atención</h2>
        <dl className="divide-y divide-brand-50">
          <Row label="Odontólogo" value={patient.primary_dentist?.full_name} />
          <Row label="Sucursal" value={patient.branch?.name} />
          <Row label="Alta" value={formatDateTime(patient.created_at)} />
          <Row label="Notas" value={patient.notes} />
        </dl>
      </Card>
      {profile.role !== "dentist" && (
        <Card>
          <h2 className="mb-2 font-semibold text-brand-900">Estado del expediente</h2>
          <p className="mb-4 text-sm text-brand-700/80">
            Por norma (NOM-004-SSA3) el expediente no se elimina. Puedes marcarlo como inactivo para ocultarlo de las búsquedas.
          </p>
          <ActiveToggle id={id} active={patient.active} />
        </Card>
      )}
    </div>
  );
}
