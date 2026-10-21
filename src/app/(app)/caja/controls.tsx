"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { METHODS, round2 } from "@/lib/finance";
import { money } from "@/lib/format";
import { addExpense, closeDay, voidExpense } from "./actions";

export function ExpenseForm({ branchId }: { branchId: string }) {
  const [state, action, pending] = useActionState(addExpense.bind(null, branchId), {});
  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end">
        <Field label="Concepto">
          <input name="concept" required placeholder="Ej. garrafones, mensajería" className="field" />
        </Field>
        <Field label="Monto">
          <input name="amount" type="number" min="0.01" step="0.01" required className="field" />
        </Field>
        <Field label="Pagado con">
          <select name="method" defaultValue="efectivo" className="field">
            {METHODS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          Registrar egreso
        </Button>
      </div>
    </form>
  );
}

export function VoidExpenseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt("Motivo de la cancelación:");
          if (reason !== null) start(async () => setError((await voidExpense(id, reason)).error ?? null));
        }}
        className="text-xs text-red-700 hover:underline"
      >
        Cancelar
      </button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function CloseForm({ branchId, day, cashIn, cashOut }: { branchId: string; day: string; cashIn: number; cashOut: number }) {
  const [state, action, pending] = useActionState(closeDay.bind(null, branchId, day), {});
  const [opening, setOpening] = useState(0);
  const [counted, setCounted] = useState("");
  const expected = round2(opening + cashIn - cashOut);
  const diff = counted === "" ? null : round2(Number(counted) - expected);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Al cerrar el corte ya no se podrán registrar ni cancelar pagos de este día. ¿Continuar?")) e.preventDefault();
      }}
      className="space-y-3"
    >
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Fondo inicial de caja">
        <input name="opening_cash" type="number" min={0} step="0.01" value={opening} onChange={(e) => setOpening(Number(e.target.value))} className="field" />
      </Field>
      <dl className="space-y-1 rounded-lg bg-brand-50 p-3 text-sm">
        <div className="flex justify-between">
          <dt>+ Cobrado en efectivo</dt>
          <dd>{money(cashIn)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>− Egresos en efectivo</dt>
          <dd>{money(cashOut)}</dd>
        </div>
        <div className="flex justify-between border-t border-brand-200 pt-1 font-semibold text-brand-900">
          <dt>Debe haber en caja</dt>
          <dd>{money(expected)}</dd>
        </div>
      </dl>
      <Field label="Efectivo contado">
        <input name="counted_cash" type="number" min={0} step="0.01" required value={counted} onChange={(e) => setCounted(e.target.value)} className="field" />
      </Field>
      {diff !== null && (
        <p className={`text-sm font-medium ${diff === 0 ? "text-emerald-700" : "text-red-700"}`}>
          {diff === 0 ? "La caja cuadra." : diff > 0 ? `Sobrante de ${money(diff)}` : `Faltante de ${money(-diff)}`}
        </p>
      )}
      <Field label="Observaciones">
        <textarea name="notes" rows={2} className="field" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Cerrando…" : "Cerrar corte del día"}
      </Button>
    </form>
  );
}
