"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppRole, Appointment, AppointmentType, Patient, ScheduleBlock, WaitlistEntry } from "@/lib/database.types";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  NEXT_STATUS,
  SLOT_MINUTES,
  STATUS,
  addDays,
  clinicParts,
  longDay,
  minutesToLabel,
  shortDay,
  todayStr,
  toISO,
} from "@/lib/agenda";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { Alert, Badge, Button, ButtonLink, Field, cx } from "@/components/ui";
import { addBlock, createAppointment, removeBlock, rescheduleAppointment, searchPatients, setAppointmentStatus } from "./actions";

export type PatientLite = Pick<Patient, "id" | "first_name" | "last_name" | "second_last_name" | "phone">;
type Appt = Appointment & { patient: PatientLite | null };
type Wait = WaitlistEntry & { patient: PatientLite | null };
type Dentist = { id: string; full_name: string; color: string };
type Chair = { id: string; name: string; branch_id: string };
type TypeLite = Pick<AppointmentType, "id" | "name" | "duration_minutes" | "color">;
type Column = { key: string; label: string; day: string; dentistId?: string; chairId?: string; color?: string };

type Draft = {
  id?: string;
  patient: PatientLite | null;
  day: string;
  start: number;
  duration: number;
  dentistId: string;
  chairId: string;
  typeId: string;
  reason: string;
  notes: string;
  waitlistId?: string;
};

const PX_PER_MIN = 1.4;
const GRID_START = DAY_START_HOUR * 60;
const GRID_END = DAY_END_HOUR * 60;

