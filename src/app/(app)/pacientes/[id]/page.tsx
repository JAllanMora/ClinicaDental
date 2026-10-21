import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDate, formatDateTime, fullName } from "@/lib/format";
import { STATUS, clinicParts, minutesToLabel, longDay } from "@/lib/agenda";
import { LAB_OPEN, LAB_STATUS } from "@/lib/lab";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const { data: upcoming } = await supabase
    .from("appointments")
    .select("id, starts_at, status, reason, dentist:profiles!appointments_dentist_id_fkey(full_name)")
    .eq("patient_id", id)
    .gte("starts_at", new Date().toISOString())
    .not("status", "in", "(cancelada,no_asistio,completada)")
    .order("starts_at")
    .limit(5);
  const { data: labOrders } = await supabase
    .from("lab_orders")
    .select("id, folio, work_type, teeth, status, due_date")
    .eq("patient_id", id)
    .in("status", LAB_OPEN)
    .order("created_at", { ascending: false });

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
          <Row label="Recordatorios" value={{ whatsapp: "WhatsApp", sms: "SMS", email: "Correo", ninguno: "No enviar" }[patient.contact_preference]} />
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
      <Card>
        <h2 className="mb-2 font-semibold text-brand-900">Próximas citas</h2>
        {!upcoming?.length ? (
          <p className="py-2 text-sm text-brand-700/70">Sin citas programadas.</p>
        ) : (
          <ul className="divide-y divide-brand-50">
            {upcoming.map((a) => {
              const { day, minutes } = clinicParts(a.starts_at);
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <a href={`/agenda?fecha=${day}`} className="hover:text-magenta-500">
                    <span className="block font-medium first-letter:uppercase text-brand-900">
                      {longDay(day)} · {minutesToLabel(minutes)}
                    </span>
                    <span className="block text-xs text-brand-700/70">
                      {a.reason} · {a.dentist?.full_name}
                    </span>
                  </a>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[a.status].tone}`}>{STATUS[a.status].label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-brand-900">Trabajos de laboratorio</h2>
          <a href={`/laboratorio/nueva?paciente=${id}`} className="text-sm text-brand-600 hover:underline">
            + Nueva orden
          </a>
        </div>
        {!labOrders?.length ? (
          <p className="py-2 text-sm text-brand-700/70">Sin trabajos en curso.</p>
        ) : (
          <ul className="divide-y divide-brand-50">
            {labOrders.map((o) => (
              <li key={o.id}>
                <a href={`/laboratorio/${o.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-magenta-500">
                  <span>
                    <span className="font-medium text-brand-900">{o.work_type}</span>
                    {o.teeth && <span className="text-brand-700/70"> · {o.teeth}</span>}
                    {o.due_date && <span className="block text-xs text-brand-700/70">Para {formatDate(o.due_date)}</span>}
                  </span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-800">{LAB_STATUS[o.status].label}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
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
