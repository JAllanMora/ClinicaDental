"use client";

import { useState, useTransition } from "react";
import type { ConsentTemplate } from "@/lib/database.types";
import { SignaturePad } from "@/components/signature-pad";
import { Alert, Button, cx } from "@/components/ui";
import { signConsent } from "../../../(app)/pacientes/[id]/consentimientos/actions";

export function TabletConsent({
  patientId,
  signerDefault,
  relationDefault,
  templates,
}: {
  patientId: string;
  signerDefault: string;
  relationDefault: string;
  templates: Pick<ConsentTemplate, "id" | "title" | "body">[];
}) {
  const [template, setTemplate] = useState<(typeof templates)[number] | null>(null);
  const [details, setDetails] = useState("");
  const [ready, setReady] = useState(false);
  const [signer, setSigner] = useState(signerDefault);
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Paso 1 (personal): elegir el formato y anotar el procedimiento.
  if (!template || !ready)
    return (
      <div className="space-y-4">
        <p className="text-base text-brand-700">Personal de la clínica: elige el formato y agrega el detalle del procedimiento.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t)}
              className={cx(
                "rounded-2xl border bg-white p-5 text-left text-base font-medium shadow-sm",
                template?.id === t.id ? "border-magenta-500 ring-2 ring-magenta-500/30" : "border-brand-100",
              )}
            >
              {t.title}
            </button>
          ))}
        </div>
        {template && (
          <>
            <label className="block text-base text-brand-800">
              Procedimiento, piezas o riesgos particulares (opcional)
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-brand-200 px-4 py-3 text-base" />
            </label>
            <Button onClick={() => setReady(true)} className="w-full py-4 text-lg">
              Entregar al paciente
            </Button>
          </>
        )}
      </div>
    );

  const body = details.trim() ? `${template.body}\n\nDetalle: ${details.trim()}` : template.body;
  const submit = () =>
    start(async () => {
      setError(null);
      const res = await signConsent(
        patientId,
        { template_id: template.id, title: template.title, body, signer_name: signer, signer_relation: relationDefault, signature: signature ?? "", dentist_signature: null },
        "tablet",
      );
      if (res?.error) setError(res.error);
    });

  // Paso 2 (paciente): leer y firmar.
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-brand-900">{template.title}</h2>
      <div className="max-h-[50vh] overflow-y-auto whitespace-pre-line rounded-2xl border border-brand-100 bg-white p-6 text-base leading-relaxed text-brand-950">{body}</div>
      <label className="block text-base text-brand-800">
        Nombre de quien firma
        <input value={signer} onChange={(e) => setSigner(e.target.value)} className="mt-2 w-full rounded-xl border border-brand-200 px-4 py-3 text-base" />
      </label>
      <label className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 text-base text-brand-900">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-6 w-6 accent-magenta-500" />
        He leído este documento, me resolvieron mis dudas y acepto el tratamiento descrito.
      </label>
      <SignaturePad label="Firma con tu dedo" onChange={setSignature} height={220} />
      {error && <Alert>{error}</Alert>}
      <Button onClick={submit} disabled={pending || !signature || !accepted || signer.trim().length < 3} className="w-full py-4 text-lg">
        {pending ? "Guardando…" : "Firmar"}
      </Button>
    </div>
  );
}
