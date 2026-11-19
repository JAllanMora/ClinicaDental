"use client";

import { useState, useTransition } from "react";
import type { PeriodontalExam, PerioData, PerioSite, PerioTooth } from "@/lib/database.types";
import { Alert, Button, Card, Field, cx } from "@/components/ui";
import { type Site, pdTone, perioRows, perioSummary, sitesInOrder } from "@/lib/perio";
import { saveExam } from "./actions";

type NumKey = "pd" | "rec";
type FlagKey = "bop" | "sup";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

/** Avanza al siguiente campo de la misma fila al teclear un dígito (captura rápida en sillón). */
function focusNext(el: HTMLInputElement) {
  const row = el.dataset.row;
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-row="${row}"]`));
  const i = inputs.indexOf(el);
  inputs[i + 1]?.focus();
  inputs[i + 1]?.select();
}

export function PerioChart({
  patientId,
  exam,
  previous,
}: {
  patientId: string;
  exam: PeriodontalExam | null;
  previous: PeriodontalExam | null;
}) {
  const [date, setDate] = useState(exam?.exam_date ?? today());
  const [dentition, setDentition] = useState<"permanente" | "temporal">(exam?.dentition ?? previous?.dentition ?? "permanente");
  const [notes, setNotes] = useState(exam?.notes ?? "");
  const [data, setData] = useState<PerioData>(() => {
    if (exam) return exam.data;
    // Nueva evaluación: conservar piezas ausentes / implantes de la anterior.
    const base: PerioData = {};
    for (const [t, v] of Object.entries(previous?.data ?? {})) {
      if (v.missing || v.implant) base[t] = { missing: v.missing, implant: v.implant };
    }
    return base;
  });
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const tooth = (t: number): PerioTooth => data[String(t)] ?? {};
  const update = (t: number, fn: (prev: PerioTooth) => PerioTooth) =>
    setData((d) => ({ ...d, [String(t)]: fn(d[String(t)] ?? {}) }));
  const updateSite = (t: number, s: Site, patch: Partial<PerioSite>) =>
    update(t, (prev) => ({ ...prev, sites: { ...prev.sites, [s]: { ...prev.sites?.[s], ...patch } } }));

  const rows = perioRows(dentition);
  const summary = perioSummary(data);

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await saveExam(patientId, exam?.id ?? null, { exam_date: date, dentition, notes: notes || null, data });
      if (res?.error) setMsg({ tone: "error", text: res.error });
      else setMsg({ tone: "success", text: "Periodontograma guardado." });
    });

  const numberRow = (arch: number[], side: "V" | "L", key: NumKey, label: string, rowId: string) => (
    <tr>
      <th className="sticky left-0 z-10 whitespace-nowrap bg-white pr-2 text-left text-[11px] font-medium text-brand-700">{label}</th>
      {arch.map((t) => {
        const off = tooth(t).missing;
        return (
          <td key={t} className={cx("border-l border-brand-50 px-px", off && "bg-gray-50")}>
            <div className="flex justify-center">
              {sitesInOrder(t, side).map((s) => {
                const v = tooth(t).sites?.[s]?.[key];
                return (
                  <input
                    key={s}
                    data-row={rowId}
                    disabled={off}
                    inputMode="numeric"
                    aria-label={`${t} ${s} ${label}`}
                    value={v ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9-]/g, "").slice(0, 3);
                      const n = raw === "" || raw === "-" ? null : Number(raw);
                      updateSite(t, s, { [key]: n });
                      if (/^\d$/.test(raw) && raw !== "1") focusNext(e.target);
                    }}
                    onFocus={(e) => e.target.select()}
                    className={cx(
                      "h-6 w-4 rounded border border-transparent text-center text-xs tabular-nums outline-none focus:border-brand-500 focus:bg-white disabled:opacity-0",
                      key === "pd" ? pdTone(v) || "bg-brand-100/70" : "bg-brand-50 text-brand-700",
                    )}
                  />
                );
              })}
            </div>
          </td>
        );
      })}
    </tr>
  );

  const flagRow = (arch: number[], side: "V" | "L", key: FlagKey, label: string, color: string) => (
    <tr>
      <th className="sticky left-0 z-10 whitespace-nowrap bg-white pr-2 text-left text-[11px] font-medium text-brand-700">{label}</th>
      {arch.map((t) => (
        <td key={t} className={cx("border-l border-brand-50 px-px", tooth(t).missing && "bg-gray-50")}>
          {!tooth(t).missing && (
            <div className="flex justify-center gap-[2px] py-0.5">
              {sitesInOrder(t, side).map((s) => {
                const on = !!tooth(t).sites?.[s]?.[key];
                return (
                  <button
                    key={s}
                    type="button"
                    aria-label={`${t} ${s} ${label}`}
                    aria-pressed={on}
                    onClick={() => updateSite(t, s, { [key]: !on })}
                    className="grid h-[0.9rem] w-[0.9rem] place-items-center rounded-full border border-brand-200 transition"
                    style={on ? { background: color, borderColor: color } : undefined}
                  />
                );
              })}
            </div>
          )}
        </td>
      ))}
    </tr>
  );

  const toothRow = (arch: number[], key: "mobility" | "furcation", label: string, max: number) => (
    <tr>
      <th className="sticky left-0 z-10 whitespace-nowrap bg-white pr-2 text-left text-[11px] font-medium text-brand-700">{label}</th>
      {arch.map((t) => (
        <td key={t} className={cx("border-l border-brand-50 px-px text-center", tooth(t).missing && "bg-gray-50")}>
          {!tooth(t).missing && (
            <select
              aria-label={`${t} ${label}`}
              value={tooth(t)[key] ?? ""}
              onChange={(e) => update(t, (p) => ({ ...p, [key]: e.target.value === "" ? null : Number(e.target.value) }))}
              className="h-6 w-11 rounded border-0 px-0 bg-brand-50/40 text-center text-xs"
            >
              <option value="">–</option>
              {Array.from({ length: max + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {key === "furcation" ? ["0", "I", "II", "III"][i] : i}
                </option>
              ))}
            </select>
          )}
        </td>
      ))}
    </tr>
  );

  const header = (arch: number[]) => (
    <tr>
      <th className="sticky left-0 z-10 bg-white" />
      {arch.map((t) => {
        const st = tooth(t);
        const state = st.missing ? "ausente" : st.implant ? "implante" : "presente";
        return (
          <th key={t} className="border-l border-brand-50 px-px pb-1">
            <button
              type="button"
              title="Clic: presente → ausente → implante"
              onClick={() =>
                update(t, (p) =>
                  state === "presente"
                    ? { ...p, missing: true, implant: false }
                    : state === "ausente"
                      ? { ...p, missing: false, implant: true }
                      : { ...p, missing: false, implant: false },
                )
              }
              className={cx(
                "w-full rounded px-1 py-0.5 text-xs font-semibold tabular-nums",
                state === "ausente" && "bg-gray-200 text-gray-500 line-through",
                state === "implante" && "bg-sky-100 text-sky-800",
                state === "presente" && "text-brand-900 hover:bg-brand-50",
              )}
            >
              {t}
              {state === "implante" && <span className="block text-[9px] font-medium">IMP</span>}
            </button>
          </th>
        );
      })}
    </tr>
  );

  const arch = (teeth: number[], upper: boolean) => {
    const inner = upper ? "Palatino" : "Lingual";
    return (
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-y-0.5">
          <thead>{header(teeth)}</thead>
          <tbody>
            {toothRow(teeth, "mobility", "Movilidad", 3)}
            {toothRow(teeth, "furcation", "Furcación", 3)}
            <tr>
              <td colSpan={teeth.length + 1} className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-magenta-500">
                Vestibular
              </td>
            </tr>
            {numberRow(teeth, "V", "rec", "Recesión", `${upper}-V-rec`)}
            {numberRow(teeth, "V", "pd", "Sondaje", `${upper}-V-pd`)}
            {flagRow(teeth, "V", "bop", "Sangrado", "#dc2626")}
            {flagRow(teeth, "V", "sup", "Supuración", "#d97706")}
            <tr>
              <td colSpan={teeth.length + 1} className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-magenta-500">
                {inner}
              </td>
            </tr>
            {numberRow(teeth, "L", "rec", "Recesión", `${upper}-L-rec`)}
            {numberRow(teeth, "L", "pd", "Sondaje", `${upper}-L-pd`)}
            {flagRow(teeth, "L", "bop", "Sangrado", "#dc2626")}
            {flagRow(teeth, "L", "sup", "Supuración", "#d97706")}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sangrado al sondaje" value={`${summary.bopPct}%`} tone={summary.bopPct >= 30 ? "text-red-600" : summary.bopPct >= 10 ? "text-amber-600" : "text-emerald-600"} />
        <Stat label="Prof. sondaje media" value={`${summary.meanPd} mm`} />
        <Stat label="Nivel de inserción medio" value={`${summary.meanCal} mm`} hint="Sondaje + recesión" />
        <Stat label="Sitios ≥ 4 mm / ≥ 6 mm" value={`${summary.deep4} / ${summary.deep6}`} tone={summary.deep6 ? "text-red-600" : summary.deep4 ? "text-amber-600" : undefined} />
      </div>

      <Card className="space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Fecha">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          </Field>
          <Field label="Dentición">
            <select value={dentition} onChange={(e) => setDentition(e.target.value as "permanente" | "temporal")} className="field">
              <option value="permanente">Permanente</option>
              <option value="temporal">Temporal</option>
            </select>
          </Field>
          <p className="max-w-sm text-xs text-brand-700/70">
            Captura rápida: al teclear un dígito pasa al siguiente sitio. Recesión negativa = margen por encima de la UCA.
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-brand-900">Arcada superior</h3>
          {arch(rows[0], true)}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-brand-900">Arcada inferior</h3>
          {arch(rows[1], false)}
        </div>
        <Field label="Observaciones / diagnóstico periodontal">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="field" />
        </Field>
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending}>
            {pending ? "Guardando…" : exam ? "Guardar cambios" : "Guardar evaluación"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-brand-700/80">{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold text-brand-900", tone)}>{value}</p>
      {hint && <p className="text-[11px] text-brand-700/60">{hint}</p>}
    </Card>
  );
}
