"use client";

import { useMemo, useState, useTransition } from "react";
import type { DentalFinding, FindingLayer, ToothSurface } from "@/lib/database.types";
import { Alert, Badge, Button, Card, cx } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  CONDITIONS,
  CONDITION_BY_KEY,
  CONDITION_LABEL,
  LAYERS,
  LAYER_COLOR,
  LAYER_LABEL,
  LAYER_PRIORITY,
  PERMANENT_ROWS,
  PRIMARY_ROWS,
  SURFACE_LABEL,
  isUpper,
  surfaceAt,
} from "@/lib/odontogram";
import { addFinding, completeFinding, voidFinding } from "./actions";

type Dentition = "permanente" | "temporal" | "mixta";
type Pos = "top" | "bottom" | "left" | "right" | "center";

const S = 40; // tamaño del diagrama de cada pieza
const I = 12; // margen del cuadro central

const POLYGONS: Record<Pos, string> = {
  top: `0,0 ${S},0 ${S - I},${I} ${I},${I}`,
  bottom: `0,${S} ${S},${S} ${S - I},${S - I} ${I},${S - I}`,
  left: `0,0 ${I},${I} ${I},${S - I} 0,${S}`,
  right: `${S},0 ${S - I},${I} ${S - I},${S - I} ${S},${S}`,
  center: `${I},${I} ${S - I},${I} ${S - I},${S - I} ${I},${S - I}`,
};

function topFinding(list: DentalFinding[]) {
  return [...list].sort((a, b) => LAYER_PRIORITY[b.layer] - LAYER_PRIORITY[a.layer])[0];
}

function Tooth({
  tooth,
  findings,
  selected,
  onSurface,
  onSelect,
}: {
  tooth: number;
  findings: DentalFinding[];
  selected: boolean;
  onSurface: (tooth: number, surface: ToothSurface) => void;
  onSelect: (tooth: number) => void;
}) {
  const upper = isUpper(tooth);
  const whole = findings.filter((f) => !f.surface);
  const missing = whole.find((f) => f.condition === "ausente" || f.condition === "extraccion");
  const crown = whole.find((f) => f.condition === "corona");
  const symbols = whole.filter((f) => !["ausente", "extraccion", "corona"].includes(f.condition));

  const label = (
    <button
      type="button"
      onClick={() => onSelect(tooth)}
      className={cx(
        "w-full rounded text-[11px] font-semibold tabular-nums transition",
        selected ? "bg-magenta-500 text-white" : "text-brand-800 hover:bg-brand-100",
      )}
    >
      {tooth}
    </button>
  );

  const symbolRow = (
    <div className="flex h-4 items-center justify-center gap-0.5">
      {symbols.slice(0, 2).map((f) => (
        <span
          key={f.id}
          title={`${CONDITION_LABEL[f.condition]} · ${LAYER_LABEL[f.layer]}`}
          className="rounded px-0.5 text-[9px] font-bold leading-none"
          style={{ color: LAYER_COLOR[f.layer] }}
        >
          {CONDITION_BY_KEY[f.condition]?.symbol}
        </span>
      ))}
    </div>
  );

  return (
    <div className="flex w-11 flex-col items-center gap-0.5">
      {upper ? label : symbolRow}
      <svg
        viewBox={`-2 -2 ${S + 4} ${S + 4}`}
        className={cx("h-11 w-11 touch-manipulation", selected && "drop-shadow-[0_0_4px_rgba(194,24,122,0.5)]")}
        role="group"
        aria-label={`Pieza ${tooth}`}
      >
        {(Object.keys(POLYGONS) as Pos[]).map((pos) => {
          const surface = surfaceAt(tooth, pos);
          const hit = topFinding(findings.filter((f) => f.surface === surface));
          return (
            <polygon
              key={pos}
              points={POLYGONS[pos]}
              fill={hit ? LAYER_COLOR[hit.layer] : "#ffffff"}
              fillOpacity={hit ? 0.85 : 1}
              stroke="#8a3685"
              strokeWidth={1}
              className="cursor-pointer transition hover:fill-brand-200"
              onClick={() => onSurface(tooth, surface)}
            >
              {/* Un solo nodo de texto: varios nodos dentro de <title> rompen la hidratación */}
              <title>{`${tooth} · ${SURFACE_LABEL[surface]}${hit ? ` · ${CONDITION_LABEL[hit.condition]} (${LAYER_LABEL[hit.layer]})` : ""}`}</title>
            </polygon>
          );
        })}
        {crown && (
          <circle cx={S / 2} cy={S / 2} r={S / 2 + 0.5} fill="none" stroke={LAYER_COLOR[crown.layer]} strokeWidth={3} pointerEvents="none" />
        )}
        {missing && (
          <g stroke={LAYER_COLOR[missing.layer]} strokeWidth={3.5} strokeLinecap="round" pointerEvents="none">
            <line x1={2} y1={2} x2={S - 2} y2={S - 2} />
            <line x1={S - 2} y1={2} x2={2} y2={S - 2} />
          </g>
        )}
      </svg>
      {upper ? symbolRow : label}
    </div>
  );
}

