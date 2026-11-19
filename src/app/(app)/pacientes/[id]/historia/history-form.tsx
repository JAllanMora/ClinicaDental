"use client";

import { useActionState } from "react";
import type { MedicalHistory } from "@/lib/database.types";
import { PATHOLOGICAL_CONDITIONS } from "@/lib/clinical";
import { Alert, Button, Card, Field } from "@/components/ui";
import type { FormState } from "../../actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  history: MedicalHistory | null;
};

function YesNo({ name, label, value }: { name: string; label: string; value: boolean | null | undefined }) {
  const current = value === true ? "si" : value === false ? "no" : "";
  return (
    <Field label={label}>
      <select name={name} defaultValue={current} className="field">
        <option value="">No aplica / no sabe</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    </Field>
  );
}

export function HistoryForm({ action, history }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const conditions = (history?.pathological_history ?? {}) as Record<string, boolean>;

  const area = (name: keyof MedicalHistory, label: string, rows = 2, hint?: string) => (
    <Field label={label} hint={hint}>
      <textarea name={name} rows={rows} defaultValue={(history?.[name] as string | null) ?? ""} className="field" />
    </Field>
  );

  return (
    // Remontar al cambiar la historia: React no restaura los <select> al reiniciar el formulario.
    <form key={history?.updated_at ?? "nueva"} action={formAction} className="space-y-6">
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="success">Historia clínica guardada.</Alert>}

      <Card>
        <h2 className="mb-4 font-semibold text-brand-900">Motivo de consulta</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {area("chief_complaint", "Motivo de consulta")}
          {area("current_illness", "Padecimiento actual")}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-brand-900">Antecedentes personales patológicos</h2>
        <p className="mb-4 text-sm text-brand-700/80">Marca las condiciones que el paciente refiere.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PATHOLOGICAL_CONDITIONS.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-brand-100 px-3 py-2.5 text-sm transition has-[:checked]:border-magenta-500 has-[:checked]:bg-pink-50"
            >
              <input
                type="checkbox"
                name={`cond_${c.key}`}
                defaultChecked={!!conditions[c.key]}
                className="h-4 w-4 accent-magenta-500"
              />
              {c.label}
            </label>
          ))}
        </div>
        <div className="mt-4">{area("pathological_notes", "Detalles / otros padecimientos")}</div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-brand-900">Alergias y medicamentos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Alergias" hint="Sepáralas con comas. Ej. penicilina, látex, ibuprofeno">
            <textarea name="allergies" rows={2} defaultValue={history?.allergies.join(", ") ?? ""} className="field" />
          </Field>
          {area("current_medications", "Medicamentos actuales", 2, "Nombre, dosis y frecuencia")}
          {area("surgeries", "Cirugías y hospitalizaciones")}
          <Field label="Presión arterial">
            <input name="blood_pressure" defaultValue={history?.blood_pressure ?? ""} placeholder="120/80" className="field" />
          </Field>
          <YesNo name="pregnant" label="¿Embarazo?" value={history?.pregnant} />
          <YesNo name="breastfeeding" label="¿Lactancia?" value={history?.breastfeeding} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-brand-900">Otros antecedentes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {area("non_pathological_history", "Antecedentes no patológicos", 3, "Tabaquismo, alcohol, higiene oral, hábitos (bruxismo, onicofagia…)")}
          {area("family_history", "Antecedentes heredofamiliares", 3)}
          {area("dental_history", "Antecedentes odontológicos", 3, "Tratamientos previos, experiencias, última visita")}
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" disabled={pending} className="shadow-lg">
          {pending ? "Guardando…" : "Guardar historia clínica"}
        </Button>
      </div>
    </form>
  );
}
