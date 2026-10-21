import type { Metadata } from "next";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDate, fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { setWaitlistStatus } from "../actions";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = { title: "Lista de espera" };

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const TIME = { manana: "Mañana", tarde: "Tarde", cualquiera: "Cualquier hora" } as const;
const PRIORITY = {
  1: { label: "Alta", tone: "red" },
  2: { label: "Normal", tone: "brand" },
  3: { label: "Baja", tone: "gray" },
} as const;

export default async function WaitlistPage() {
  await requireProfile();
  const supabase = await createClient();
  const [{ data: entries }, { data: types }, { data: dentists }] = await Promise.all([
    supabase
      .from("waitlist")
      .select("*, patient:patients(id, first_name, last_name, second_last_name, phone), type:appointment_types(name), dentist:profiles!waitlist_dentist_id_fkey(full_name)")
      .eq("status", "activa")
      .order("priority")
      .order("created_at"),
    supabase.from("appointment_types").select("id, name").eq("active", true).order("name"),
    supabase.from("profiles").select("id, full_name").eq("role", "dentist").eq("active", true).order("full_name"),
  ]);

  async function discard(formData: FormData) {
    "use server";
    await setWaitlistStatus(String(formData.get("id")), "descartada");
  }

  return (
    <>
      <PageHeader
        title="Lista de espera"
        description="Pacientes que quieren una cita antes. Al cancelarse una cita, la agenda sugiere candidatos de esta lista."
        actions={
          <ButtonLink href="/agenda" variant="secondary">
            ← Agenda
          </ButtonLink>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          {!entries?.length ? (
            <EmptyState title="La lista de espera está vacía" />
          ) : (
            entries.map((w) => {
              const p = PRIORITY[w.priority as 1 | 2 | 3];
              return (
                <Card key={w.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-brand-900">
                      {w.patient ? fullName(w.patient) : "Paciente"}
                      {w.patient?.phone && <span className="font-normal text-brand-700/80"> · {w.patient.phone}</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-brand-700/80">
                      {w.type?.name ?? "Cualquier tratamiento"} · {w.dentist?.full_name ?? "Cualquier odontólogo"} · {TIME[w.preferred_time as keyof typeof TIME]} ·{" "}
                      {w.preferred_days.map((d: number) => DAYS[d]).join(", ")}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-brand-700/70">
                      <Badge tone={p.tone}>Prioridad {p.label.toLowerCase()}</Badge>
                      {w.short_notice && <Badge tone="green">Aviso corto</Badge>}
                      <span>Desde {formatDate(w.created_at)}</span>
                      {w.notes && <span>· {w.notes}</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ButtonLink href={`/agenda?espera=${w.id}`}>Agendar</ButtonLink>
                    <form action={discard}>
                      <input type="hidden" name="id" value={w.id} />
                      <button className="rounded-lg px-3 py-2 text-sm text-brand-700 hover:bg-brand-100">Descartar</button>
                    </form>
                  </div>
                </Card>
              );
            })
          )}
        </div>
        <WaitlistForm types={types ?? []} dentists={dentists ?? []} />
      </div>
    </>
  );
}
