import { CLINIC_OFFSET, clinicParts, minutesToLabel } from "@/lib/agenda";
import { getCurrentProfile } from "@/lib/auth";
import { METHOD_LABEL } from "@/lib/finance";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { shiftMonth } from "../data";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return new Response("No autorizado", { status: 403 });
  const mes = new URL(request.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes)) return new Response("Mes inválido", { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("folio, received_at, amount, method, reference, voided, void_reason, patient:patients(first_name, last_name, second_last_name), receiver:profiles!payments_received_by_fkey(full_name)")
    .gte("received_at", `${mes}-01T00:00:00${CLINIC_OFFSET}`)
    .lt("received_at", `${shiftMonth(mes, 1)}-01T00:00:00${CLINIC_OFFSET}`)
    .order("received_at");

  const header = ["Recibo", "Fecha", "Hora", "Paciente", "Forma de pago", "Referencia", "Monto", "Cancelado", "Motivo", "Recibió"];
  const lines = (data ?? []).map((p) => {
    const { day, minutes } = clinicParts(p.received_at);
    return [p.folio, day, minutesToLabel(minutes), p.patient ? fullName(p.patient) : "", METHOD_LABEL[p.method], p.reference, Number(p.amount).toFixed(2), p.voided ? "Sí" : "No", p.void_reason, p.receiver?.full_name]
      .map(esc)
      .join(",");
  });
  // BOM para que Excel abra bien los acentos.
  const csv = "﻿" + [header.map(esc).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pagos-${mes}.csv"` },
  });
}
