import type { Metadata } from "next";
import Link from "next/link";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { clinicParts, longDay, minutesToLabel, toISO, todayStr } from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";
import { DayOffForm, RemoveDayOffButton, WeeklyHoursEditor } from "./controls";

export const metadata: Metadata = { title: "Horarios" };

export default async function HoursPage({ searchParams }: PageProps<"/agenda/horarios">) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: dentists } = await supabase
    .from("profiles")
    .select("id, full_name, color")
    .eq("role", "dentist")
    .eq("active", true)
    .order("full_name");

  const list = dentists ?? [];
  const requested = typeof sp.doctor === "string" ? sp.doctor : null;
  const selected =
    list.find((d) => d.id === requested) ?? list.find((d) => d.id === profile.id) ?? list[0] ?? null;
  const canEditHours = !!selected && (profile.role === "admin" || profile.id === selected.id);
  const canEditBlocks = !!selected && (profile.role !== "dentist" || profile.id === selected.id);

  const [{ data: hours }, { data: blocks }] = selected
    ? await Promise.all([
        supabase.from("working_hours").select("weekday, starts, ends").eq("dentist_id", selected.id).order("weekday").order("starts"),
        supabase
          .from("schedule_blocks")
          .select("id, starts_at, ends_at, reason")
          .eq("dentist_id", selected.id)
          .gte("ends_at", toISO(todayStr(), 0))
          .order("starts_at")
          .limit(50),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <>
      <PageHeader
        title="Horarios"
        description="Turnos de cada odontólogo y sus días libres. La agenda y el bot de WhatsApp sólo ofrecen citas dentro de estos horarios."
        actions={
          <ButtonLink href="/agenda" variant="secondary">
            ← Agenda
          </ButtonLink>
        }
      />

      {!selected ? (
        <EmptyState title="No hay odontólogos activos">Da de alta al personal en Configuración.</EmptyState>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {list.map((d) => (
              <Link
                key={d.id}
                href={`?doctor=${d.id}`}
                className={cx(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                  d.id === selected.id ? "border-brand-500 bg-brand-50 font-medium text-brand-900" : "border-brand-100 bg-white text-brand-700 hover:bg-brand-50",
                )}
              >
                <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                {d.full_name}
              </Link>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
            <Card>
              <h2 className="mb-1 font-semibold text-brand-900">Horario semanal · {selected.full_name}</h2>
              <p className="mb-4 text-sm text-brand-700/80">
                Puedes poner varios turnos en un día (por ejemplo 9:00–14:00 y 16:00–19:00). Un día sin turnos es día de descanso.
              </p>
              {!hours?.length && <div className="mb-4"><Alert tone="info">Este odontólogo no tiene horario: no se le ofrecerán citas por WhatsApp.</Alert></div>}
              <WeeklyHoursEditor
                key={selected.id + JSON.stringify(hours)}
                dentistId={selected.id}
                readOnly={!canEditHours}
                initial={(hours ?? []).map((h) => ({ weekday: h.weekday, starts: h.starts.slice(0, 5), ends: h.ends.slice(0, 5) }))}
              />
            </Card>

            <Card className="self-start">
              <h2 className="mb-1 font-semibold text-brand-900">Días libres y bloqueos</h2>
              <p className="mb-4 text-sm text-brand-700/80">Vacaciones, congresos, comidas o cualquier día que no trabaje.</p>
              {canEditBlocks && <DayOffForm dentistId={selected.id} today={todayStr()} />}
              <ul className="mt-5 divide-y divide-brand-50">
                {!blocks?.length && <li className="py-2 text-sm text-brand-700/70">Sin días libres próximos.</li>}
                {blocks?.map((b) => (
                  <li key={b.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-brand-900 first-letter:uppercase">{describeBlock(b.starts_at, b.ends_at)}</p>
                      <p className="text-xs text-brand-700/70">{b.reason}</p>
                    </div>
                    {canEditBlocks && <RemoveDayOffButton id={b.id} />}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function describeBlock(startsAt: string, endsAt: string) {
  const s = clinicParts(startsAt);
  const e = clinicParts(new Date(new Date(endsAt).getTime() - 1).toISOString());
  const fullDays = s.minutes === 0 && clinicParts(endsAt).minutes === 0;
  if (fullDays) return s.day === e.day ? longDay(s.day) : `${longDay(s.day)} al ${longDay(e.day)}`;
  return `${longDay(s.day)}, ${minutesToLabel(s.minutes)}–${minutesToLabel(clinicParts(endsAt).minutes)}`;
}