export function Odontogram({
  patientId,
  findings,
  staffNames,
  initialDentition,
}: {
  patientId: string;
  findings: DentalFinding[];
  staffNames: Record<string, string>;
  initialDentition: Dentition;
}) {
  const [dentition, setDentition] = useState<Dentition>(initialDentition);
  const [layer, setLayer] = useState<FindingLayer>("patologia");
  const [condition, setCondition] = useState("caries");
  const [visible, setVisible] = useState<Set<FindingLayer>>(new Set(LAYERS.map((l) => l.key)));
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const active = useMemo(() => findings.filter((f) => !f.voided_at), [findings]);
  const byTooth = useMemo(() => {
    const map = new Map<number, DentalFinding[]>();
    for (const f of active) {
      if (!visible.has(f.layer)) continue;
      map.set(f.tooth, [...(map.get(f.tooth) ?? []), f]);
    }
    return map;
  }, [active, visible]);

  const rows =
    dentition === "permanente"
      ? [PERMANENT_ROWS[0], PERMANENT_ROWS[1]]
      : dentition === "temporal"
        ? [PRIMARY_ROWS[0], PRIMARY_ROWS[1]]
        : [PERMANENT_ROWS[0], PRIMARY_ROWS[0], PRIMARY_ROWS[1], PERMANENT_ROWS[1]];

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  const scope = CONDITION_BY_KEY[condition].scope;

  const onSurface = (tooth: number, surface: ToothSurface) => {
    run(() =>
      addFinding(patientId, { tooth, surface: scope === "surface" ? surface : null, condition, layer, notes: null }),
    );
  };

  const listed = (showVoided ? findings : active)
    .filter((f) => selectedTooth === null || f.tooth === selectedTooth)
    .sort((a, b) => a.tooth - b.tooth || a.recorded_at.localeCompare(b.recorded_at));

  const counts = LAYERS.map((l) => ({ ...l, n: active.filter((f) => f.layer === l.key).length }));

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-brand-200 p-0.5 text-sm">
            {(["permanente", "mixta", "temporal"] as Dentition[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDentition(d)}
                className={cx(
                  "rounded-md px-3 py-1.5 capitalize transition",
                  dentition === d ? "bg-brand-500 text-white" : "text-brand-700 hover:bg-brand-50",
                )}
              >
                {d === "permanente" ? "Adulto" : d === "temporal" ? "Infantil" : "Mixta"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() =>
                  setVisible((v) => {
                    const next = new Set(v);
                    if (next.has(l.key)) next.delete(l.key);
                    else next.add(l.key);
                    return next;
                  })
                }
                title={`${visible.has(l.key) ? "Ocultar" : "Mostrar"} capa: ${l.description}`}
                className={cx(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition",
                  visible.has(l.key) ? "border-transparent bg-brand-50 text-brand-900" : "border-brand-100 text-brand-300 line-through",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                {l.label} · {l.n}
              </button>
            ))}
          </div>
        </div>

        <div className={cx("overflow-x-auto pb-2 transition", pending && "opacity-60")}>
          <div className="mx-auto w-max space-y-3">
            {rows.map((row, i) => (
              <div
                key={i}
                className={cx(
                  "flex justify-center gap-1",
                  // Separación entre arcada superior e inferior
                  i === rows.length / 2 - 1 && "border-b-2 border-dashed border-brand-200 pb-3",
                )}
              >
                {row.map((tooth, j) => (
                  <div key={tooth} className={cx(j === row.length / 2 && "ml-3 border-l-2 border-dashed border-brand-200 pl-3")}>
                    <Tooth
                      tooth={tooth}
                      findings={byTooth.get(tooth) ?? []}
                      selected={selectedTooth === tooth}
                      onSurface={onSurface}
                      onSelect={(t) => setSelectedTooth((s) => (s === t ? null : t))}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-xs text-brand-700/70">
          Derecha del paciente ← · → Izquierda del paciente. Toca una cara para marcarla; toca el número para filtrar.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <h2 className="mb-3 font-semibold text-brand-900">Herramienta</h2>
          <p className="label">1. Capa</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {LAYERS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLayer(l.key)}
                className={cx(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                  layer === l.key ? "border-transparent text-white shadow-sm" : "border-brand-100 text-brand-800 hover:bg-brand-50",
                )}
                style={layer === l.key ? { background: l.color } : undefined}
              >
                <span className="h-3 w-3 shrink-0 rounded-full border border-white/60" style={{ background: l.color }} />
                {l.label}
              </button>
            ))}
          </div>
          <p className="label">2. Condición por cara</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {CONDITIONS.filter((c) => c.scope === "surface").map((c) => (
              <ConditionChip key={c.key} active={condition === c.key} onClick={() => setCondition(c.key)}>
                {c.label}
              </ConditionChip>
            ))}
          </div>
          <p className="label">o de pieza completa</p>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.filter((c) => c.scope === "tooth").map((c) => (
              <ConditionChip key={c.key} active={condition === c.key} onClick={() => setCondition(c.key)}>
                {c.symbol && <span className="mr-1 font-bold">{c.symbol}</span>}
                {c.label}
              </ConditionChip>
            ))}
          </div>
          <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Marcando: <strong>{CONDITION_LABEL[condition]}</strong> como <strong>{LAYER_LABEL[layer]}</strong>
            {scope === "tooth" ? " en la pieza completa." : " en la cara que toques."}
          </p>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-brand-900">
              {selectedTooth ? `Pieza ${selectedTooth}` : "Todos los hallazgos"}
            </h2>
            <div className="flex items-center gap-3 text-xs">
              {selectedTooth && (
                <button type="button" className="text-brand-600 hover:underline" onClick={() => setSelectedTooth(null)}>
                  Ver todas
                </button>
              )}
              <label className="flex items-center gap-1.5 text-brand-700">
                <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="accent-brand-500" />
                Mostrar anulados
              </label>
            </div>
          </div>
          {listed.length === 0 ? (
            <p className="py-6 text-center text-sm text-brand-700/70">Sin hallazgos registrados.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-brand-50 overflow-y-auto">
              {listed.map((f) => (
                <li key={f.id} className={cx("flex flex-wrap items-start gap-3 py-2.5 text-sm", f.voided_at && "opacity-50")}>
                  <span className="w-8 shrink-0 font-semibold tabular-nums text-brand-900">{f.tooth}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("font-medium text-brand-900", f.voided_at && "line-through")}>
                      {CONDITION_LABEL[f.condition] ?? f.condition}
                    </span>
                    {f.surface && <span className="text-brand-700/80"> · {SURFACE_LABEL[f.surface]}</span>}{" "}
                    <Badge className="ml-1" style={{ background: `${LAYER_COLOR[f.layer]}1a`, color: LAYER_COLOR[f.layer] }}>
                      {LAYER_LABEL[f.layer]}
                    </Badge>
                    <span className="block text-xs text-brand-700/70">
                      {formatDateTime(f.recorded_at)} · {staffNames[f.recorded_by ?? ""] ?? "—"}
                      {f.completed_at && ` · realizado ${formatDateTime(f.completed_at)}`}
                      {f.voided_at && ` · anulado: ${f.void_reason}`}
                    </span>
                  </span>
                  {!f.voided_at && (
                    <span className="flex gap-1">
                      {f.layer === "propuesto" && (
                        <Button variant="secondary" className="px-2 py-1 text-xs" disabled={pending} onClick={() => run(() => completeFinding(patientId, f.id))}>
                          ✓ Realizado
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        disabled={pending}
                        onClick={() => {
                          const reason = window.prompt(
                            f.layer === "patologia" ? "Motivo (p. ej. resuelto, error de captura):" : "Motivo de la anulación:",
                          );
                          if (reason !== null) run(() => voidFinding(patientId, f.id, reason));
                        }}
                      >
                        Anular
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ConditionChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full border px-2.5 py-1 text-xs transition",
        active ? "border-magenta-500 bg-magenta-500 text-white" : "border-brand-100 text-brand-800 hover:border-brand-300",
      )}
    >
      {children}
    </button>
  );
}
