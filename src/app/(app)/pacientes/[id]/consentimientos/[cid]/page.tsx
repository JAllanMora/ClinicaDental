import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { formatDateTime, fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getPatient } from "../../data";
import { ConsentActions } from "./consent-actions";

export const metadata: Metadata = { title: "Consentimiento" };

export default async function ConsentPage({ params }: PageProps<"/pacientes/[id]/consentimientos/[cid]">) {
  const profile = await requireProfile();
  const { id, cid } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  const [patient, { data: c }] = await Promise.all([
    getPatient(id),
    supabase
      .from("consents")
      .select("*, dentist:profiles!consents_dentist_id_fkey(full_name, professional_id)")
      .eq("id", cid)
      .eq("patient_id", id)
      .maybeSingle(),
  ]);
  if (!c || !patient) notFound();

  return (
    <div className="space-y-4">
      {c.revoked_at && (
        <Alert>
          Revocado el {formatDateTime(c.revoked_at)}. Motivo: {c.revoked_reason}
        </Alert>
      )}
      <ConsentActions patientId={id} id={cid} revoked={!!c.revoked_at} />
      <Card className="print-area mx-auto max-w-3xl space-y-6 p-8">
        <header className="border-b border-brand-100 pb-4 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-brand-700">Clínica Dental Villa San Juan</p>
          <h1 className="mt-2 text-xl font-semibold text-brand-900">{c.title}</h1>
          <p className="mt-1 text-sm text-brand-700/80">
            Paciente: {fullName(patient)} · Fecha: {formatDateTime(c.signed_at)}
          </p>
        </header>
        <div className="whitespace-pre-line text-sm leading-relaxed text-brand-950">{c.body}</div>
        <div className="grid gap-8 pt-6 sm:grid-cols-2">
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.signature} alt={`Firma de ${c.signer_name}`} className="mx-auto h-28 object-contain" />
            <div className="border-t border-brand-900/40 pt-1 text-sm">
              {c.signer_name}
              {c.signer_relation && c.signer_relation !== "Paciente" && ` (${c.signer_relation})`}
            </div>
          </div>
          <div className="text-center">
            {c.dentist_signature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.dentist_signature} alt="Firma del odontólogo" className="mx-auto h-28 object-contain" />
            ) : (
              <div className="h-28" />
            )}
            <div className="border-t border-brand-900/40 pt-1 text-sm">
              {c.dentist?.full_name}
              {c.dentist?.professional_id && ` · Céd. ${c.dentist.professional_id}`}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
