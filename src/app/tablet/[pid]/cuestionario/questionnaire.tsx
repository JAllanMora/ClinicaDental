"use client";

import { useState, useTransition } from "react";
import { SignaturePad } from "@/components/signature-pad";
import { Alert, Button, cx } from "@/components/ui";
import { PATHOLOGICAL_CONDITIONS } from "@/lib/clinical";
import { submitQuestionnaire } from "../../actions";

const COMMON_ALLERGIES = ["Penicilina", "Látex", "Ibuprofeno / AINEs", "Anestesia local", "Sulfas", "Ninguna"];

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <span className="flex gap-2">
      {[
        [true, "Sí"],
        [false, "No"],
      ].map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v as boolean)}
          aria-pressed={value === v}
          className={cx(
            "min-w-16 rounded-xl border px-4 py-2 text-base font-medium transition",
            value === v
              ? v
                ? "border-magenta-500 bg-magenta-500 text-white"
                : "border-brand-500 bg-brand-500 text-white"
              : "border-brand-200 bg-white text-brand-800",
          )}
        >
          {label as string}
        </button>
      ))}
    </span>
  );
}

export function Questionnaire({ patientId, patientName, female }: { patientId: string; patientName: string; female: boolean }) {
  const [complaint, setComplaint] = useState("");
  const [conditions, setConditions] = useState<Record<string, boolean | null>>({});
  const [other, setOther] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [otherAllergy, setOtherAllergy] = useState("");
  const [meds, setMeds] = useState("");
  const [surgeries, setSurgeries] = useState("");
  const [pregnant, setPregnant] = useState<boolean | null>(null);
  const [breastfeeding, setBreastfeeding] = useState<boolean | null>(null);
  const [lastVisit, setLastVisit] = useState("");
  const [dental, setDental] = useState("");
  const [signer, setSigner] = useState(patientName);
  const [signature, setSignature] = useState<string | null>(null);
  const [truthful, setTruthful] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unanswered = PATHOLOGICAL_CONDITIONS.filter((c) => conditions[c.key] === undefined || conditions[c.key] === null).length;

  const toggleAllergy = (a: string) =>
    setAllergies((prev) => (a === "Ninguna" ? (prev.includes(a) ? [] : ["Ninguna"]) : prev.includes(a) ? prev.filter((x) => x !== a) : [...prev.filter((x) => x !== "Ninguna"), a]));

  const submit = () =>
    start(async () => {
      setError(null);
      const list = [...allergies.filter((a) => a !== "Ninguna"), ...otherAllergy.split(",").map((a) => a.trim()).filter(Boolean)];
      const res = await submitQuestionnaire(patientId, {
        answers: {
          chief_complaint: complaint,
          conditions: Object.fromEntries(Object.entries(conditions).filter(([, v]) => v !== null)) as Record<string, boolean>,
          other_conditions: other,
          allergies: list,
          medications: meds,
          surgeries,
          pregnant: female ? pregnant : null,
          breastfeeding: female ? breastfeeding : null,
          last_dental_visit: lastVisit,
          dental_history: dental,
        },
        signer_name: signer,
        signature: signature ?? "",
      });
      if (res?.error) setError(res.error);
    });

  const section = "space-y-4 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm";
  const input = "w-full rounded-xl border border-brand-200 px-4 py-3 text-base outline-none focus:border-brand-500";

  return (
    <div className="space-y-6">
      <section className={section}>
        <h2 className="text-xl font-semibold text-brand-900">¿Cuál es el motivo de tu visita?</h2>
        <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} placeholder="Ej. me duele una muela al masticar" className={input} />
        <label className="block text-base text-brand-800">
          ¿Cuándo fue tu última visita al dentista?
          <input value={lastVisit} onChange={(e) => setLastVisit(e.target.value)} placeholder="Ej. hace un año" className={cx(input, "mt-2")} />
        </label>
      </section>

      <section className={section}>
        <h2 className="text-xl font-semibold text-brand-900">¿Padeces o has padecido…?</h2>
        <ul className="divide-y divide-brand-50">
          {PATHOLOGICAL_CONDITIONS.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-4 py-3">
              <span className="text-base text-brand-900">{c.label}</span>
              <YesNo value={conditions[c.key] ?? null} onChange={(v) => setConditions((p) => ({ ...p, [c.key]: v }))} />
            </li>
          ))}
        </ul>
        <label className="block text-base text-brand-800">
          ¿Alguna otra enfermedad?
          <input value={other} onChange={(e) => setOther(e.target.value)} className={cx(input, "mt-2")} />
        </label>
      </section>

      <section className={section}>
        <h2 className="text-xl font-semibold text-brand-900">¿Eres alérgico a algo?</h2>
        <div className="flex flex-wrap gap-2">
          {COMMON_ALLERGIES.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={allergies.includes(a)}
              onClick={() => toggleAllergy(a)}
              className={cx(
                "rounded-full border px-4 py-2 text-base",
                allergies.includes(a) ? "border-magenta-500 bg-magenta-500 text-white" : "border-brand-200 bg-white text-brand-800",
              )}
            >
              {a}
            </button>
          ))}
        </div>
        <input value={otherAllergy} onChange={(e) => setOtherAllergy(e.target.value)} placeholder="Otras alergias (separadas por coma)" className={input} />
      </section>

      <section className={section}>
        <h2 className="text-xl font-semibold text-brand-900">Medicamentos y cirugías</h2>
        <label className="block text-base text-brand-800">
          ¿Qué medicamentos tomas actualmente?
          <textarea value={meds} onChange={(e) => setMeds(e.target.value)} rows={2} className={cx(input, "mt-2")} />
        </label>
        <label className="block text-base text-brand-800">
          ¿Has tenido cirugías u hospitalizaciones?
          <textarea value={surgeries} onChange={(e) => setSurgeries(e.target.value)} rows={2} className={cx(input, "mt-2")} />
        </label>
        <label className="block text-base text-brand-800">
          ¿Algo más que debamos saber de tus dientes? (sensibilidad, sangrado de encías, miedo al dentista…)
          <textarea value={dental} onChange={(e) => setDental(e.target.value)} rows={2} className={cx(input, "mt-2")} />
        </label>
        {female && (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-base text-brand-900">¿Estás embarazada?</span>
              <YesNo value={pregnant} onChange={setPregnant} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-base text-brand-900">¿Estás en periodo de lactancia?</span>
              <YesNo value={breastfeeding} onChange={setBreastfeeding} />
            </div>
          </>
        )}
      </section>

      <section className={section}>
        <h2 className="text-xl font-semibold text-brand-900">Firma</h2>
        <label className="block text-base text-brand-800">
          Nombre de quien responde
          <input value={signer} onChange={(e) => setSigner(e.target.value)} className={cx(input, "mt-2")} />
        </label>
        <label className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 text-base text-brand-900">
          <input type="checkbox" checked={truthful} onChange={(e) => setTruthful(e.target.checked)} className="mt-1 h-6 w-6 accent-magenta-500" />
          Declaro que la información es verdadera y que avisaré a la clínica si cambia mi estado de salud.
        </label>
        <SignaturePad label="Firma con tu dedo" onChange={setSignature} height={220} />
        {error && <Alert>{error}</Alert>}
        {unanswered > 0 && <p className="text-sm text-amber-700">Te faltan {unanswered} preguntas de enfermedades por contestar.</p>}
        <Button onClick={submit} disabled={pending || !signature || !truthful || unanswered > 0} className="w-full py-4 text-lg">
          {pending ? "Enviando…" : "Enviar mis respuestas"}
        </Button>
      </section>
    </div>
  );
}
