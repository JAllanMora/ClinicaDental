"use client";

import { useActionState, useState, useTransition } from "react";
import type { ReminderSettings } from "@/lib/database.types";
import { Alert, Button, Field } from "@/components/ui";
import { saveReminderSettings, sendAppointmentReminder, sendPendingReminders } from "./actions";

type Msg = { error?: string; ok?: string } | null;

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return msg.error ? <Alert>{msg.error}</Alert> : <Alert tone="success">{msg.ok}</Alert>;
}

export function SendPendingButton({ day, count }: { day: string; count: number }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button disabled={pending || count === 0} onClick={() => start(async () => setMsg(await sendPendingReminders(day)))}>
        {pending ? "Enviando…" : `Enviar ${count} pendiente${count === 1 ? "" : "s"}`}
      </Button>
      <Feedback msg={msg} />
    </div>
  );
}

export function SendOneButton({ id, label = "Enviar" }: { id: string; label?: string }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setMsg(await sendAppointmentReminder(id)))}
        className="rounded-lg border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      >
        {pending ? "Enviando…" : label}
      </button>
      {msg && <span className={`max-w-56 text-right text-[11px] ${msg.error ? "text-red-700" : "text-emerald-700"}`}>{msg.error ?? msg.ok}</span>}
    </span>
  );
}

export function SettingsForm({ settings }: { settings: ReminderSettings }) {
  const [state, action, pending] = useActionState(saveReminderSettings, {});
  return (
    <form key={settings.updated_at} action={action} className="space-y-4">
      <Feedback msg={state.error || state.ok ? state : null} />
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-brand-800">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Envío automático diario
        </label>
        <Field label="Enviar con anticipación de">
          <select name="days_before" defaultValue={settings.days_before} className="field">
            <option value={0}>El mismo día (8:00)</option>
            <option value={1}>1 día antes</option>
            <option value={2}>2 días antes</option>
            <option value={3}>3 días antes</option>
          </select>
        </Field>
        <Field label="Teléfono de la clínica" hint="Disponible como {telefono}.">
          <input name="clinic_phone" defaultValue={settings.clinic_phone ?? ""} className="field" />
        </Field>
      </div>
      <Field label="Mensaje de WhatsApp">
        <textarea name="whatsapp_template" rows={3} defaultValue={settings.whatsapp_template} className="field" />
      </Field>
      <Field label="Mensaje SMS" hint="Máximo 320 caracteres; evita acentos para que cueste un solo segmento.">
        <textarea name="sms_template" rows={2} defaultValue={settings.sms_template} className="field" />
      </Field>
      <Field label="Asunto del correo">
        <input name="email_subject" defaultValue={settings.email_subject} className="field" />
      </Field>
      <Field label="Texto del correo">
        <textarea name="email_template" rows={5} defaultValue={settings.email_template} className="field" />
      </Field>
      <p className="text-xs text-brand-700/70">
        Variables: <code>{"{paciente}"}</code> <code>{"{fecha}"}</code> <code>{"{hora}"}</code> <code>{"{doctor}"}</code>{" "}
        <code>{"{enlace}"}</code> (página para confirmar o pedir cambio) <code>{"{telefono}"}</code>.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar configuración"}
        </Button>
      </div>
    </form>
  );
}
