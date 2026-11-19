"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Card, Field } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { RECALL_MONTHS } from "@/lib/recalls";
import type { NoteState } from "./actions";

type TypeOption = { id: string; name: string };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

export function NoteForm({
  action,
  amends,
  onDone,
  types = [],
}: {
  action: (prev: NoteState, formData: FormData) => Promise<NoteState>;
  amends?: { id: string; label: string };
  onDone?: () => void;
  types?: TypeOption[];
}) {
  const [state, formAction, pending] = useActionState(async (prev: NoteState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.saved) onDone?.();
    return res;
  }, {});

  return (
    <Card>
      <h2 className="mb-1 font-semibold text-brand-900">{amends ? "Adenda" : "Nueva nota de evolución"}</h2>
      <p className="mb-4 text-xs text-brand-700/70">
        {amends
          ? `Corrige o complementa la nota: ${amends.label}. La nota original se conserva.`
          : "Las notas quedan firmadas a tu nombre y no se pueden editar; para corregir, agrega una adenda."}
      </p>
      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.saved && !amends && !state.error && (
          <Alert tone="success">
            Nota guardada.{state.recall && ` El bot le recordará regresar el ${formatDate(state.recall)}.`}
          </Alert>
        )}
        {amends && <input type="hidden" name="amends_note_id" value={amends.id} />}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fecha">
            <input type="date" name="note_date" defaultValue={today()} className="field" />
          </Field>
          <Field label="Pieza(s)" hint="FDI, separadas por coma">
            <input name="teeth" placeholder="16, 17" className="field" />
          </Field>
          <Field label="Procedimiento *">
            <input name="procedure" required placeholder="Resina clase II" className="field" />
          </Field>
          <Field label="Materiales">
            <input name="materials" placeholder="Resina A2, adhesivo…" className="field" />
          </Field>
          <Field label="Anestesia">
            <input name="anesthesia" placeholder="Lidocaína 2% c/epi, 1 cartucho" className="field" />
          </Field>
          <Field label="Próxima cita / indicaciones">
            <input name="next_steps" className="field" />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea name="description" rows={3} className="field" />
        </Field>
        {!amends && <RecallFields key={state.saved ?? 0} types={types} />}
        <div className="flex justify-end gap-2">
          {onDone && amends && (
            <Button type="button" variant="secondary" onClick={onDone}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : amends ? "Guardar adenda" : "Firmar y guardar nota"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AmendButton({
  action,
  id,
  label,
}: {
  action: (prev: NoteState, formData: FormData) => Promise<NoteState>;
  id: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-600 hover:underline">
        Agregar adenda
      </button>
    );
  return (
    <div className="mt-3">
      <NoteForm action={action} amends={{ id, label }} onDone={() => setOpen(false)} />
    </div>
  );
}

/** «Recordarle al paciente regresar»: el bot le escribe cuando se cumpla el plazo y le ofrece agendar. */
function RecallFields({ types }: { types: TypeOption[] }) {
  const [on, setOn] = useState(false);
  const [months, setMonths] = useState("6");
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3" data-testid="recall-fields">
      <label className="flex items-center gap-2 text-sm font-medium text-brand-900">
        <input type="checkbox" name="recall" checked={on} onChange={(e) => setOn(e.target.checked)} />
        Recordarle al paciente regresar (le escribe el bot por WhatsApp y le ofrece agendar)
      </label>
      {on && (
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_1fr_2fr_1.5fr]">
          <Field label="¿En cuánto tiempo?">
            <select name="recall_months" value={months} onChange={(e) => setMonths(e.target.value)} className="field">
              {RECALL_MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m === 12 ? "1 año" : `${m} ${m === 1 ? "mes" : "meses"}`}
                </option>
              ))}
              <option value="custom">Otra fecha…</option>
            </select>
          </Field>
          <Field label="Fecha">
            <input type="date" name="recall_date" disabled={months !== "custom"} required={months === "custom"} className="field" />
          </Field>
          <Field label="Motivo" hint="Lo lee el paciente. Si lo dejas vacío, se usa el procedimiento.">
            <input name="recall_reason" maxLength={200} placeholder="Limpieza de control" className="field" />
          </Field>
          <Field label="Tipo de cita">
            <select name="recall_type_id" defaultValue="" className="field">
              <option value="">El paciente elige</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}
