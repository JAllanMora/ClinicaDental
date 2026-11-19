"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import type { RecallStatus } from "@/lib/database.types";
import { RECALL_STATUS } from "@/lib/recalls";
import { cancelRecall, rescheduleRecall } from "./actions";

export type RecallRow = {
  id: string;
  due_on: string;
  reason: string;
  status: RecallStatus;
  sent_count: number;
  sent_at: string | null;
  cancel_reason: string | null;
  patient?: { id: string; name: string; phone: string | null } | null;
  dentist?: string | null;
  type?: string | null;
};

const fmt = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Lista de seguimientos con acciones (cambiar fecha, cancelar). `showPatient` para la vista general. */
export function RecallList({ rows, showPatient = false, canEdit = true }: { rows: RecallRow[]; showPatient?: boolean; canEdit?: boolean }) {
  return (
    <ul className="divide-y divide-brand-50" data-testid="recall-list">
      {rows.map((r) => (
        <RecallItem key={r.id} r={r} showPatient={showPatient} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function RecallItem({ r, showPatient, canEdit }: { r: RecallRow; showPatient: boolean; canEdit: boolean }) {
  const [mode, setMode] = useState<"view" | "date" | "cancel">("view");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = r.status === "pendiente" || r.status === "enviado" || r.status === "declinado";
  const st = RECALL_STATUS[r.status];

  const run = (fn: () => Promise<{ error?: string; ok?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? null);
      if (!res.error) setMode("view");
    });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-brand-900">
          {showPatient && r.patient && (
            <>
              <Link href={`/pacientes/${r.patient.id}`} className="hover:underline">
                {r.patient.name}
              </Link>
              {" · "}
            </>
          )}
          {r.reason}
        </p>
        <p className="text-xs text-brand-700/80">
          {fmt(r.due_on)}
          {r.dentist && ` · ${r.dentist}`}
          {r.type && ` · ${r.type}`}
          {showPatient && r.patient && (r.patient.phone ? ` · ${r.patient.phone}` : " · sin teléfono")}
          {r.sent_count > 0 && ` · ${r.sent_count === 1 ? "1 mensaje enviado" : "2 mensajes enviados"}`}
          {r.cancel_reason && ` · ${r.cancel_reason}`}
        </p>
        {msg && <p className="text-xs text-red-700">{msg}</p>}
      </div>
      <Badge tone={st.tone}>{st.label}</Badge>
      {canEdit && open && mode === "view" && (
        <span className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setValue(r.due_on);
              setMode("date");
            }}
          >
            Cambiar fecha
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setValue("");
              setMode("cancel");
            }}
          >
            Cancelar
          </Button>
        </span>
      )}
      {mode === "date" && (
        <span className="flex items-center gap-2">
          <input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="field" aria-label="Nueva fecha" />
          <Button disabled={pending} onClick={() => run(() => rescheduleRecall(r.id, value))}>
            Guardar
          </Button>
          <Button variant="secondary" onClick={() => setMode("view")} aria-label="Cerrar">
            ×
          </Button>
        </span>
      )}
      {mode === "cancel" && (
        <span className="flex items-center gap-2">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Motivo" className="field" aria-label="Motivo de cancelación" />
          <Button disabled={pending} onClick={() => run(() => cancelRecall(r.id, value))}>
            Cancelar recordatorio
          </Button>
          <Button variant="secondary" onClick={() => setMode("view")} aria-label="Cerrar">
            ×
          </Button>
        </span>
      )}
    </li>
  );
}
