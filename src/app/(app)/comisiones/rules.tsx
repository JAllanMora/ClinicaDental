"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field } from "@/components/ui";
import type { CommissionRate } from "@/lib/database.types";
import { removeCommissionRule, saveCommissionRule, setDentistRate } from "./actions";

type Opt = { id: string; name: string };

function DentistRate({ dentist, pct }: { dentist: Opt; pct: number | null }) {
  const [value, setValue] = useState(pct === null ? "" : String(pct));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="min-w-40 flex-1 text-sm text-brand-900">{dentist.name}</span>
      <label className="flex items-center gap-1 text-sm text-brand-700">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Comisión de ${dentist.name}`}
          placeholder="0"
          className="field w-24"
        />
        %
      </label>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setDentistRate(dentist.id, Number(value || 0));
            setMsg(r.error ?? r.ok ?? null);
          })
        }
      >
        {pending ? "…" : "Guardar"}
      </Button>
      {msg && <span className="text-xs text-brand-700">{msg}</span>}
    </li>
  );
}

function RemoveRule({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await removeCommissionRule(id)))} className="text-xs text-red-700 hover:underline">
      {pending ? "Quitando…" : "Quitar"}
    </button>
  );
}

export function CommissionRules({ dentists, treatments, rates }: { dentists: Opt[]; treatments: Opt[]; rates: CommissionRate[] }) {
  const [state, action, pending] = useActionState(saveCommissionRule, {});
  const name = (list: Opt[], id: string | null) => (id ? (list.find((x) => x.id === id)?.name ?? "—") : null);
  const special = rates
    .filter((r) => r.treatment_id)
    .map((r) => ({ ...r, dentist: name(dentists, r.dentist_id) ?? "Todos los odontólogos", treatment: name(treatments, r.treatment_id)! }))
    .sort((a, b) => a.treatment.localeCompare(b.treatment, "es") || a.dentist.localeCompare(b.dentist, "es"));

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-brand-900">Comisión general por odontólogo</h3>
        <ul className="divide-y divide-brand-50">
          {dentists.map((d) => (
            <DentistRate key={d.id} dentist={d} pct={rates.find((r) => r.dentist_id === d.id && !r.treatment_id)?.pct ?? null} />
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-brand-900">Reglas por tratamiento</h3>
        {special.length ? (
          <ul className="mb-4 divide-y divide-brand-50">
            {special.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="flex-1 text-brand-900">
                  {r.treatment} <span className="text-brand-700/70">· {r.dentist}</span>
                </span>
                <span className="font-medium">{Number(r.pct)}%</span>
                <RemoveRule id={r.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-brand-700/70">Sin reglas especiales: se usa la comisión general de cada odontólogo.</p>
        )}
        <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem] sm:items-end">
          <Field label="Tratamiento">
            <select name="treatment_id" required className="field" defaultValue="">
              <option value="" disabled>
                Elige…
              </option>
              {treatments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Odontólogo">
            <select name="dentist_id" className="field" defaultValue="">
              <option value="">Todos</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="%">
            <input name="pct" type="number" min={0} max={100} step={0.5} required className="field" />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Guardando…" : "Agregar regla"}
            </Button>
            {state.error && <span className="text-sm text-red-700">{state.error}</span>}
            {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
