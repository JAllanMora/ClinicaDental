import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/permissions";
import { formatDateTime, fullName } from "@/lib/format";
import { whatsappViaBot } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { AttendButton, AutoRefresh, SettingsForm } from "./controls";

export const metadata: Metadata = { title: "WhatsApp" };

const STATE = {
  conectado: { label: "Conectado", tone: "green" },
  esperando_qr: { label: "Esperando que escanees el código", tone: "amber" },
  desconectado: { label: "Desconectado", tone: "red" },
} as const;

/** El bot avisa cada 20 s; si lleva más de 2 minutos callado, probablemente está apagado. */
function isStale(lastSeen: string | null | undefined) {
  return !lastSeen || Date.now() - new Date(lastSeen).getTime() > 2 * 60_000;
}

type PatientName = { first_name: string; last_name: string; second_last_name: string | null } | null;

export default async function WhatsappPage() {
  const profile = await requirePermission("whatsapp");
  const supabase = await createClient();
  const [{ data: status }, { data: settings }, { data: types }, { data: waiting }, { data: recent }] = await Promise.all([
    supabase.from("whatsapp_status").select("*").single(),
    supabase.from("whatsapp_settings").select("*").single(),
    supabase.from("appointment_types").select("id, name, duration_minutes").eq("active", true).order("name"),
    supabase
      .from("whatsapp_messages")
      .select("id, phone, body, created_at, patient:patients(first_name, last_name, second_last_name)")
      .eq("needs_attention", true)
      .is("attended_at", null)
      .order("created_at"),
    supabase
      .from("whatsapp_messages")
      .select("id, phone, body, direction, created_at, patient:patients(first_name, last_name, second_last_name)")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const stale = status?.state === "conectado" && isStale(status.last_seen);
  const qrSvg = status?.state === "esperando_qr" && status.qr ? await QRCode.toString(status.qr, { type: "svg", margin: 1, width: 240 }) : null;

  // Conversaciones: último mensaje por número.
  const chats = new Map<string, { phone: string; patient: PatientName; messages: NonNullable<typeof recent> }>();
  for (const m of recent ?? []) {
    const c = chats.get(m.phone) ?? { phone: m.phone, patient: m.patient, messages: [] };
    c.patient ??= m.patient;
    c.messages.push(m);
    chats.set(m.phone, c);
  }
  const conversations = [...chats.values()].slice(0, 15);
  const waitingByPhone = new Map<string, NonNullable<typeof waiting>>();
  for (const w of waiting ?? []) waitingByPhone.set(w.phone, [...(waitingByPhone.get(w.phone) ?? []), w]);
  const waLink = (phone: string) => `https://wa.me/${phone.length === 10 ? `52${phone}` : phone}`;

  return (
    <>
      <AutoRefresh seconds={status?.state === "conectado" ? 30 : 5} />
      <PageHeader
        title="WhatsApp"
        description="Bot que agenda citas, contesta y manda recordatorios por WhatsApp."
        actions={
          <ButtonLink href="/agenda/horarios" variant="secondary">
            Horarios
          </ButtonLink>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card className="self-start">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-brand-900">Conexión</h2>
            <Badge tone={stale ? "red" : STATE[status?.state ?? "desconectado"].tone}>
              {stale ? "Sin respuesta del bot" : STATE[status?.state ?? "desconectado"].label}
            </Badge>
          </div>
          {qrSvg ? (
            <div className="space-y-3 text-sm text-brand-800">
              <div className="mx-auto w-60 rounded-xl border border-brand-100 bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <ol className="list-decimal space-y-1 pl-5">
                <li>Abre WhatsApp en el teléfono del bot.</li>
                <li>Ve a Dispositivos vinculados → Vincular un dispositivo.</li>
                <li>Escanea este código.</li>
              </ol>
            </div>
          ) : status?.state === "conectado" && !stale ? (
            <p className="text-sm text-brand-800">
              Número: <span className="font-mono">{status.phone}</span>
              <br />
              <span className="text-xs text-brand-700/70">Última señal {formatDateTime(status.last_seen!)}</span>
            </p>
          ) : (
            <div className="space-y-2 text-sm text-brand-800">
              <p>El bot no está corriendo. En la computadora de la clínica abre una terminal y corre:</p>
              <pre className="rounded-lg bg-brand-50 p-2 font-mono text-xs">cd ClinicaDental/bot{"\n"}npm start</pre>
              <p className="text-xs text-brand-700/70">Cuando arranque, aquí aparecerá el código para vincular WhatsApp.</p>
            </div>
          )}
          {!whatsappViaBot() && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Para que los recordatorios salgan por el bot, agrega <code>WHATSAPP_PROVIDER=baileys</code> en <code>.env.local</code> y
              reinicia la app.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold text-brand-900">Esperando a recepción</h2>
            {!waitingByPhone.size ? (
              <p className="text-sm text-brand-700/70">Nadie está esperando. Cuando un paciente pida hablar con una persona, aparecerá aquí y el bot dejará de contestarle.</p>
            ) : (
              <ul className="divide-y divide-brand-50">
                {[...waitingByPhone.entries()].map(([phone, items]) => (
                  <li key={phone} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-brand-900">
                        {items[0].patient ? fullName(items[0].patient) : "Número sin registrar"} · <span className="font-mono">{phone}</span>
                      </p>
                      <p className="text-xs text-brand-700/80">
                        {items.at(-1)!.body} · {formatDateTime(items.at(-1)!.created_at)}
                      </p>
                    </div>
                    <Link href={waLink(phone)} target="_blank" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                      Abrir chat
                    </Link>
                    <AttendButton phone={phone} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-brand-900">Conversaciones recientes</h2>
            {!conversations.length ? (
              <EmptyState title="Aún no hay mensajes" />
            ) : (
              <ul className="divide-y divide-brand-50">
                {conversations.map((c) => (
                  <li key={c.phone} className="py-2 text-sm">
                    <details>
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                        <span className="font-medium text-brand-900">{c.patient ? fullName(c.patient) : "Sin registrar"}</span>
                        <span className="font-mono text-xs text-brand-700/70">{c.phone}</span>
                        <span className="ml-auto text-xs text-brand-700/60">{formatDateTime(c.messages[0].created_at)}</span>
                      </summary>
                      <ol className="mt-2 space-y-1.5">
                        {c.messages
                          .slice(0, 20)
                          .reverse()
                          .map((m) => (
                            <li key={m.id} className={m.direction === "entrante" ? "mr-12" : "ml-12 text-right"}>
                              <span
                                className={`inline-block whitespace-pre-line rounded-xl px-3 py-1.5 text-left text-xs ${
                                  m.direction === "entrante" ? "bg-brand-50 text-brand-900" : "bg-emerald-50 text-emerald-900"
                                }`}
                              >
                                {m.body}
                              </span>
                            </li>
                          ))}
                      </ol>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {profile.role === "admin" && settings && (
        <Card className="mt-6">
          <h2 className="mb-1 font-semibold text-brand-900">Configuración del bot</h2>
          <p className="mb-4 text-sm text-brand-700/80">
            Los horarios que ofrece salen de <Link href="/agenda/horarios" className="underline">Horarios</Link> (turnos y días libres de cada odontólogo) y de la
            agenda. El texto del recordatorio se edita en Agenda → Recordatorios.
          </p>
          <SettingsForm settings={settings} types={types ?? []} />
        </Card>
      )}
    </>
  );
}
