"use client";

import { useActionState } from "react";
import type { Branch, Patient, Profile } from "@/lib/database.types";
import { Alert, Button, ButtonLink, Card, Field } from "@/components/ui";
import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  patient?: Patient;
  dentists: Pick<Profile, "id" | "full_name">[];
  branches: Pick<Branch, "id" | "name">[];
  cancelHref: string;
};

export function PatientForm({ action, patient, dentists, branches, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const value = (k: keyof Patient) => state.values?.[k] ?? (patient?.[k] as string | null) ?? "";

  const input = (name: keyof Patient, label: string, opts: { type?: string; required?: boolean; className?: string; placeholder?: string } = {}) => (
    <Field label={label + (opts.required ? " *" : "")} className={opts.className} hint={err(name)}>
      <input
        name={name}
        type={opts.type ?? "text"}
        required={opts.required}
        placeholder={opts.placeholder}
        defaultValue={value(name)}
        className={`field ${err(name) ? "border-red-400" : ""}`}
      />
    </Field>
  );

  return (
    // La key remonta el formulario tras un error: React no restaura los <select> al reiniciarlo.
    <form key={state.values ? JSON.stringify(state.values) : "inicial"} action={formAction} className="space-y-6">
      {state.error && <Alert>{state.error}</Alert>}

      <Card>
        <h2 className="mb-4 font-semibold text-brand-900">Datos personales</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {input("first_name", "Nombre(s)", { required: true })}
          {input("last_name", "Apellido paterno", { required: true })}
          {input("second_last_name", "Apellido materno")}
          {input("birth_date", "Fecha de nacimiento", { type: "date" })}
          <Field label="Sexo">
            <select name="sex" defaultValue={value("sex")} className="field">
              <option value="">—</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="X">Otro / prefiere no decir</option>
            </select>
          </Field>
          {input("curp", "CURP", { placeholder: "18 caracteres" })}
          {input("occupation", "Ocupación")}
          {input("guardian_name", "Tutor (si es menor de edad)", { className: "sm:col-span-2" })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-brand-900">Contacto</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {input("phone", "Teléfono / WhatsApp", { type: "tel" })}
          {input("email", "Correo electrónico", { type: "email" })}
          {input("referred_by", "¿Cómo nos conoció?")}
          {input("address", "Domicilio", { className: "sm:col-span-3" })}
          {input("emergency_contact_name", "Contacto de emergencia")}
          {input("emergency_contact_phone", "Teléfono de emergencia", { type: "tel" })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-brand-900">Atención</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Odontólogo de cabecera" hint="Tendrá acceso a su expediente clínico.">
            <select name="primary_dentist_id" defaultValue={value("primary_dentist_id")} className="field">
              <option value="">Sin asignar</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sucursal">
            <select name="branch_id" defaultValue={state.values?.branch_id ?? patient?.branch_id ?? branches[0]?.id ?? ""} className="field">
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notas administrativas" className="sm:col-span-3" hint="No escribas aquí información clínica.">
            <textarea name="notes" rows={2} defaultValue={value("notes")} className="field" />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancelar
        </ButtonLink>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar paciente"}
        </Button>
      </div>
    </form>
  );
}
