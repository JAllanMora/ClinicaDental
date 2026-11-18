"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { addDayOff, removeDayOff, saveWorkingHours } from "./actions";

type Shift = { weekday: number; starts: string; ends: string };
type Msg = { error?: string; ok?: string } | null;

// Semana empezando en lunes.
const DAYS = [
  { n: 1, label: "Lunes" },
  { n: 2, label: "Martes" },
  { n: 3, label: "Miércoles" },
  { n: 4, label: "Jueves" },
  { n: 5, label: "Viernes" },
  { n: 6, label: "Sábado" },
  { n: 0, label: "Domingo" },
];

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return msg.error ? <Alert>{msg.error}</Alert> : <Alert tone="success">{msg.ok}</Alert>;
}

export function WeeklyHoursEditor({ dentistId, initial, readOnly }: { dentistId: string; initial: Shift[]; readOnly: boolean }) {
  const [shifts, setShifts] = useState(initial.map((s, i) => ({ ...s, key: i })));
  const [nextKey, setNextKey] = useState(initial.length);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  const update = (key: number, patch: Partial<Shift>) => setShifts((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const remove = (key: number) => setShifts((all) => all.filter((s) => s.key !== key));
  const add = (weekday: number) => {
    const last = shifts.filter((s) => s.weekday === weekday).at(-1);
    setShifts((all) => [...all, { weekday, starts: last ? last.ends : "09:00", ends: last ? "19:00" : "19:00", key: nextKey }]);
    setNextKey((k) => k + 1);
  };
  const copyMonday = () => {
    const monday = shifts.filter((s) => s.weekday === 1);
    let k = nextKey;
    const copies = [2, 3, 4, 5].flatMap((d) => monday.map((s) => ({ ...s, weekday: d, key: k++ })));
    setShifts((all) => [...all.filter((s) => ![2, 3, 4, 5].includes(s.weekday)), ...copies]);
    setNextKey(k);
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-brand-50">
        {DAYS.map((d) => {
          const day = shifts.filter((s) => s.weekday === d.n).sort((a, b) => a.starts.localeCompare(b.starts));
          return (
            <li key={d.n} className="flex flex-wrap items-start gap-3 py-3" data-testid={`dia-${d.n}`}>
              <span className="w-24 pt-2 text-sm font-medium text-brand-900">{d.label}</span>
              <div className="flex flex-1 flex-col gap-2">
                {!day.length && <span className="pt-2 text-sm text-brand-700/60">Descanso</span>}
                {day.map((s) => (
                  <div key={s.key} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      step={900}
                      value={s.starts}
                      disabled={readOnly}
                      onChange={(e) => update(s.key, { starts: e.target.value })}
                      className="field w-32"
                      aria-label={`${d.label} inicio`}
                    />
                    <span className="text-brand-700/70">a</span>
                    <input
                      type="time"
                      step={900}
                      value={s.ends}
                      disabled={readOnly}
                      onChange={(e) => update(s.key, { ends: e.target.value })}
                      className="field w-32"
                      aria-label={`${d.label} fin`}
                    />
                    {!readOnly && (
                      <button type="button" onClick={() => remove(s.key)} className="rounded-lg px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <button type="button" onClick={() => add(d.n)} className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">
                  + Turno
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Feedback msg={msg} />
      {readOnly ? (
        <p className="text-xs text-brand-700/70">Sólo el administrador o el propio odontólogo pueden cambiar este horario.</p>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={copyMonday}>
            Copiar lunes a martes–viernes
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => setMsg(await saveWorkingHours(dentistId, shifts.map(({ weekday, starts, ends }) => ({ weekday, starts, ends })))))
            }
          >
            {pending ? "Guardando…" : "Guardar horario"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function DayOffForm({ dentistId, today }: { dentistId: string; today: string }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [starts, setStarts] = useState("14:00");
  const [ends, setEnds] = useState("16:00");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addDayOff({ dentist_id: dentistId, from, to: allDay ? to : from, allDay, starts, ends, reason });
          setMsg(res);
          if (res.ok) setReason("");
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={allDay ? "Desde" : "Día"}>
          <input type="date" value={from} min={today} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className="field" required />
        </Field>
        {allDay ? (
          <Field label="Hasta">
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="field" required />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="De">
              <input type="time" step={900} value={starts} onChange={(e) => setStarts(e.target.value)} className="field" />
            </Field>
            <Field label="A">
              <input type="time" step={900} value={ends} onChange={(e) => setEnds(e.target.value)} className="field" />
            </Field>
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-800">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Día(s) completo(s)
      </label>
      <Field label="Motivo">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vacaciones, congreso, comida…" className="field" required maxLength={200} />
      </Field>
      <Feedback msg={msg} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Bloquear"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveDayOffButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setError((await removeDayOff(id)).error ?? null))}
        className="rounded-lg px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Quitando…" : "Quitar"}
      </button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}
