import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addNote } from "./actions";
import { AmendButton, NoteForm } from "./note-form";

export const metadata: Metadata = { title: "Notas de evolución" };

export default async function NotesPage({ params }: PageProps<"/pacientes/[id]/evolucion">) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  const { data: notes } = await supabase
    .from("clinical_notes")
    .select("*, dentist:profiles!clinical_notes_dentist_id_fkey(full_name, professional_id)")
    .eq("patient_id", id)
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });

  const action = addNote.bind(null, id);
  const originals = (notes ?? []).filter((n) => !n.amends_note_id);
  const amendments = (notes ?? []).filter((n) => n.amends_note_id);

  return (
    <div className="space-y-6">
      <NoteForm action={action} />

      {!originals.length ? (
        <EmptyState title="Sin notas de evolución">Registra cada procedimiento con su pieza, materiales y responsable.</EmptyState>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-brand-100 pl-6">
          {originals.map((n) => (
            <li key={n.id} className="relative">
              <span className="absolute -left-[33px] top-5 h-4 w-4 rounded-full border-4 border-white bg-magenta-500 shadow" />
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-brand-900">
                    {n.procedure}
                    {n.teeth.length > 0 && <span className="ml-2 text-sm font-normal text-brand-700">Pieza {n.teeth.join(", ")}</span>}
                  </h3>
                  <span className="text-sm text-brand-700/80">{formatDate(n.note_date)}</span>
                </div>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {n.materials && <Item label="Materiales" value={n.materials} />}
                  {n.anesthesia && <Item label="Anestesia" value={n.anesthesia} />}
                  {n.next_steps && <Item label="Siguiente" value={n.next_steps} />}
                </dl>
                {n.description && <p className="mt-2 whitespace-pre-line text-sm text-brand-950">{n.description}</p>}
                {amendments
                  .filter((a) => a.amends_note_id === n.id)
                  .reverse()
                  .map((a) => (
                    <div key={a.id} className="mt-3 rounded-lg border-l-4 border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                      <span className="font-medium text-amber-900">Adenda · {formatDateTime(a.created_at)}</span>
                      {a.procedure !== "Adenda" && <span className="text-amber-900"> · {a.procedure}</span>}
                      {a.description && <p className="whitespace-pre-line text-amber-950">{a.description}</p>}
                      <span className="block text-xs text-amber-800/80">{a.dentist?.full_name}</span>
                    </div>
                  ))}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand-50 pt-2 text-xs text-brand-700/70">
                  <span>
                    {n.dentist?.full_name}
                    {n.dentist?.professional_id && ` · Céd. ${n.dentist.professional_id}`} · {formatDateTime(n.created_at)}
                  </span>
                  <AmendButton action={action} id={n.id} label={`${n.procedure} (${formatDate(n.note_date)})`} />
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline text-brand-700/70">{label}: </dt>
      <dd className="inline text-brand-950">{value}</dd>
    </div>
  );
}
