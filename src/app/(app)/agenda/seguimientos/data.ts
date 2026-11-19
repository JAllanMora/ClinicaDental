import type { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/format";
import type { RecallRow } from "./recall-list";

type Db = Awaited<ReturnType<typeof createClient>>;

export const RECALL_SELECT =
  "id, due_on, reason, status, sent_count, sent_at, cancel_reason, patient:patients(id, first_name, last_name, second_last_name, phone), dentist:profiles!patient_recalls_dentist_id_fkey(full_name), type:appointment_types(name)" as const;

type Raw = {
  id: string;
  due_on: string;
  reason: string;
  status: RecallRow["status"];
  sent_count: number;
  sent_at: string | null;
  cancel_reason: string | null;
  patient: { id: string; first_name: string; last_name: string; second_last_name: string | null; phone: string | null } | null;
  dentist: { full_name: string } | null;
  type: { name: string } | null;
};

export const toRow = (r: Raw): RecallRow => ({
  id: r.id,
  due_on: r.due_on,
  reason: r.reason,
  status: r.status,
  sent_count: r.sent_count,
  sent_at: r.sent_at,
  cancel_reason: r.cancel_reason,
  patient: r.patient ? { id: r.patient.id, name: fullName(r.patient), phone: r.patient.phone } : null,
  dentist: r.dentist?.full_name ?? null,
  type: r.type?.name ?? null,
});

export const toRows = (data: unknown) => ((data ?? []) as Raw[]).map(toRow);

/** Seguimientos de un paciente (sin los cancelados). */
export async function patientRecalls(supabase: Db, patientId: string) {
  const { data } = await supabase.from("patient_recalls").select(RECALL_SELECT).eq("patient_id", patientId).neq("status", "cancelado").order("due_on");
  return toRows(data);
}
