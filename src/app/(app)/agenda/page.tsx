import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { addDays, dayRange, isValidDay, startOfWeek, todayStr } from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";
import { AgendaBoard } from "./agenda-board";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const day = isValidDay(sp.fecha) ? sp.fecha : todayStr();
  const view = sp.vista === "semana" ? "semana" : "dia";
  const by = sp.por === "doctor" ? "doctor" : "sillon";

  const supabase = await createClient();
  const [{ data: branches }, { data: chairs }, { data: dentists }, { data: types }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("active", true).order("name"),
    supabase.from("chairs").select("id, name, branch_id").eq("active", true).order("name"),
    supabase.from("profiles").select("id, full_name, color, branch_id").eq("role", "dentist").eq("active", true).order("full_name"),
    supabase.from("appointment_types").select("id, name, duration_minutes, color").eq("active", true).order("name"),
  ]);

  const branchId = typeof sp.sucursal === "string" ? sp.sucursal : (branches?.[0]?.id ?? "");
  const branchChairs = (chairs ?? []).filter((c) => !branchId || c.branch_id === branchId);
  const focus =
    typeof sp.foco === "string"
      ? sp.foco
      : by === "doctor"
        ? profile.role === "dentist"
          ? profile.id
          : (dentists?.[0]?.id ?? "")
        : (branchChairs[0]?.id ?? "");

  const from = view === "semana" ? startOfWeek(day) : day;
  const [start, end] = dayRange(from, view === "semana" ? 7 : 1);

  const [{ data: appointments }, { data: blocks }, { data: waitlist }] = await Promise.all([
    supabase
      .from("appointments")
      .select("*, patient:patients(id, first_name, last_name, second_last_name, phone)")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at"),
    supabase.from("schedule_blocks").select("*").lt("starts_at", end).gt("ends_at", start),
    supabase
      .from("waitlist")
      .select("*, patient:patients(id, first_name, last_name, second_last_name, phone)")
      .eq("status", "activa")
      .order("priority")
      .order("created_at"),
  ]);

  let prefill = null;
  if (typeof sp.espera === "string") {
    const entry = waitlist?.find((w) => w.id === sp.espera);
    if (entry?.patient) {
      const hora = Number(sp.hora);
      prefill = {
        waitlistId: entry.id,
        patient: entry.patient,
        typeId: entry.type_id,
        dentistId: entry.dentist_id,
        start: Number.isInteger(hora) && hora >= 0 && hora < 24 * 60 ? hora : null,
        chairId: typeof sp.sillon === "string" && branchChairs.some((c) => c.id === sp.sillon) ? sp.sillon : null,
      };
    }
  }

  return (
    <AgendaBoard
      key={`${day}-${view}-${by}-${branchId}-${focus}-${prefill?.waitlistId ?? ""}`}
      day={day}
      weekStart={startOfWeek(day)}
      nextDay={addDays(day, view === "semana" ? 7 : 1)}
      prevDay={addDays(day, view === "semana" ? -7 : -1)}
      view={view}
      by={by}
      branchId={branchId}
      focus={focus}
      branches={branches ?? []}
      chairs={branchChairs}
      dentists={dentists ?? []}
      types={types ?? []}
      appointments={appointments ?? []}
      blocks={blocks ?? []}
      waitlist={waitlist ?? []}
      prefill={prefill}
      me={{ id: profile.id, role: profile.role }}
    />
  );
}
