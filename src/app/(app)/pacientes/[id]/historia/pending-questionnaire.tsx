"use client";

import { useState, useTransition } from "react";
import type { PatientQuestionnaire } from "@/lib/database.types";
import { Alert, Button, Card } from "@/components/ui";
import { PATHOLOGICAL_CONDITIONS } from "@/lib/clinical";
import { reviewQuestionnaire } from "./questionnaire-actions";

export function PendingQuestionnaire({ patientId, q, submittedLabel }: { patientId: string; q: PatientQuestionnaire; submittedLabel: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const a = q.answers;
  const yes = PATHOLOGICAL_CONDITIONS.filter((c) => a.conditions?.[c.key]).map((c) => c.label);
  const run = (apply: boolean) => start(async () => setError((await reviewQuestionnaire(patientId, q.id, apply)).error ?? null));
  const row = (label: string, value?: string | null) =>
    value ? (
      <div className="grid grid-cols-3 gap-2 py-1.5">
        <dt className="text-brand-700/70">{label}</dt>
        <dd className="col-span-2">{value}</dd>
      </div>
    ) : null;

  return (
    <Card className="mb-6 border-magenta-500/40 bg-pink-50/40">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-brand-900">Cuestionario llenado por el paciente</h2>
          <p className="text-xs text-brand-700/70">
            {submittedLabel} · firmado por {q.signer_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => run(false)}>
            Marcar revisado
          </Button>
          <Button disabled={pending} onClick={() => run(true)}>
            Pasar a la historia clínica
          </Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      <dl className="divide-y divide-brand-100 text-sm">
        {row("Motivo", a.chief_complaint)}
        {row("Enfermedades", yes.length ? yes.join(", ") : "Ninguna")}
        {row("Otras", a.other_conditions)}
        {row("Alergias", a.allergies?.length ? a.allergies.join(", ") : "Ninguna")}
        {row("Medicamentos", a.medications)}
        {row("Cirugías", a.surgeries)}
        {row("Embarazo", a.pregnant === true ? "Sí" : a.pregnant === false ? "No" : null)}
        {row("Lactancia", a.breastfeeding === true ? "Sí" : a.breastfeeding === false ? "No" : null)}
        {row("Última visita", a.last_dental_visit)}
        {row("Antecedentes dentales", a.dental_history)}
      </dl>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={q.signature} alt={`Firma de ${q.signer_name}`} className="mt-3 h-16 rounded border border-brand-100 bg-white" />
    </Card>
  );
}
