"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LabOrder, LabStatus } from "@/lib/database.types";
import { Alert, Button, Field } from "@/components/ui";
import { LAB_ACTION, LAB_NEXT } from "@/lib/lab";
import { type PatientLite, PatientPicker } from "../agenda/agenda-board";
import { createOrder, saveLab, setOrderStatus, updateOrder } from "./actions";

type Opt = { id: string; label: string };

export function PickPatient() {
  const router = useRouter();
  const [p, setP] = useState<PatientLite | null>(null);
  return (
    <PatientPicker
      value={p}
      onChange={(v) => {
        setP(v);
        if (v) router.push(`/laboratorio/nueva?paciente=${v.id}`);
      }}
    />
  );
}

export function OrderForm({
  patientId,
  order,
  dentists,
  labs,
  planItems,
  lockDentist,
  defaultDentist,
}: {
  patientId?: string;
  order?: LabOrder;
  dentists: Opt[];
  labs: Opt[];
  planItems: Opt[];
  lockDentist: boolean;
  defaultDentist: string;
}) {
  const action = order ? updateOrder.bind(null, order.id) : createOrder.bind(null, patientId!);
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: keyof LabOrder) => state.values?.[k] ?? (order?.[k] as string | number | null | undefined)?.toString() ?? "";
  return (
    <form key={state.values ? JSON.stringify(state.values) : (order?.updated_at ?? "nueva")} action={formAction} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de trabajo *">
          <input name="work_type" required defaultValue={v("work_type")} placeholder="Corona de zirconia, guarda oclusal…" className="field" />
        </Field>
        <Field label="Laboratorio">
          <select name="lab_id" defaultValue={v("lab_id")} className="field">
            <option value="">—</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Odontólogo">
          <select name="dentist_id" defaultValue={v("dentist_id") || defaultDentist} disabled={lockDentist} className="field">
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          {lockDentist && <input type="hidden" name="dentist_id" value={v("dentist_id") || defaultDentist} />}
        </Field>
        <Field label="Tratamiento del presupuesto" hint="Su costo de laboratorio se descuenta de la comisión.">
          <select name="plan_item_id" defaultValue={v("plan_item_id")} className="field">
            <option value="">Sin vincular</option>
            {planItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Piezas">
          <input name="teeth" defaultValue={v("teeth")} placeholder="16, 17" className="field" />
        </Field>
        <Field label="Color (guía VITA)">
          <input name="shade" defaultValue={v("shade")} placeholder="A2" className="field" />
        </Field>
        <Field label="Fecha comprometida">
          <input name="due_date" type="date" defaultValue={v("due_date")} className="field" />
        </Field>
        <Field label="Costo del laboratorio">
          <input name="cost" type="number" min={0} step="0.01" defaultValue={v("cost")} className="field" />
        </Field>
      </div>
      <Field label="Indicaciones para el laboratorio">
        <textarea name="instructions" rows={3} defaultValue={v("instructions")} className="field" />
      </Field>
      <Field label="Notas internas">
        <textarea name="notes" rows={2} defaultValue={v("notes")} className="field" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : order ? "Guardar cambios" : "Crear orden"}
        </Button>
      </div>
    </form>
  );
}

export function StatusButtons({ id, status }: { id: string; status: LabStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {(LAB_NEXT[status] ?? []).map((st) => (
        <Button
          key={st}
          variant={st === "cancelado" || st === "ajuste" ? "danger" : "primary"}
          disabled={pending}
          onClick={() => start(async () => setError((await setOrderStatus(id, st)).error ?? null))}
        >
          {LAB_ACTION[st]}
        </Button>
      ))}
      {error && <span className="self-center text-sm text-red-700">{error}</span>}
    </div>
  );
}

export function LabForm() {
  const [state, action, pending] = useActionState(saveLab.bind(null, null), {});
  return (
    <form key={state.ok} action={action} className="space-y-2">
      {state.error && <Alert>{state.error}</Alert>}
      <input name="name" required placeholder="Nombre del laboratorio" className="field" />
      <div className="grid grid-cols-2 gap-2">
        <input name="contact" placeholder="Contacto" className="field" />
        <input name="phone" placeholder="Teléfono" className="field" />
      </div>
      <input name="email" type="email" placeholder="Correo" className="field" />
      <Button type="submit" variant="secondary" disabled={pending} className="w-full">
        Agregar laboratorio
      </Button>
    </form>
  );
}
