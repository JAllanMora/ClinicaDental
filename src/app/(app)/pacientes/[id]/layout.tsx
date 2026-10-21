import { notFound } from "next/navigation";
import { Badge, ButtonLink } from "@/components/ui";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { ALERT_CONDITIONS, PATHOLOGICAL_CONDITIONS } from "@/lib/clinical";
import { ageFrom, fullName, initials, recordNumber } from "@/lib/format";
import { getMedicalHistory, getPatient } from "./data";
import { PatientTabs } from "./patient-tabs";

export default async function PatientLayout({ params, children }: LayoutProps<"/pacientes/[id]">) {
  const profile = await requireProfile();
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const clinical = canSeeClinical(profile.role);
  const history = clinical ? await getMedicalHistory(id) : null;
  const name = fullName(patient);
  const age = ageFrom(patient.birth_date);

  const conditions = (history?.pathological_history ?? {}) as Record<string, boolean>;
  const alerts = [
    ...(history?.allergies ?? []).map((a) => `Alergia: ${a}`),
    ...PATHOLOGICAL_CONDITIONS.filter((c) => ALERT_CONDITIONS.includes(c.key) && conditions[c.key]).map((c) => c.label),
    ...(history?.pregnant ? ["Embarazo"] : []),
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-magenta-500 text-lg font-semibold text-white shadow-md shadow-brand-500/30">
            {initials(name)}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-brand-900">{name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-700/80">
              <span className="font-mono text-xs">{recordNumber(patient.record_number)}</span>
              {age !== null && <span>· {age} años</span>}
              {patient.phone && <span>· {patient.phone}</span>}
              {!patient.active && <Badge tone="gray">Inactivo</Badge>}
            </div>
          </div>
        </div>
        <ButtonLink href={`/pacientes/${id}/editar`} variant="secondary">
          Editar datos
        </ButtonLink>
      </div>

      {clinical && alerts.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-semibold text-red-800">⚠ Alertas médicas:</span>
          {alerts.map((a) => (
            <Badge key={a} tone="red">
              {a}
            </Badge>
          ))}
        </div>
      )}
      {clinical && !history && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este paciente aún no tiene historia clínica. Captúrala antes de iniciar cualquier tratamiento.
        </div>
      )}

      <PatientTabs id={id} clinical={clinical} />
      {children}
    </>
  );
}
