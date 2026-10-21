import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { addDays, clinicParts, dayRange, isValidDay, longDay, minutesToLabel, todayStr } from "@/lib/agenda";
import { formatDateTime, fullName } from "@/lib/format";
import { channelConfigured } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { SendOneButton, SendPendingButton, SettingsForm } from "./controls";

export const metadata: Metadata = { title: "Recordatorios" };

const CHANNEL = { whatsapp: "WhatsApp", sms: "SMS", email: "Correo", ninguno: "No contactar" } as const;
const NSTATUS = {
  enviado: { label: "Enviado", tone: "green" },
  simulado: { label: "Registrado (prueba)", tone: "amber" },
  fallido: { label: "Falló", tone: "red" },
  pendiente: { label: "Pendiente", tone: "gray" },
} as const;

export default async function RemindersPage({ searchParams }: PageProps<"/agenda/recordatorios">) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: settings } = await supabase.from("reminder_settings").select("*").single();
  const day = isValidDay(sp.fecha) ? sp.fecha : addDays(todayStr(), settings?.days_before ?? 1);
  const [start, end] = dayRange(day);

  const [{ data: appts }, { data: log }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, starts_at, status, reminder_sent_at, patient_response, patient:patients(id, first_name, last_name, second_last_name, phone, email, contact_preference), dentist:profiles!appointments_dentist_id_fkey(full_name)",
      )
      .gte("starts_at", start)
      .lt("starts_at", end)
      .in("status", ["programada", "confirmada"])
      .order("starts_at"),
    supabase
      .from("notifications")
      .select("*, patient:patients(first_name, last_name, second_last_name)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const pending = (appts ?? []).filter((a) => !a.reminder_sent_at).length;
  const providers = (["whatsapp", "sms", "email"] as const).map((c) => ({ c, on: channelConfigured(c) }));

  return (
    <>
      <PageHeader
        title="Recordatorios"
        description="Mensajes de recordatorio con enlace para que el paciente confirme o pida un cambio."
        actions={
          <ButtonLink href="/agenda" variant="secondary">
            ← Agenda
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {providers.map(({ c, on }) => (
          <Badge key={c} tone={on ? "green" : "amber"}>
            {CHANNEL[c]}: {on ? "conectado" : "modo prueba"}
          </Badge>
        ))}
        {!settings?.enabled && <Badge tone="gray">Envío automático desactivado</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link href={`?fecha=${addDays(day, -1)}`} className="rounded-lg px-2 py-1 text-brand-700 hover:bg-brand-50" aria-label="Día anterior">
                ←
              </Link>
              <h2 className="font-semibold text-brand-900 first-letter:uppercase">{longDay(day)}</h2>
              <Link href={`?fecha=${addDays(day, 1)}`} className="rounded-lg px-2 py-1 text-brand-700 hover:bg-brand-50" aria-label="Día siguiente">
                →
              </Link>
            </div>
            {profile.role !== "dentist" && <SendPendingButton day={day} count={pending} />}
          </div>
          {!appts?.length ? (
            <EmptyState title="No hay citas activas ese día" />
          ) : (
            <ul className="divide-y divide-brand-50">
              {appts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="w-12 font-mono text-xs text-brand-700">{minutesToLabel(clinicParts(a.starts_at).minutes)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-brand-900">{a.patient ? fullName(a.patient) : "—"}</p>
                    <p className="text-xs text-brand-700/70">
                      {a.dentist?.full_name} · {a.patient ? CHANNEL[a.patient.contact_preference] : ""}{" "}
                      {a.patient?.contact_preference === "email" ? a.patient.email : a.patient?.phone}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.patient_response === "confirmada" && <Badge tone="green">Confirmó por enlace</Badge>}
                    {a.patient_response === "cambio" && <Badge tone="red">Pidió cambio</Badge>}
                    {a.reminder_sent_at ? <Badge tone="brand">Recordado {formatDateTime(a.reminder_sent_at)}</Badge> : <Badge tone="gray">Sin recordatorio</Badge>}
                  </div>
                  <SendOneButton id={a.id} label={a.reminder_sent_at ? "Reenviar" : "Enviar"} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="self-start">
          <h2 className="mb-3 font-semibold text-brand-900">Últimos mensajes</h2>
          {!log?.length ? (
            <p className="text-sm text-brand-700/70">Aún no se han enviado mensajes.</p>
          ) : (
            <ul className="space-y-3">
              {log.map((n) => (
                <li key={n.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-brand-900">{n.patient ? fullName(n.patient) : "—"}</span>
                    <Badge tone={NSTATUS[n.status].tone}>{NSTATUS[n.status].label}</Badge>
                  </div>
                  <p className="text-xs text-brand-700/70">
                    {CHANNEL[n.channel]} · {n.recipient} · {formatDateTime(n.created_at)}
                  </p>
                  {n.error && <p className="text-xs text-red-700">{n.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {profile.role === "admin" && settings && (
        <Card className="mt-6">
          <h2 className="mb-1 font-semibold text-brand-900">Configuración de mensajes</h2>
          <p className="mb-4 text-sm text-brand-700/80">
            El envío automático corre todos los días a las 8:00. Para WhatsApp y SMS se usa Twilio y para correo Resend; sin
            credenciales los mensajes quedan registrados en modo prueba.
          </p>
          <SettingsForm settings={settings} />
        </Card>
      )}
    </>
  );
}
