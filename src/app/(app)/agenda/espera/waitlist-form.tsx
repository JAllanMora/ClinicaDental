"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, cx } from "@/components/ui";
import { addToWaitlist } from "../actions";
import { type PatientLite, PatientPicker } from "../agenda-board";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function WaitlistForm({
  types,
  dentists,
}: {
  types: { id: string; name: string }[];
  dentists: { id: string; full_name: string }[];
}) {
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [typeId, setTypeId] = useState("");
  const [dentistId, setDentistId] = useState("");
  const [time, setTime] = useState<"manana" | "tarde" | "cualquiera">("cualquiera");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [shortNotice, setShortNotice] = useState(true);
  const [priority, setPriority] = useState(2);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setMsg(null);
      if (!patient) return setMsg({ tone: "error", text: "Elige al paciente." });
      const res = await addToWaitlist({
        patient_id: patient.id,
        type_id: typeId || null,
        dentist_id: dentistId || null,
        preferred_time: time,
        preferred_days: days,
        short_notice: shortNotice,
        priority,
        notes: notes || null,
      });
      if (res.error) return setMsg({ tone: "error", text: res.error });
      setMsg({ tone: "success", text: "Paciente agregado a la lista de espera." });
      setPatient(null);
      setNotes("");
    });

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold text-brand-900">Agregar a la lista</h2>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div>
        <span className="label">Paciente</span>
        <PatientPicker value={patient} onChange={setPatient} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tratamiento">
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="field">
            <option value="">Cualquiera</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Odontólogo">
          <select value={dentistId} onChange={(e) => setDentistId(e.target.value)} className="field">
            <option value="">Cualquiera</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Horario preferido">
          <select value={time} onChange={(e) => setTime(e.target.value as typeof time)} className="field">
            <option value="cualquiera">Cualquiera</option>
            <option value="manana">Mañana (antes de 14:00)</option>
            <option value="tarde">Tarde (14:00 en adelante)</option>
          </select>
        </Field>
        <Field label="Prioridad">
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="field">
            <option value={1}>Alta (dolor / urgencia)</option>
            <option value={2}>Normal</option>
            <option value={3}>Baja</option>
          </select>
        </Field>
      </div>
      <div>
        <span className="label">Días disponibles</span>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const on = days.includes(i);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setDays((prev) => (on ? prev.filter((x) => x !== i) : [...prev, i].sort()))}
                className={cx(
                  "rounded-full border px-3 py-1 text-sm",
                  on ? "border-brand-500 bg-brand-500 text-white" : "border-brand-200 bg-white text-brand-700",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-800">
        <input type="checkbox" checked={shortNotice} onChange={(e) => setShortNotice(e.target.checked)} />
        Puede venir con aviso de pocas horas
      </label>
      <Field label="Notas">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="field" />
      </Field>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Guardando…" : "Agregar"}
        </Button>
      </div>
    </Card>
  );
}
