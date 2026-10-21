import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { clinicParts, dayRange, minutesToLabel, todayStr } from "@/lib/agenda";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { TabletPatientSearch } from "./search";

export default async function TabletHome() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [start, end] = dayRange(todayStr());
  let q = supabase
    .from("appointments")
    .select("id, starts_at, patient:patients(id, first_name, last_name, second_last_name)")
    .gte("starts_at", start)
    .lt("starts_at", end)
    .not("status", "in", "(cancelada,no_asistio,completada)")
    .order("starts_at");
  if (profile.role === "dentist") q = q.eq("dentist_id", profile.id);
  const { data: today } = await q;

  return (
    <div className="space-y-8 pt-4">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">Modo tablet</h1>
        <p className="mt-1 text-base text-brand-700/80">
          Elige al paciente y entrégale la tablet para que llene su cuestionario de salud o firme su consentimiento.
        </p>
      </div>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-magenta-500">Pacientes de hoy</h2>
        {!today?.length ? (
          <p className="text-base text-brand-700/70">No hay citas pendientes hoy.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {today.map(
              (a) =>
                a.patient && (
                  <li key={a.id}>
                    <Link
                      href={`/tablet/${a.patient.id}`}
                      className="flex items-center justify-between rounded-2xl border border-brand-100 bg-white px-5 py-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
                    >
                      <span className="font-medium text-brand-900">{fullName(a.patient)}</span>
                      <span className="font-mono text-sm text-brand-600">{minutesToLabel(clinicParts(a.starts_at).minutes)}</span>
                    </Link>
                  </li>
                ),
            )}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-magenta-500">Buscar otro paciente</h2>
        <TabletPatientSearch />
      </section>
    </div>
  );
}
