"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field } from "@/components/ui";
import { EXPENSE_CATEGORIES } from "@/lib/database.types";
import { METHODS } from "@/lib/finance";
import { addExpense, applyRecurring, saveRecurring, toggleRecurring, voidExpense } from "./actions";

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORIES);

function Msg({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) return <span className="text-sm text-red-700">{state.error}</span>;
  if (state.ok) return <span className="text-sm text-emerald-700">{state.ok}</span>;
  return null;
}

export function ExpenseForm({ defaultDay }: { defaultDay: string }) {
  const [state, action, pending] = useActionState(addExpense, {});
  return (
    <form key={state.ok} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_1fr_1.4fr_8rem_10rem]">
      <Field label="Fecha">
        <input name="spent_on" type="date" required defaultValue={defaultDay} className="field" />
      </Field>
      <Field label="Categoría">
        <select name="category" required defaultValue="servicios" className="field">
          {CATEGORY_OPTIONS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Concepto">
        <input name="concept" required placeholder="Recibo de luz de octubre" className="field" />
      </Field>
      <Field label="Monto">
        <input name="amount" type="number" min={0.01} step="0.01" required className="field" />
      </Field>
      <Field label="Pagado con">
        <select name="method" defaultValue="transferencia" className="field">
          {METHODS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Proveedor">
        <input name="supplier" placeholder="CFE, Telmex…" className="field" />
      </Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Notas">
          <input name="notes" className="field" />
        </Field>
      </div>
      <div className="flex items-end gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Registrar gasto"}
        </Button>
      </div>
      <div className="sm:col-span-2 lg:col-span-5">
        <Msg state={state} />
      </div>
    </form>
  );
}

export function VoidExpense({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt("Motivo de la anulación:");
          if (reason !== null) start(async () => setError((await voidExpense(id, reason)).error ?? null));
        }}
        className="text-xs text-red-700 hover:underline"
      >
        Anular
      </button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function RecurringForm() {
  const [state, action, pending] = useActionState(saveRecurring, {});
  return (
    <form key={state.ok} action={action} className="grid gap-3 sm:grid-cols-2 sm:items-end">
      <Field label="Categoría">
        <select name="category" defaultValue="renta" className="field">
          {CATEGORY_OPTIONS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Concepto">
        <input name="concept" required placeholder="Renta del local" className="field" />
      </Field>
      <Field label="Monto">
        <input name="amount" type="number" min={0.01} step="0.01" required className="field" />
      </Field>
      <Field label="Día">
        <input name="day_of_month" type="number" min={1} max={28} defaultValue={1} required className="field" />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "…" : "+ Agregar"}
      </Button>
      <div className="sm:col-span-2">
        <Msg state={state} />
      </div>
    </form>
  );
}

export function RecurringToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-1.5 text-xs text-brand-700">
      <input type="checkbox" checked={active} disabled={pending} onChange={(e) => start(async () => void (await toggleRecurring(id, e.target.checked)))} />
      Activo
    </label>
  );
}

export function ApplyRecurring({ month, pending: missing }: { month: string; pending: number }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={busy || !missing}
        onClick={() =>
          start(async () => {
            const r = await applyRecurring(month);
            setMsg(r.error ?? r.ok ?? null);
          })
        }
      >
        {busy ? "Registrando…" : missing ? `Registrar ${missing} gasto${missing === 1 ? "" : "s"} fijo${missing === 1 ? "" : "s"} de este mes` : "Gastos fijos del mes registrados"}
      </Button>
      {msg && <span className="text-sm text-brand-700">{msg}</span>}
    </div>
  );
}
