"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import type { WhatsappSettings } from "@/lib/database.types";
import type { ActionState } from "./actions";
import { saveBotAdmin } from "./bot-actions";

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "a. m." : "p. m."}`;

export function BotAdminForm({ settings, dentists }: { settings: WhatsappSettings; dentists: { id: string; full_name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBotAdmin, {});
  return (
    <form key={settings.updated_at} action={action} className="space-y-4" data-testid="bot-admin-form">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Doctor para pacientes de primera vez" hint="Los pacientes nuevos que agenden por WhatsApp quedan con este doctor (y su expediente).">
          <select name="first_visit_dentist_id" defaultValue={settings.first_visit_dentist_id ?? ""} className="field">
            <option value="">Sin asignar (el bot pregunta o toma el primero disponible)</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-start gap-2 self-end pb-2 text-sm text-brand-800">
          <input type="checkbox" name="keep_own_dentist" defaultChecked={settings.keep_own_dentist} className="mt-1" />
          <span>
            Pacientes con expediente: siempre con su doctor
            <span className="block text-xs text-brand-700/70">Si su doctor no tiene espacio, el bot ofrece otro.</span>
          </span>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr] sm:items-end">
        <Field label="Números de administrador" hint="10 dígitos, separados por coma. Reciben alertas y pueden registrar inventario por WhatsApp.">
          <input name="admin_phones" defaultValue={settings.admin_phones.join(", ")} placeholder="55 1234 5678" className="field" />
        </Field>
        <Field label="Resumen diario a las">
          <select name="alert_hour" defaultValue={settings.alert_hour} className="field">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-brand-800">
          <input type="checkbox" name="alerts_enabled" defaultChecked={settings.alerts_enabled} /> Enviar alertas
        </label>
      </div>
      <p className="text-xs text-brand-700/70">
        Alertas: artículos bajo el mínimo, lotes por caducar o caducados y trabajos de laboratorio atrasados. Llega un resumen al día y, durante
        el día, sólo lo nuevo. Para que las entradas queden a tu nombre, registra el mismo teléfono en tu ficha de Personal.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar configuración del bot"}
      </Button>
    </form>
  );
}
