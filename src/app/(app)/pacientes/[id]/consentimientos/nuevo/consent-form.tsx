"use client";

import { useState, useTransition } from "react";
import type { ConsentTemplate } from "@/lib/database.types";
import { SignaturePad } from "@/components/signature-pad";
import { Alert, Button, Card, Field } from "@/components/ui";
import { signConsent } from "../actions";

export function ConsentForm({
  patientId,
  patientName,
  guardian,
  dentistName,
  templates,
}: {
  patientId: string;
  patientName: string;
  guardian: string | null;
  dentistName: string;
  templates: Pick<ConsentTemplate, "id" | "title" | "body">[];
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState(templates[0]?.title ?? "");
  const [body, setBody] = useState(templates[0]?.body ?? "");
  const [signer, setSigner] = useState(guardian ?? patientName);
  const [relation, setRelation] = useState(guardian ? "Tutor" : "Paciente");
  const [signature, setSignature] = useState<string | null>(null);
  const [dentistSignature, setDentistSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (id: string) => {
    const t = templates.find((x) => x.id === id);
    setTemplateId(id);
    setTitle(t?.title ?? "");
    setBody(t?.body ?? "");
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await signConsent(patientId, {
        template_id: templateId || null,
        title,
        body,
        signer_name: signer,
        signer_relation: relation,
        signature: signature ?? "",
        dentist_signature: dentistSignature,
      });
      if (res?.error) setError(res.error);
    });

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plantilla">
            <select value={templateId} onChange={(e) => pick(e.target.value)} className="field">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
              <option value="">Texto libre</option>
            </select>
          </Field>
          <Field label="Título">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
          </Field>
        </div>
        <Field label="Texto del consentimiento" hint="Agrega aquí las piezas, el procedimiento específico o riesgos particulares.">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="field leading-relaxed" />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold text-brand-900">Firma</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de quien firma">
            <input value={signer} onChange={(e) => setSigner(e.target.value)} className="field" />
          </Field>
          <Field label="Relación con el paciente">
            <select value={relation} onChange={(e) => setRelation(e.target.value)} className="field">
              {["Paciente", "Madre", "Padre", "Tutor", "Representante legal"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-5 w-5 accent-magenta-500" />
          He leído (o me han leído) este documento, entiendo su contenido y acepto el tratamiento descrito.
        </label>
        <div className="grid gap-6 lg:grid-cols-2">
          <SignaturePad label={`Firma de ${signer || "quien autoriza"}`} onChange={setSignature} />
          <SignaturePad label={`Firma del odontólogo (${dentistName}) · opcional`} onChange={setDentistSignature} />
        </div>
        <div className="flex justify-end">
          <Button variant="accent" onClick={submit} disabled={pending || !signature || !accepted || !signer.trim()}>
            {pending ? "Guardando…" : "Guardar consentimiento firmado"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
