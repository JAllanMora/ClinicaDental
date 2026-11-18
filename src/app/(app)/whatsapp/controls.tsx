"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import type { WhatsappSettings } from "@/lib/database.types";
import { Alert, Button, Field } from "@/components/ui";
import { markAttended, saveWhatsappSettings } from "./actions";

/** Vuelve a pedir la página cada tantos segundos (estado de la conexión y chats nuevos). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

export function AttendButton({ phone }: { phone: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-700">{error}</span>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await markAttended(phone);
            setError(r.error ?? null);
          })
        }
      >
        {pending ? "Marcando…" : "Marcar atendido"}
      </Button>
    </span>
  );
}

export function SettingsForm({ settings, types }: { settings: WhatsappSettings; types: { id: string; name: string; duration_minutes: number }[] }) {
  const [state, action, pending] = useActionState(saveWhatsappSettings, {});
  return (
    <form key={settings.updated_at} action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-brand-800">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Bot activo
        </label>
        <Field label="Ofrecer citas hasta" hint="Días hacia adelante.">
          <input type="number" name="days_ahead" min={1} max={60} defaultValue={settings.days_ahead} className="field" />
        </Field>
        <Field label="Anticipación mínima" hint="Horas antes de la cita.">
          <input type="number" name="min_notice_hours" min={0} max={168} defaultValue={Math.round(settings.min_notice_minutes / 60)} className="field" />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-brand-800">
        <input type="checkbox" name="ask_dentist" defaultChecked={settings.ask_dentist} className="mt-1" />
        <span>
          Preguntar con qué doctor quiere la cita
          <span className="block text-xs text-brand-700/70">
            Si hay más de un doctor para ese tipo de cita, el bot le deja elegir o tomar el primero disponible. Los doctores de cada tipo se
            marcan en Configuración → Tipos de cita.
          </span>
        </span>
      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-brand-900">Tipos de cita que el paciente puede agendar solo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {types.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm text-brand-800">
              <input type="checkbox" name="bookable_type_ids" value={t.id} defaultChecked={settings.bookable_type_ids.includes(t.id)} />
              {t.name} <span className="text-xs text-brand-700/60">({t.duration_minutes} min)</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Saludo" hint="{nombre} se cambia por el nombre del paciente si ya está registrado.">
        <textarea name="welcome_message" rows={2} defaultValue={settings.welcome_message} className="field" />
      </Field>
      <Field label="Mensaje al pasar con recepción">
        <textarea name="handoff_message" rows={2} defaultValue={settings.handoff_message} className="field" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
