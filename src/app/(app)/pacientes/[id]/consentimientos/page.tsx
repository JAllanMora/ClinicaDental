import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Consentimientos" };

export default async function ConsentsPage({ params }: PageProps<"/pacientes/[id]/consentimientos">) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  const { data: consents } = await supabase
    .from("consents")
    .select("id, title, signer_name, signed_at, revoked_at")
    .eq("patient_id", id)
    .order("signed_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ButtonLink href={`/pacientes/${id}/consentimientos/nuevo`}>+ Firmar consentimiento</ButtonLink>
      </div>
      {!consents?.length ? (
        <EmptyState title="Sin consentimientos firmados">
          Elige una plantilla, revísala con el paciente y que firme en la tablet o en la pantalla.
        </EmptyState>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-brand-50">
            {consents.map((c) => (
              <li key={c.id}>
                <Link href={`/pacientes/${id}/consentimientos/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-brand-50/60">
                  <span>
                    <span className="font-medium text-brand-900">{c.title}</span>
                    <span className="block text-xs text-brand-700/70">
                      Firmó {c.signer_name} · {formatDateTime(c.signed_at)}
                    </span>
                  </span>
                  {c.revoked_at ? <Badge tone="gray">Revocado</Badge> : <Badge tone="green">Vigente</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
