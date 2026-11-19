import type { Metadata } from "next";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { addDays, todayStr } from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";
import { RECALL_SELECT, toRows } from "./data";
import { RecallList } from "./recall-list";

export const metadata: Metadata = { title: "Seguimientos" };

export default async function RecallsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = todayStr();
  const mine = <T extends { eq: (c: string, v: string) => T }>(q: T) => (profile.role === "dentist" ? q.eq("dentist_id", profile.id) : q);

  const [{ data: due }, { data: upcoming }, { data: waiting }, { data: declined }, { data: booked }] = await Promise.all([
    mine(supabase.from("patient_recalls").select(RECALL_SELECT).eq("status", "pendiente").lte("due_on", today)).order("due_on"),
    mine(supabase.from("patient_recalls").select(RECALL_SELECT).eq("status", "pendiente").gt("due_on", today).lte("due_on", addDays(today, 30))).order(
      "due_on",
    ),
    mine(supabase.from("patient_recalls").select(RECALL_SELECT).eq("status", "enviado")).order("sent_at"),
    mine(supabase.from("patient_recalls").select(RECALL_SELECT).eq("status", "declinado").gte("updated_at", addDays(today, -60))).order("updated_at", {
      ascending: false,
    }),
    mine(supabase.from("patient_recalls").select(RECALL_SELECT).eq("status", "agendado").gte("updated_at", addDays(today, -30))).order("updated_at", {
      ascending: false,
    }),
  ]);

  const sections = [
    { title: "Toca enviar hoy", hint: "El bot los manda a la hora de los recordatorios (si el paciente tiene teléfono).", rows: toRows(due) },
    { title: "Próximos 30 días", hint: null, rows: toRows(upcoming) },
    { title: "Enviados sin respuesta", hint: "Si no contestan, a los 7 días el bot manda un segundo y último mensaje. Conviene llamarles.", rows: toRows(waiting) },
    { title: "No quisieron agendar", hint: "Últimos 60 días.", rows: toRows(declined) },
    { title: "Ya agendaron", hint: "Últimos 30 días.", rows: toRows(booked) },
  ];

  return (
    <>
      <PageHeader
        title="Seguimientos"
        description="Pacientes a los que el doctor pidió recordarles regresar. El bot les escribe por WhatsApp y les ofrece agendar."
        actions={
          <ButtonLink href="/agenda" variant="secondary">
            Agenda
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        {sections.map((s) => (
          <Card key={s.title}>
            <h2 className="font-semibold text-brand-900">
              {s.title} <span className="text-sm font-normal text-brand-700/70">({s.rows.length})</span>
            </h2>
            {s.hint && <p className="mb-2 text-xs text-brand-700/70">{s.hint}</p>}
            {s.rows.length ? <RecallList rows={s.rows} showPatient /> : <EmptyState title="Nada por aquí" />}
          </Card>
        ))}
      </div>
    </>
  );
}
