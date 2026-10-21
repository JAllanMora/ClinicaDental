import Link from "next/link";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { ROLE_LABELS, requireProfile } from "@/lib/auth";
import { fullName, recordNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const ROADMAP = [
  { phase: "Fase 2", title: "Expediente clínico", items: "Odontograma, periodontograma, notas de evolución, consentimiento con firma" },
  { phase: "Fase 3", title: "Imagenología", items: "Radiografías, fotos intraorales, DICOM y STL" },
  { phase: "Fase 4", title: "Agenda", items: "Vista por doctor y sillón, tipos de cita, lista de espera" },
  { phase: "Fase 5", title: "Recordatorios", items: "WhatsApp y correo automáticos" },
];

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("es-MX", { hour: "numeric", hour12: false, timeZone: "America/Mexico_City" }).format(new Date()),
  );
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const profile = await requireProfile();
  const { error } = await searchParams;
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ count: total }, { count: newThisMonth }, { data: recent }] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("patients").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
    supabase
      .from("patients")
      .select("id, record_number, first_name, last_name, second_last_name, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const firstName = profile.full_name.split(" ")[0];

  return (
    <>
      {error === "permiso" && (
        <div className="mb-6">
          <Alert>No tienes permiso para entrar a esa sección.</Alert>
        </div>
      )}

      <section className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-500 to-magenta-500 px-6 py-8 text-white shadow-lg shadow-brand-500/25 sm:px-10">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10" />
        <p className="text-sm text-white/80">{ROLE_LABELS[profile.role]}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-2 max-w-lg text-white/85">Tu sonrisa merece atención. Esto es lo que pasa hoy en la clínica.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink href="/pacientes/nuevo" variant="secondary" className="border-transparent">
            + Nuevo paciente
          </ButtonLink>
          <ButtonLink href="/pacientes" variant="ghost" className="text-white hover:bg-white/15">
            Buscar paciente
          </ButtonLink>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <p className="text-sm text-brand-700/80">{profile.role === "dentist" ? "Mis pacientes" : "Pacientes activos"}</p>
          <p className="mt-2 text-4xl font-semibold text-brand-900">{total ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-brand-700/80">Altas este mes</p>
          <p className="mt-2 text-4xl font-semibold text-magenta-500">{newThisMonth ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-brand-700/80">Citas de hoy</p>
          <p className="mt-2 text-4xl font-semibold text-brand-300">—</p>
          <p className="mt-1 text-xs text-brand-700/60">Disponible con el módulo de agenda</p>
        </Card>

        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-brand-900">Últimos pacientes registrados</h2>
            <Link href="/pacientes" className="text-sm text-brand-600 hover:underline">
              Ver todos
            </Link>
          </div>
          {!recent?.length ? (
            <p className="text-sm text-brand-700/70">Aún no hay pacientes.</p>
          ) : (
            <ul className="divide-y divide-brand-50">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link href={`/pacientes/${p.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-magenta-500">
                    <span className="font-medium text-brand-900">{fullName(p)}</span>
                    <span className="font-mono text-xs text-brand-700/70">{recordNumber(p.record_number)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-brand-900">Próximamente</h2>
          <ol className="space-y-3">
            {ROADMAP.map((r) => (
              <li key={r.phase} className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-magenta-500">{r.phase}</span>
                <span className="block font-medium text-brand-900">{r.title}</span>
                <span className="block text-xs text-brand-700/70">{r.items}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
