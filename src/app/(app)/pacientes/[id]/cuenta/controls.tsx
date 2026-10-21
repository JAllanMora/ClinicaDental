"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { METHODS } from "@/lib/finance";
import { addPayment, createPlan, voidPayment } from "./actions";

export function NewPlanButtons({ patientId, canImport }: { patientId: string; canImport: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (fromOdontogram: boolean) =>
    start(async () => {
      const res = await createPlan(patientId, fromOdontogram);
      if (res?.error) setError(res.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canImport && (
        <Button variant="secondary" disabled={pending} onClick={() => go(true)} title="Usa los hallazgos de la capa 'Propuesto' del odontograma">
          Desde odontograma
        </Button>
      )}
      <Button disabled={pending} onClick={() => go(false)}>
        {pending ? "Creando…" : "+ Nuevo presupuesto"}
      </Button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </div>
  );
}

export function PaymentForm({
  patientId,
  branchId,
  plans,
  suggested,
}: {
  patientId: string;
  branchId: string;
  plans: { id: string; label: string }[];
  suggested: number;
}) {
  const [state, action, pending] = useActionState(addPayment.bind(null, patientId, branchId), {});
  const v = state.values;
  return (
    <form key={state.ok ?? JSON.stringify(v ?? {})} action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto">
          <input name="amount" type="number" min="0.01" step="0.01" required defaultValue={v?.amount ?? (suggested > 0 ? suggested.toFixed(2) : "")} className="field" />
        </Field>
        <Field label="Forma de pago">
          <select name="method" defaultValue={v?.method ?? "efectivo"} className="field">
            {METHODS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {plans.length > 0 && (
        <Field label="Abonar a">
          <select name="plan_id" defaultValue={v?.plan_id ?? plans[0].id} className="field">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="">Sin presupuesto (pago general)</option>
          </select>
        </Field>
      )}
      <Field label="Referencia" hint="Últimos 4 dígitos, folio de transferencia…">
        <input name="reference" defaultValue={v?.reference} className="field" />
      </Field>
      <Field label="Notas">
        <input name="notes" defaultValue={v?.notes} className="field" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registrando…" : "Registrar pago"}
      </Button>
    </form>
  );
}

export function VoidPaymentButton({ patientId, paymentId }: { patientId: string; paymentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt("Motivo de la cancelación del pago:");
          if (reason === null) return;
          start(async () => {
            const res = await voidPayment(patientId, paymentId, reason);
            setError(res.error ?? null);
          });
        }}
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
      >
        Cancelar
      </button>
      {error && <span className="max-w-48 text-right text-[11px] text-red-700">{error}</span>}
    </span>
  );
}
