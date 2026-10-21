import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactChannel, Database, NotificationStatus, ReminderSettings } from "@/lib/database.types";
import { clinicParts, dayRange, longDay, minutesToLabel } from "@/lib/agenda";

type Channel = Exclude<ContactChannel, "ninguno">;
type Db = SupabaseClient<Database>;

/**
 * Proveedores:
 * - WhatsApp y SMS con Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, TWILIO_WHATSAPP_FROM).
 *   En producción WhatsApp exige una plantilla aprobada: TWILIO_WHATSAPP_CONTENT_SID con variables
 *   {{1}} paciente, {{2}} fecha, {{3}} hora, {{4}} doctor, {{5}} enlace.
 * - Correo con Resend (RESEND_API_KEY, EMAIL_FROM).
 * Sin credenciales el mensaje se registra como "simulado" para poder probar el flujo.
 */
export function channelConfigured(channel: Channel) {
  const env = process.env;
  if (channel === "email") return !!(env.RESEND_API_KEY && env.EMAIL_FROM);
  const twilio = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
  return channel === "sms" ? twilio && !!env.TWILIO_SMS_FROM : twilio && !!env.TWILIO_WHATSAPP_FROM;
}

/** Normaliza teléfonos de México a E.164 (+52 y 10 dígitos). */
export function toE164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("521")) return `+52${digits.slice(3)}`;
  return null;
}

export function render(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

type Outcome = { status: NotificationStatus; providerId?: string; error?: string };

async function sendTwilio(channel: "sms" | "whatsapp", to: string, body: string, vars: Record<string, string>): Promise<Outcome> {
  const env = process.env;
  const params = new URLSearchParams();
  if (channel === "whatsapp") {
    params.set("From", `whatsapp:${env.TWILIO_WHATSAPP_FROM}`);
    params.set("To", `whatsapp:${to}`);
    if (env.TWILIO_WHATSAPP_CONTENT_SID) {
      params.set("ContentSid", env.TWILIO_WHATSAPP_CONTENT_SID);
      params.set(
        "ContentVariables",
        JSON.stringify({ 1: vars.paciente, 2: vars.fecha, 3: vars.hora, 4: vars.doctor, 5: vars.enlace }),
      );
    } else {
      params.set("Body", body);
    }
  } else {
    params.set("From", env.TWILIO_SMS_FROM!);
    params.set("To", to);
    params.set("Body", body);
  }
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  return res.ok ? { status: "enviado", providerId: json.sid } : { status: "fallido", error: json.message ?? `HTTP ${res.status}` };
}

async function sendEmail(to: string, subject: string, body: string): Promise<Outcome> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text: body }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  return res.ok ? { status: "enviado", providerId: json.id } : { status: "fallido", error: json.message ?? `HTTP ${res.status}` };
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
}

type ReminderTarget = {
  id: string;
  starts_at: string;
  confirm_token: string;
  patient: { id: string; first_name: string; phone: string | null; email: string | null; contact_preference: ContactChannel } | null;
  dentist: { full_name: string } | null;
};

export const REMINDER_SELECT =
  "id, starts_at, confirm_token, patient:patients(id, first_name, phone, email, contact_preference), dentist:profiles!appointments_dentist_id_fkey(full_name)" as const;

/** Elige el canal: la preferencia del paciente si tiene el dato; si no, el que tenga disponible. */
function pickChannel(p: NonNullable<ReminderTarget["patient"]>, forced?: Channel): { channel: Channel; to: string } | null {
  const phone = p.phone ? toE164(p.phone) : null;
  const options: Channel[] = forced ? [forced] : p.contact_preference === "ninguno" ? [] : [p.contact_preference, "whatsapp", "email", "sms"];
  for (const c of options) {
    if ((c === "whatsapp" || c === "sms") && phone) return { channel: c, to: phone };
    if (c === "email" && p.email) return { channel: c, to: p.email };
  }
  return null;
}

/**
 * Envía el recordatorio de una cita y lo deja en la bitácora de mensajes.
 * `db` puede ser el cliente del usuario (envío manual) o el de servicio (cron).
 */
export async function sendReminder(
  db: Db,
  appt: ReminderTarget,
  settings: ReminderSettings,
  opts: { kind?: "recordatorio" | "manual"; channel?: Channel } = {},
): Promise<{ status: NotificationStatus | "sin_contacto"; channel?: Channel; error?: string }> {
  if (!appt.patient) return { status: "sin_contacto" };
  const target = pickChannel(appt.patient, opts.channel);
  if (!target) return { status: "sin_contacto" };

  const { day, minutes } = clinicParts(appt.starts_at);
  const vars = {
    paciente: appt.patient.first_name,
    fecha: longDay(day),
    hora: minutesToLabel(minutes),
    doctor: appt.dentist?.full_name ?? "tu odontólogo",
    enlace: `${siteUrl()}/c/${appt.confirm_token}`,
    telefono: settings.clinic_phone ?? "",
  };
  const template =
    target.channel === "email" ? settings.email_template : target.channel === "sms" ? settings.sms_template : settings.whatsapp_template;
  const body = render(template, vars);

  let outcome: Outcome;
  if (!channelConfigured(target.channel)) {
    outcome = { status: "simulado" };
  } else {
    try {
      outcome =
        target.channel === "email"
          ? await sendEmail(target.to, render(settings.email_subject, vars), body)
          : await sendTwilio(target.channel, target.to, body, vars);
    } catch (e) {
      outcome = { status: "fallido", error: e instanceof Error ? e.message : "Error de red" };
    }
  }

  await db.from("notifications").insert({
    appointment_id: appt.id,
    patient_id: appt.patient.id,
    channel: target.channel,
    kind: opts.kind ?? "recordatorio",
    recipient: target.to,
    body,
    status: outcome.status,
    provider_id: outcome.providerId ?? null,
    error: outcome.error ?? null,
    sent_at: outcome.status === "fallido" ? null : new Date().toISOString(),
  });
  if (outcome.status !== "fallido") {
    await db.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", appt.id);
  }
  return { status: outcome.status, channel: target.channel, error: outcome.error };
}

/** Citas del día indicado que aún no tienen recordatorio. */
export async function pendingReminders(db: Db, day: string) {
  const [start, end] = dayRange(day);
  const { data } = await db
    .from("appointments")
    .select(REMINDER_SELECT)
    .gte("starts_at", start)
    .lt("starts_at", end)
    .in("status", ["programada", "confirmada"])
    .is("reminder_sent_at", null)
    .order("starts_at");
  return (data ?? []) as ReminderTarget[];
}

export async function getReminderSettings(db: Db) {
  const { data } = await db.from("reminder_settings").select("*").single();
  return data;
}
