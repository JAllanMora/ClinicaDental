"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { AppRole, PlanItemStatus, PlanStatus, Treatment, TreatmentPlan, TreatmentPlanItem } from "@/lib/database.types";
import { Logo } from "@/components/logo";
import { Alert, Badge, Button, Card, Field, cx } from "@/components/ui";
import { ITEM_STATUS, PLAN_ACTION, PLAN_NEXT, PLAN_STATUS, round2 } from "@/lib/finance";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { type ItemInput, deleteItem, saveItem, setItemStatus, setPlanStatus, updatePlan } from "../../actions";

type Item = TreatmentPlanItem & { completer: { full_name: string } | null };
type Cat = Pick<Treatment, "id" | "name" | "category" | "price">;

const EMPTY: ItemInput = { treatment_id: null, description: "", tooth: null, phase: 1, quantity: 1, unit_price: 0, discount_pct: 0 };

export function PlanEditor({
  patient,
  plan,
  items,
  treatments,
  dentists,
  role,
}: {
  patient: { id: string; name: string; phone: string | null };
  plan: TreatmentPlan;
  items: Item[];
  treatments: Cat[];
  dentists: { id: string; full_name: string; professional_id: string | null }[];
  role: AppRole;
}) {
  const [title, setTitle] = useState(plan.title);
  const [dentistId, setDentistId] = useState(plan.dentist_id ?? "");
  const [validUntil, setValidUntil] = useState(plan.valid_until ?? "");
  const [notes, setNotes] = useState(plan.notes ?? "");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const editable = plan.status === "borrador" || plan.status === "presentado";
  const canAdd = editable || plan.status === "aceptado";
  const clinician = role === "admin" || role === "dentist";
  const live = items.filter((i) => i.status !== "cancelado");
  const subtotal = round2(live.reduce((s, i) => s + i.quantity * Number(i.unit_price), 0));
  const total = round2(live.reduce((s, i) => s + Number(i.line_total), 0));
  const done = round2(live.filter((i) => i.status === "realizado").reduce((s, i) => s + Number(i.line_total), 0));
  const phases = [...new Set(items.map((i) => i.phase))].sort();
  const dentist = dentists.find((d) => d.id === plan.dentist_id);
  const folio = `P-${String(plan.folio).padStart(4, "0")}`;

  const run = (fn: () => Promise<{ error?: string; ok?: string } | undefined>) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (res?.error) setMsg({ tone: "error", text: res.error });
      else if (res?.ok) setMsg({ tone: "success", text: res.ok });
    });

  return (
    <div className="print-area space-y-6 print:bg-white print:p-8">
      {/* Encabezado sólo para impresión */}
      <div className="hidden print:block">
        <div className="flex items-start justify-between border-b border-brand-200 pb-4">
          <Logo />
          <div className="text-right text-sm">
            <p className="text-lg font-semibold text-brand-900">Presupuesto {folio}</p>
            <p>Fecha: {formatDate(plan.created_at)}</p>
            {plan.valid_until && <p>Vigencia: {formatDate(plan.valid_until)}</p>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <p>
            <span className="text-brand-700">Paciente:</span> <strong>{patient.name}</strong>
            {patient.phone && <span> · {patient.phone}</span>}
          </p>
          <p className="text-right">
            <span className="text-brand-700">Odontólogo:</span> <strong>{dentist?.full_name ?? "—"}</strong>
            {dentist?.professional_id && <span> · Céd. {dentist.professional_id}</span>}
          </p>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-brand-900">{plan.title}</h1>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link href={`/pacientes/${patient.id}/cuenta`} className="text-sm text-brand-600 hover:underline">
            ← Cuenta del paciente
          </Link>
          <span className="font-mono text-xs text-brand-700">{folio}</span>
          <Badge tone={PLAN_STATUS[plan.status].tone}>{PLAN_STATUS[plan.status].label}</Badge>
          {plan.accepted_at && <span className="text-xs text-brand-700/70">aceptado {formatDateTime(plan.accepted_at)}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(PLAN_NEXT[plan.status] ?? []).map((st: PlanStatus) => (
            <Button
              key={st}
              variant={st === "cancelado" || st === "rechazado" ? "danger" : st === "aceptado" ? "primary" : "secondary"}
              disabled={pending}
              onClick={() => run(() => setPlanStatus(patient.id, plan.id, st))}
            >
              {PLAN_ACTION[st]}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir
          </Button>
        </div>
      </div>

      {msg && (
        <div className="print:hidden">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}

      <Card className="print:hidden">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Título">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
          </Field>
          <Field label="Odontólogo responsable">
            <select value={dentistId} onChange={(e) => setDentistId(e.target.value)} className="field" disabled={role === "dentist"}>
              <option value="">Sin asignar</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vigente hasta">
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="field" />
          </Field>
          <Field label="Notas para el paciente" className="sm:col-span-3">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="field" />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(() =>
                updatePlan(patient.id, plan.id, {
                  title,
                  dentist_id: dentistId || null,
                  valid_until: validUntil || null,
                  notes: notes || null,
                }),
              )
            }
          >
            Guardar datos
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto print:border-0 print:p-0 print:shadow-none">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-brand-700/70">
            <tr>
              <th className="py-2 font-medium">Pieza</th>
              <th className="py-2 font-medium">Tratamiento</th>
              <th className="py-2 text-right font-medium">Cant.</th>
              <th className="py-2 text-right font-medium">Precio</th>
              <th className="py-2 text-right font-medium">Desc.</th>
              <th className="py-2 text-right font-medium">Importe</th>
              <th className="py-2 pl-3 font-medium print:hidden">Estado</th>
              <th className="print:hidden" />
            </tr>
          </thead>
          {phases.map((ph) => (
            <tbody key={ph} className="divide-y divide-brand-50 border-t border-brand-100">
              {phases.length > 1 && (
                <tr>
                  <td colSpan={8} className="pt-3 text-xs font-semibold uppercase tracking-wide text-magenta-500">
                    Fase {ph}
                  </td>
                </tr>
              )}
              {items
                .filter((i) => i.phase === ph)
                .map((i) => (
                  <ItemRow
                    key={`${i.id}-${i.updated_at}`}
                    item={i}
                    patientId={patient.id}
                    planId={plan.id}
                    editable={editable && i.status === "pendiente"}
                    planDraft={plan.status === "borrador"}
                    canComplete={clinician && plan.status === "aceptado"}
                    canRevert={role === "admin"}
                    run={run}
                    pending={pending}
                  />
                ))}
            </tbody>
          ))}
          <tfoot className="border-t-2 border-brand-100">
            <tr>
              <td colSpan={5} className="pt-3 text-right text-brand-700">
                Subtotal
              </td>
              <td className="pt-3 text-right">{money(subtotal)}</td>
            </tr>
            {subtotal !== total && (
              <tr>
                <td colSpan={5} className="text-right text-brand-700">
                  Descuentos
                </td>
                <td className="text-right text-emerald-700">-{money(round2(subtotal - total))}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="text-right font-semibold text-brand-900">
                Total
              </td>
              <td className="text-right text-lg font-semibold text-brand-900">{money(total)}</td>
            </tr>
            {done > 0 && (
              <tr className="print:hidden">
                <td colSpan={5} className="text-right text-xs text-brand-700/70">
                  Realizado
                </td>
                <td className="text-right text-xs text-brand-700/70">{money(done)}</td>
              </tr>
            )}
          </tfoot>
        </table>
        {!items.length && <p className="py-6 text-center text-sm text-brand-700/70">Agrega tratamientos con el formulario de abajo.</p>}
      </Card>

      {canAdd && <AddItem treatments={treatments} patientId={patient.id} planId={plan.id} run={run} pending={pending} />}

      <div className="hidden text-sm print:block">
        {plan.notes && <p className="mb-6 whitespace-pre-line">{plan.notes}</p>}
        <p className="text-xs text-brand-700">
          Precios en pesos mexicanos. El presupuesto puede cambiar si durante el tratamiento se encuentran condiciones no visibles en la
          valoración; cualquier cambio se comentará antes con el paciente.
        </p>
        <div className="mt-16 grid grid-cols-2 gap-16 text-center text-xs">
          <div className="border-t border-brand-900 pt-1">Firma del paciente o tutor</div>
          <div className="border-t border-brand-900 pt-1">{dentist?.full_name ?? "Odontólogo"}</div>
        </div>
      </div>
    </div>
  );
}

type Run = (fn: () => Promise<{ error?: string; ok?: string } | undefined>) => void;

function ItemRow({
  item,
  patientId,
  planId,
  editable,
  planDraft,
  canComplete,
  canRevert,
  run,
  pending,
}: {
  item: Item;
  patientId: string;
  planId: string;
  editable: boolean;
  planDraft: boolean;
  canComplete: boolean;
  canRevert: boolean;
  run: Run;
  pending: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState<ItemInput>({
    treatment_id: item.treatment_id,
    description: item.description,
    tooth: item.tooth,
    phase: item.phase,
    quantity: item.quantity,
    unit_price: Number(item.unit_price),
    discount_pct: Number(item.discount_pct),
  });
  const cancelled = item.status === "cancelado";
  const status = (s: PlanItemStatus) => run(() => setItemStatus(patientId, item.id, s));

  if (edit)
    return (
      <tr className="bg-brand-50/50">
        <td className="py-1.5">
          <input
            value={v.tooth ?? ""}
            onChange={(e) => setV({ ...v, tooth: e.target.value ? Number(e.target.value) : null })}
            inputMode="numeric"
            aria-label="Pieza"
            className="field w-14 px-2 py-1"
          />
        </td>
        <td className="py-1.5">
          <input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} aria-label="Descripción" className="field py-1" />
        </td>
        <td className="py-1.5">
          <input type="number" min={1} value={v.quantity} onChange={(e) => setV({ ...v, quantity: Number(e.target.value) })} aria-label="Cantidad" className="field ml-auto w-16 px-2 py-1 text-right" />
        </td>
        <td className="py-1.5">
          <input type="number" min={0} step="0.01" value={v.unit_price} onChange={(e) => setV({ ...v, unit_price: Number(e.target.value) })} aria-label="Precio" className="field ml-auto w-24 px-2 py-1 text-right" />
        </td>
        <td className="py-1.5">
          <input type="number" min={0} max={100} value={v.discount_pct} onChange={(e) => setV({ ...v, discount_pct: Number(e.target.value) })} aria-label="Descuento %" className="field ml-auto w-16 px-2 py-1 text-right" />
        </td>
        <td className="py-1.5 text-right">{money(round2(v.quantity * v.unit_price * (1 - v.discount_pct / 100)))}</td>
        <td colSpan={2} className="py-1.5 pl-3 text-right">
          <Button
            variant="primary"
            className="px-3 py-1 text-xs"
            disabled={pending}
            onClick={() => {
              setEdit(false);
              run(() => saveItem(patientId, planId, item.id, v));
            }}
          >
            Guardar
          </Button>
          <button type="button" onClick={() => setEdit(false)} className="ml-2 text-xs text-brand-700 hover:underline">
            Cancelar
          </button>
        </td>
      </tr>
    );

  return (
    <tr className={cx(cancelled && "text-brand-700/40 line-through print:hidden")}>
      <td className="py-2 font-mono text-xs">{item.tooth ?? "—"}</td>
      <td className="py-2">
        {item.description}
        {item.status === "realizado" && (
          <span className="block text-xs text-emerald-700 print:hidden">
            Realizado {item.completed_at && formatDate(item.completed_at)}
            {item.completer && ` · ${item.completer.full_name}`}
          </span>
        )}
      </td>
      <td className="py-2 text-right">{item.quantity}</td>
      <td className="py-2 text-right">{money(item.unit_price)}</td>
      <td className="py-2 text-right">{Number(item.discount_pct) ? `${Number(item.discount_pct)}%` : "—"}</td>
      <td className="py-2 text-right font-medium text-brand-900">{money(item.line_total)}</td>
      <td className="py-2 pl-3 print:hidden">
        <Badge tone={ITEM_STATUS[item.status].tone}>{ITEM_STATUS[item.status].label}</Badge>
      </td>
      <td className="whitespace-nowrap py-2 pl-2 text-right text-xs print:hidden">
        {item.status === "pendiente" && canComplete && (
          <button type="button" disabled={pending} onClick={() => status("realizado")} className="mr-2 font-medium text-emerald-700 hover:underline">
            Realizado
          </button>
        )}
        {editable && (
          <button type="button" onClick={() => setEdit(true)} className="mr-2 text-brand-700 hover:underline">
            Editar
          </button>
        )}
        {item.status === "pendiente" &&
          (planDraft ? (
            <button type="button" disabled={pending} onClick={() => run(() => deleteItem(patientId, item.id))} className="text-red-700 hover:underline">
              Quitar
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => status("cancelado")} className="text-red-700 hover:underline">
              Cancelar
            </button>
          ))}
        {item.status === "realizado" && canRevert && (
          <button type="button" disabled={pending} onClick={() => status("pendiente")} className="text-brand-700 hover:underline">
            Revertir
          </button>
        )}
        {cancelled && (
          <button type="button" disabled={pending} onClick={() => status("pendiente")} className="text-brand-700 hover:underline">
            Restaurar
          </button>
        )}
      </td>
    </tr>
  );
}

function AddItem({ treatments, patientId, planId, run, pending }: { treatments: Cat[]; patientId: string; planId: string; run: Run; pending: boolean }) {
  const [v, setV] = useState<ItemInput>(EMPTY);
  const categories = [...new Set(treatments.map((t) => t.category))];
  return (
    <Card className="print:hidden">
      <h2 className="mb-3 font-semibold text-brand-900">Agregar tratamiento</h2>
      <div className="grid gap-3 sm:grid-cols-[2fr_5rem_5rem_5rem_7rem_5rem_auto] sm:items-end">
        <Field label="Del arancel">
          <select
            value={v.treatment_id ?? ""}
            onChange={(e) => {
              const t = treatments.find((x) => x.id === e.target.value);
              setV({ ...v, treatment_id: t?.id ?? null, description: t?.name ?? v.description, unit_price: t ? Number(t.price) : v.unit_price });
            }}
            className="field"
          >
            <option value="">— Otro (escribir abajo) —</option>
            {categories.map((c) => (
              <optgroup key={c} label={c}>
                {treatments
                  .filter((t) => t.category === c)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {money(t.price)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Pieza">
          <input value={v.tooth ?? ""} onChange={(e) => setV({ ...v, tooth: e.target.value ? Number(e.target.value) : null })} inputMode="numeric" placeholder="16" className="field" />
        </Field>
        <Field label="Fase">
          <input type="number" min={1} max={9} value={v.phase} onChange={(e) => setV({ ...v, phase: Number(e.target.value) })} className="field" />
        </Field>
        <Field label="Cant.">
          <input type="number" min={1} value={v.quantity} onChange={(e) => setV({ ...v, quantity: Number(e.target.value) })} className="field" />
        </Field>
        <Field label="Precio">
          <input type="number" min={0} step="0.01" value={v.unit_price} onChange={(e) => setV({ ...v, unit_price: Number(e.target.value) })} className="field" />
        </Field>
        <Field label="Desc. %">
          <input type="number" min={0} max={100} value={v.discount_pct} onChange={(e) => setV({ ...v, discount_pct: Number(e.target.value) })} className="field" />
        </Field>
        <Button
          disabled={pending || v.description.trim().length < 2}
          onClick={() => {
            const input = v;
            setV({ ...EMPTY, phase: v.phase });
            run(() => saveItem(patientId, planId, null, input));
          }}
        >
          Agregar
        </Button>
        <Field label="Descripción" className="sm:col-span-7">
          <input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Se llena al elegir del arancel" className="field" />
        </Field>
      </div>
    </Card>
  );
}
