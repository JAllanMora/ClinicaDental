import Link from "next/link";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { ROLE_LABELS, requireProfile } from "@/lib/auth";
import { STATUS, dayRange, minutesToLabel, clinicParts, todayStr } from "@/lib/agenda";
import { fullName, recordNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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

  const [todayStart, todayEnd] = dayRange(todayStr());
  let todayQuery = supabase
    .from("appointments")
    .select("id, starts_at, status, reason, patient:patients(id, first_name, last_name, second_last_name), dentist:profiles!appointments_dentist_id_fkey(full_name, color)")
    .gte("starts_at", todayStart)
    .lt("starts_at", todayEnd)
    .not("status", "in", "(cancelada,no_asistio)")
    .order("starts_at");
  if (profile.role === "dentist") todayQuery = todayQuery.eq("dentist_id", profile.id);

  const [{ count: total }, { count: newThisMonth }, { data: recent }, { data: today }] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("patients").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
    supabase
      .from("patients")
      .select("id, record_number, first_name, last_name, second_last_name, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    todayQuery,
  ]);
  const pendingToday = (today ?? []).filter((a) => a.status !== "completada").length;

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
          <p className="text-sm text-brand-700/80">{profile.role === "dentist" ? "Mis citas de hoy" : "Citas de hoy"}</p>
          <p className="mt-2 text-4xl font-semibold text-brand-900">{today?.length ?? 0}</p>
          <p className="mt-1 text-xs text-brand-700/60">{pendingToday} por atender</p>
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-brand-900">Agenda de hoy</h2>
            <Link href="/agenda" className="text-sm text-brand-600 hover:underline">
              Abrir agenda
            </Link>
          </div>
          {!today?.length ? (
            <p className="text-sm text-brand-700/70">No hay citas para hoy.</p>
          ) : (
            <ul className="space-y-2">
              {today.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="w-11 font-mono text-xs text-brand-700">{minutesToLabel(clinicParts(a.starts_at).minutes)}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.dentist?.color ?? "#A0449A" }} />
                  <span className="min-w-0 flex-1 truncate">
                    {a.patient ? (
                      <Link href={`/pacientes/${a.patient.id}`} className="font-medium text-brand-900 hover:text-magenta-500">
                        {fullName(a.patient)}
                      </Link>
                    ) : (
                      "—"
                    )}
                    <span className="block truncate text-xs text-brand-700/70">{a.reason}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[a.status].tone}`}>{STATUS[a.status].label}</span>
                </li>
              ))}
              {today.length > 8 && <li className="text-xs text-brand-700/70">y {today.length - 8} más…</li>}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