export function AgendaBoard(props: {
  day: string;
  weekStart: string;
  nextDay: string;
  prevDay: string;
  view: "dia" | "semana";
  by: "sillon" | "doctor";
  branchId: string;
  focus: string;
  branches: { id: string; name: string }[];
  chairs: Chair[];
  dentists: Dentist[];
  types: TypeLite[];
  appointments: Appt[];
  blocks: ScheduleBlock[];
  waitlist: Wait[];
  prefill: { waitlistId: string; patient: PatientLite; typeId: string | null; dentistId: string | null; start: number | null; chairId: string | null } | null;
  me: { id: string; role: AppRole };
}) {
  const { day, view, by, chairs, dentists, types, appointments, blocks, me } = props;
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (!props.prefill) return null;
    const type = types.find((t) => t.id === props.prefill?.typeId);
    return {
      patient: props.prefill.patient,
      day,
      start: props.prefill.start ?? 9 * 60,
      duration: type?.duration_minutes ?? 30,
      dentistId: props.prefill.dentistId ?? dentists[0]?.id ?? "",
      chairId: props.prefill.chairId ?? chairs[0]?.id ?? "",
      typeId: type?.id ?? "",
      reason: type?.name ?? "",
      notes: "",
      waitlistId: props.prefill.waitlistId,
    };
  });
  const [selected, setSelected] = useState<Appt | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [now, setNow] = useState<{ day: string; minutes: number } | null>(null);

  // Tiempo real: cualquier cambio en citas refresca la vista (recepción ↔ consultorios).
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel("agenda")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    const tick = () => setNow(clinicParts(new Date().toISOString()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);


  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);
  const dentistById = useMemo(() => Object.fromEntries(dentists.map((d) => [d.id, d])), [dentists]);
  const chairById = useMemo(() => Object.fromEntries(chairs.map((c) => [c.id, c])), [chairs]);

  const columns: Column[] = useMemo(() => {
    if (view === "semana") {
      return Array.from({ length: 6 }, (_, i) => {
        const d = addDays(props.weekStart, i);
        return {
          key: d,
          label: shortDay(d),
          day: d,
          ...(by === "doctor" ? { dentistId: props.focus } : { chairId: props.focus }),
        };
      });
    }
    return by === "doctor"
      ? dentists.map((d) => ({ key: d.id, label: d.full_name, day, dentistId: d.id, color: d.color }))
      : chairs.map((c) => ({ key: c.id, label: c.name, day, chairId: c.id }));
  }, [view, by, dentists, chairs, day, props.weekStart, props.focus]);

  const visible = appointments.filter((a) => showCancelled || (a.status !== "cancelada" && a.status !== "no_asistio"));
  const inColumn = (a: { starts_at: string; dentist_id?: string | null; chair_id?: string | null }, col: Column) => {
    const p = clinicParts(a.starts_at);
    if (p.day !== col.day) return false;
    if (col.dentistId && a.dentist_id !== col.dentistId) return false;
    if (col.chairId && a.chair_id !== col.chairId) return false;
    return true;
  };

  const hrefWith = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ fecha: day, vista: view, por: by, sucursal: props.branchId, foco: props.focus, ...patch });
    for (const [k, v] of [...sp.entries()]) if (!v) sp.delete(k);
    return `/agenda?${sp}`;
  };

  const openNew = (col: Column, minutes: number) => {
    const rounded = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
    setSelected(null);
    setDraft({
      patient: null,
      day: col.day,
      start: rounded,
      duration: 30,
      dentistId: col.dentistId ?? (me.role === "dentist" ? me.id : (dentists[0]?.id ?? "")),
      chairId: col.chairId ?? chairs[0]?.id ?? "",
      typeId: "",
      reason: "",
      notes: "",
    });
  };

  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  const totalHeight = (GRID_END - GRID_START) * PX_PER_MIN;
  const todaysCount = appointments.filter((a) => a.status !== "cancelada").length;

  return (
    <div className="space-y-4">
      {/* Encabezado y filtros */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-brand-900">Agenda</h1>
          <p className="text-sm first-letter:uppercase text-brand-700/80">
            {view === "semana" ? `semana del ${longDay(props.weekStart)}` : longDay(day)} · {todaysCount} cita{todaysCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/agenda/espera" variant="secondary">
            Lista de espera
            {props.waitlist.length > 0 && <Badge tone="magenta">{props.waitlist.length}</Badge>}
          </ButtonLink>
          <Button onClick={() => openNew(columns[0] ?? { key: "", label: "", day }, 9 * 60)}>+ Nueva cita</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-100 bg-white p-2 shadow-sm">
        <Link href={hrefWith({ fecha: props.prevDay })} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Anterior">
          ←
        </Link>
        <Link href={hrefWith({ fecha: todayStr() })} className="rounded-lg border border-brand-200 px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-50">
          Hoy
        </Link>
        <Link href={hrefWith({ fecha: props.nextDay })} className="rounded-lg px-3 py-1.5 text-brand-700 hover:bg-brand-50" aria-label="Siguiente">
          →
        </Link>
        <input
          type="date"
          value={day}
          onChange={(e) => e.target.value && router.push(hrefWith({ fecha: e.target.value }))}
          className="field w-auto py-1.5"
          aria-label="Ir a fecha"
        />
        <Segmented
          value={view}
          options={[
            ["dia", "Día"],
            ["semana", "Semana"],
          ]}
          href={(v) => hrefWith({ vista: v, foco: "" })}
        />
        <Segmented
          value={by}
          options={[
            ["sillon", "Por sillón"],
            ["doctor", "Por doctor"],
          ]}
          href={(v) => hrefWith({ por: v, foco: "" })}
        />
        {view === "semana" && (
          <select value={props.focus} onChange={(e) => router.push(hrefWith({ foco: e.target.value }))} className="field w-auto py-1.5" aria-label="Filtrar">
            {(by === "doctor" ? dentists.map((d) => [d.id, d.full_name]) : chairs.map((c) => [c.id, c.name])).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        {props.branches.length > 1 && (
          <select value={props.branchId} onChange={(e) => router.push(hrefWith({ sucursal: e.target.value, foco: "" }))} className="field w-auto py-1.5" aria-label="Sucursal">
            {props.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <label className="ml-auto flex items-center gap-2 px-2 text-xs text-brand-700">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="accent-brand-500" />
          Ver canceladas
        </label>
      </div>

      {columns.length === 0 ? (
        <Alert tone="info">
          {by === "doctor" ? "No hay odontólogos activos." : "No hay sillones activos en esta sucursal."} Configúralos en Configuración.
        </Alert>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-sm">
          <div className="min-w-max">
            {/* Cabecera de columnas */}
            <div className="sticky top-0 z-20 flex border-b border-brand-100 bg-white">
              <div className="w-14 shrink-0" />
              {columns.map((c) => (
                <div key={c.key} className="flex min-w-44 flex-1 items-center justify-center gap-2 border-l border-brand-50 px-2 py-2.5 text-sm font-medium text-brand-900">
                  {c.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />}
                  <span className={cx(c.day === todayStr() && view === "semana" && "rounded-full bg-magenta-500 px-2 text-white")}>{c.label}</span>
                </div>
              ))}
            </div>
            <div className="relative flex" style={{ height: totalHeight }}>
              {/* Horas */}
              <div className="w-14 shrink-0">
                {hours.map((h) => (
                  <div key={h} className="relative text-right text-[11px] text-brand-700/70" style={{ height: 60 * PX_PER_MIN }}>
                    <span className="absolute -top-2 right-2">{minutesToLabel(h * 60)}</span>
                  </div>
                ))}
              </div>
              {columns.map((col) => (
                <DayColumn
                  key={col.key}
                  col={col}
                  hours={hours}
                  appointments={visible.filter((a) => inColumn(a, col))}
                  blocks={blocks.filter(
                    (b) =>
                      clinicParts(b.starts_at).day <= col.day &&
                      clinicParts(b.ends_at).day >= col.day &&
                      ((col.dentistId && b.dentist_id === col.dentistId) || (col.chairId && b.chair_id === col.chairId)),
                  )}
                  typeById={typeById}
                  dentistById={dentistById}
                  chairById={chairById}
                  by={by}
                  now={now && now.day === col.day ? now.minutes : null}
                  selectedId={selected?.id}
                  onEmpty={(m) => openNew(col, m)}
                  onSelect={(a) => {
                    setDraft(null);
                    setSelected(a);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-brand-700">
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
            {s.label}
          </span>
        ))}
      </div>

      {draft && (
        <AppointmentDialog
          draft={draft}
          setDraft={setDraft}
          types={types}
          dentists={dentists}
          chairs={chairs}
          me={me}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            router.refresh();
          }}
        />
      )}
      {selected && (
        <AppointmentPanel
          appt={appointments.find((a) => a.id === selected.id) ?? selected}
          type={selected.type_id ? typeById[selected.type_id] : undefined}
          dentist={dentistById[selected.dentist_id]}
          chair={chairById[selected.chair_id]}
          waitlist={props.waitlist}
          me={me}
          onClose={() => setSelected(null)}
          onEdit={(a) => {
            const p = clinicParts(a.starts_at);
            const e = clinicParts(a.ends_at);
            setSelected(null);
            setDraft({
              id: a.id,
              patient: a.patient,
              day: p.day,
              start: p.minutes,
              duration: e.minutes - p.minutes,
              dentistId: a.dentist_id,
              chairId: a.chair_id,
              typeId: a.type_id ?? "",
              reason: a.reason ?? "",
              notes: a.notes ?? "",
            });
          }}
          onBlock={() => router.refresh()}
        />
      )}
      <BlockTool dentists={dentists} chairs={chairs} day={day} me={me} />
    </div>
  );
}

function Segmented({ value, options, href }: { value: string; options: [string, string][]; href: (v: string) => string }) {
  return (
    <div className="inline-flex rounded-lg border border-brand-200 p-0.5 text-sm">
      {options.map(([v, label]) => (
        <Link
          key={v}
          href={href(v)}
          className={cx("rounded-md px-3 py-1 transition", value === v ? "bg-brand-500 text-white" : "text-brand-700 hover:bg-brand-50")}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function DayColumn({
  col,
  hours,
  appointments,
  blocks,
  typeById,
  dentistById,
  chairById,
  by,
  now,
  selectedId,
  onEmpty,
  onSelect,
}: {
  col: Column;
  hours: number[];
  appointments: Appt[];
  blocks: ScheduleBlock[];
  typeById: Record<string, TypeLite>;
  dentistById: Record<string, Dentist>;
  chairById: Record<string, Chair>;
  by: "sillon" | "doctor";
  now: number | null;
  selectedId?: string;
  onEmpty: (minutes: number) => void;
  onSelect: (a: Appt) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="relative min-w-44 flex-1 cursor-copy border-l border-brand-50"
      onClick={(e) => {
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.slot) return;
        const y = e.clientY - ref.current!.getBoundingClientRect().top;
        onEmpty(GRID_START + y / PX_PER_MIN);
      }}
      data-testid={`col-${col.key}`}
    >
      {hours.map((h) => (
        <div key={h} data-slot="1" className="border-t border-brand-50" style={{ height: 60 * PX_PER_MIN }}>
          <div data-slot="1" className="border-b border-dashed border-brand-50/70" style={{ height: 30 * PX_PER_MIN }} />
        </div>
      ))}
      {blocks.map((b) => {
        const s = clinicParts(b.starts_at);
        const e = clinicParts(b.ends_at);
        const start = s.day < col.day ? GRID_START : Math.max(GRID_START, s.minutes);
        const end = e.day > col.day ? GRID_END : Math.min(GRID_END, e.minutes);
        if (end <= start) return null;
        return (
          <div
            key={b.id}
            className="pointer-events-none absolute inset-x-0 bg-[repeating-linear-gradient(135deg,#f3e8f7_0,#f3e8f7_6px,#fff_6px,#fff_12px)] px-2 py-1 text-[11px] text-brand-700"
            style={{ top: (start - GRID_START) * PX_PER_MIN, height: (end - start) * PX_PER_MIN }}
          >
            {b.reason}
          </div>
        );
      })}
      {now !== null && now >= GRID_START && now <= GRID_END && (
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-magenta-500" style={{ top: (now - GRID_START) * PX_PER_MIN }}>
          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-magenta-500" />
        </div>
      )}
      {appointments.map((a) => {
        const s = clinicParts(a.starts_at).minutes;
        const e = clinicParts(a.ends_at).minutes;
        const type = a.type_id ? typeById[a.type_id] : undefined;
        const color = type?.color ?? dentistById[a.dentist_id]?.color ?? "#a0449a";
        const height = Math.max(18, (e - s) * PX_PER_MIN - 2);
        const name = a.patient ? fullName(a.patient) : "Ocupado";
        const faded = a.status === "cancelada" || a.status === "no_asistio";
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={cx(
              "absolute inset-x-1 z-10 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition hover:z-20 hover:shadow-md",
              selectedId === a.id && "ring-2 ring-magenta-500",
              faded && "opacity-50 line-through",
            )}
            style={{ top: (s - GRID_START) * PX_PER_MIN + 1, height, borderColor: color, background: `${color}1f` }}
            title={`${minutesToLabel(s)}–${minutesToLabel(e)} ${name}`}
          >
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS[a.status].dot }} />
              <span className="truncate font-semibold text-brand-950">{name}</span>
            </span>
            {height > 30 && (
              <span className="block truncate text-brand-800">
                {minutesToLabel(s)}–{minutesToLabel(e)} · {type?.name ?? a.reason ?? ""}
              </span>
            )}
            {height > 48 && (
              <span className="block truncate text-brand-700/80">
                {by === "sillon" ? dentistById[a.dentist_id]?.full_name : chairById[a.chair_id]?.name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-brand-950/40" onClick={onClose} aria-label="Cerrar" />
      <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-brand-700 hover:bg-brand-50" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PatientPicker({ value, onChange }: { value: PatientLite | null; onChange: (p: PatientLite | null) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; list: PatientLite[] }>({ q: "", list: [] });
  const searching = q.trim().length >= 2;
  const results = searching && found.q === q ? found.list : [];
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => searchPatients(q).then((list) => setFound({ q, list })), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value)
    return (
      <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
        <span>
          <span className="font-medium text-brand-900">{fullName(value)}</span>
          {value.phone && <span className="text-brand-700/80"> · {value.phone}</span>}
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-brand-600 hover:underline">
          Cambiar
        </button>
      </div>
    );
  return (
    <div className="relative">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente por nombre o teléfono…" className="field" />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-brand-100 bg-white shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50">
                <span className="font-medium text-brand-900">{fullName(p)}</span>
                {p.phone && <span className="text-brand-700/80"> · {p.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && found.q === q && results.length === 0 && (
        <p className="mt-1 text-xs text-brand-700/70">
          Sin resultados.{" "}
          <Link href="/pacientes/nuevo" className="text-brand-600 hover:underline">
            Dar de alta paciente
          </Link>
        </p>
      )}
    </div>
  );
}

function AppointmentDialog({
  draft,
  setDraft,
  types,
  dentists,
  chairs,
  me,
  onClose,
  onSaved,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft | null) => Draft | null) => void;
  types: TypeLite[];
  dentists: Dentist[];
  chairs: Chair[];
  me: { id: string; role: AppRole };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const timeOptions = Array.from({ length: ((GRID_END - GRID_START) / SLOT_MINUTES) + 1 }, (_, i) => GRID_START + i * SLOT_MINUTES);

  const save = async () => {
    if (!draft.patient) return setError("Elige al paciente.");
    setSaving(true);
    setError(null);
    const payload = {
      dentist_id: draft.dentistId,
      chair_id: draft.chairId,
      type_id: draft.typeId || null,
      starts_at: toISO(draft.day, draft.start),
      ends_at: toISO(draft.day, draft.start + draft.duration),
      reason: draft.reason || null,
      notes: draft.notes || null,
    };
    const res = draft.id
      ? await rescheduleAppointment(draft.id, payload)
      : await createAppointment({ ...payload, patient_id: draft.patient.id }, draft.waitlistId);
    setSaving(false);
    if (res.error) setError(res.error);
    else onSaved();
  };

  return (
    <Modal title={draft.id ? "Editar / reprogramar cita" : "Nueva cita"} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {draft.waitlistId && <Alert tone="info">Agendando desde la lista de espera.</Alert>}
        <div>
          <span className="label">Paciente</span>
          {draft.id ? (
            <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">{draft.patient ? fullName(draft.patient) : "—"}</div>
          ) : (
            <PatientPicker value={draft.patient} onChange={(p) => set({ patient: p })} />
          )}
        </div>
        <Field label="Tipo de cita">
          <select
            value={draft.typeId}
            onChange={(e) => {
              const t = types.find((x) => x.id === e.target.value);
              set({ typeId: e.target.value, duration: t?.duration_minutes ?? draft.duration, reason: draft.reason || t?.name || "" });
            }}
            className="field"
          >
            <option value="">Sin tipo</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.duration_minutes} min
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fecha">
            <input type="date" value={draft.day} onChange={(e) => set({ day: e.target.value })} className="field" />
          </Field>
          <Field label="Hora">
            <select value={draft.start} onChange={(e) => set({ start: Number(e.target.value) })} className="field">
              {!timeOptions.includes(draft.start) && <option value={draft.start}>{minutesToLabel(draft.start)}</option>}
              {timeOptions.map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duración (min)">
            <input type="number" min={5} max={480} step={5} value={draft.duration} onChange={(e) => set({ duration: Number(e.target.value) })} className="field" />
          </Field>
          <Field label="Odontólogo">
            <select value={draft.dentistId} onChange={(e) => set({ dentistId: e.target.value })} className="field" disabled={me.role === "dentist"}>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sillón">
            <select value={draft.chairId} onChange={(e) => set({ chairId: e.target.value })} className="field">
              {chairs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Termina">
            <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{minutesToLabel(draft.start + draft.duration)}</div>
          </Field>
        </div>
        <Field label="Motivo / procedimiento">
          <input value={draft.reason} onChange={(e) => set({ reason: e.target.value })} className="field" />
        </Field>
        <Field label="Notas para recepción">
          <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className="field" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !draft.dentistId || !draft.chairId}>
            {saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Agendar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AppointmentPanel({
  appt,
  type,
  dentist,
  chair,
  waitlist,
  me,
  onClose,
  onEdit,
}: {
  appt: Appt;
  type?: TypeLite;
  dentist?: Dentist;
  chair?: Chair;
  waitlist: Wait[];
  me: { id: string; role: AppRole };
  onClose: () => void;
  onEdit: (a: Appt) => void;
  onBlock: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [freed, setFreed] = useState(false);
  const s = clinicParts(appt.starts_at);
  const e = clinicParts(appt.ends_at);
  const canEdit = me.role !== "dentist" || appt.dentist_id === me.id;
  const closed = appt.status === "cancelada" || appt.status === "no_asistio" || appt.status === "completada";

  const change = async (status: string, reason?: string) => {
    setBusy(true);
    setError(null);
    const res = await setAppointmentStatus(appt.id, status, reason);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      if (status === "cancelada") setFreed(true);
      router.refresh();
    }
  };

  // Candidatos de la lista de espera para el hueco que deja una cancelación.
  const candidates = waitlist
    .filter((w) => w.patient_id !== appt.patient_id)
    .filter((w) => !w.dentist_id || w.dentist_id === appt.dentist_id)
    .filter((w) => w.preferred_days.includes(new Date(`${s.day}T12:00:00Z`).getUTCDay()))
    .filter((w) => w.preferred_time === "cualquiera" || (w.preferred_time === "manana" ? s.minutes < 14 * 60 : s.minutes >= 13 * 60))
    .slice(0, 5);

  return (
    <Modal title="Cita" onClose={onClose}>
      <div className="space-y-4 text-sm">
        {error && <Alert>{error}</Alert>}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-brand-900">{appt.patient ? fullName(appt.patient) : "Paciente de otro odontólogo"}</div>
            {appt.patient?.phone && <div className="text-brand-700/80">{appt.patient.phone}</div>}
          </div>
          <span className={cx("rounded-full px-2.5 py-1 text-xs font-medium", STATUS[appt.status].tone)}>{STATUS[appt.status].label}</span>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-brand-50 p-3">
          <Info label="Horario" value={`${minutesToLabel(s.minutes)}–${minutesToLabel(e.minutes)}`} />
          <Info label="Fecha" value={longDay(s.day)} />
          <Info label="Odontólogo" value={dentist?.full_name ?? "—"} />
          <Info label="Sillón" value={chair?.name ?? "—"} />
          <Info label="Tipo" value={type?.name ?? "—"} />
          <Info label="Motivo" value={appt.reason ?? "—"} />
        </dl>
        {appt.notes && <p className="rounded-lg border border-brand-100 p-3 text-brand-900">{appt.notes}</p>}
        {appt.cancel_reason && <p className="text-red-700">Motivo de cancelación: {appt.cancel_reason}</p>}

        {canEdit && !closed && (
          <div className="flex flex-wrap gap-2">
            {(NEXT_STATUS[appt.status] ?? []).map((st) => (
              <Button key={st} variant={st === "no_asistio" ? "danger" : "primary"} disabled={busy} onClick={() => change(st)}>
                {st === "confirmada" ? "Confirmar" : st === "en_sala" ? "Llegó" : st === "en_atencion" ? "Pasar a consulta" : st === "completada" ? "Terminar" : "No asistió"}
              </Button>
            ))}
            <Button variant="secondary" disabled={busy} onClick={() => onEdit(appt)}>
              Reprogramar
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Motivo de la cancelación:");
                if (reason !== null) change("cancelada", reason);
              }}
            >
              Cancelar cita
            </Button>
          </div>
        )}
        {appt.patient && (
          <Link href={`/pacientes/${appt.patient.id}`} className="inline-block text-brand-600 hover:underline">
            Abrir expediente →
          </Link>
        )}

        {(freed || appt.status === "cancelada") && candidates.length > 0 && (
          <div className="rounded-xl border border-magenta-500/30 bg-pink-50 p-3">
            <p className="mb-2 font-medium text-magenta-600">Pacientes en lista de espera que podrían ocupar este horario:</p>
            <ul className="space-y-1.5">
              {candidates.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span>
                    {w.patient ? fullName(w.patient) : "—"}
                    {w.patient?.phone && <span className="text-brand-700/80"> · {w.patient.phone}</span>}
                    {w.short_notice && <Badge tone="green" className="ml-2">Disponible con poco aviso</Badge>}
                  </span>
                  <Link
                    href={`/agenda?fecha=${s.day}&espera=${w.id}&hora=${s.minutes}&sillon=${appt.chair_id}`}
                    className="shrink-0 rounded-lg bg-magenta-500 px-3 py-1 text-xs font-medium text-white hover:bg-magenta-600"
                  >
                    Agendar
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-brand-700/70">{label}</dt>
      <dd className="font-medium first-letter:uppercase text-brand-950">{value}</dd>
    </div>
  );
}

/** Bloqueos de horario (comida, vacaciones, mantenimiento del sillón). */
function BlockTool({ dentists, chairs, day, me }: { dentists: Dentist[]; chairs: Chair[]; day: string; me: { id: string; role: AppRole } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(me.role === "dentist" ? `d:${me.id}` : `d:${dentists[0]?.id ?? ""}`);
  const [date, setDate] = useState(day);
  const [from, setFrom] = useState(14 * 60);
  const [to, setTo] = useState(15 * 60);
  const [reason, setReason] = useState("Comida");
  const [error, setError] = useState<string | null>(null);
  const times = Array.from({ length: ((GRID_END - GRID_START) / SLOT_MINUTES) + 1 }, (_, i) => GRID_START + i * SLOT_MINUTES);

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">
        + Bloquear horario (comida, vacaciones, mantenimiento)
      </button>
    );

  return (
    <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Para">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="field" disabled={me.role === "dentist"}>
            {dentists.map((d) => (
              <option key={d.id} value={`d:${d.id}`}>
                {d.full_name}
              </option>
            ))}
            {chairs.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
        </Field>
        <Field label="De">
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className="field">
            {times.map((m) => (
              <option key={m} value={m}>
                {minutesToLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="A">
          <select value={to} onChange={(e) => setTo(Number(e.target.value))} className="field">
            {times.map((m) => (
              <option key={m} value={m}>
                {minutesToLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Motivo">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="field" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
        <Button
          onClick={async () => {
            if (to <= from) return setError("La hora final debe ser posterior.");
            const [kind, id] = target.split(":");
            const res = await addBlock({
              dentist_id: kind === "d" ? id : null,
              chair_id: kind === "c" ? id : null,
              starts_at: toISO(date, from),
              ends_at: toISO(date, to),
              reason,
            });
            if (res.error) setError(res.error);
            else {
              setOpen(false);
              router.refresh();
            }
          }}
        >
          Bloquear
        </Button>
      </div>
    </div>
  );
}

export { removeBlock };
