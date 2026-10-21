"use client";

import { useState } from "react";
import { money } from "@/lib/format";

const W = 720;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 56 };

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

/** Ingresos por día: una sola serie, barras delgadas con tooltip al pasar el cursor. */
export function IncomeChart({ days }: { days: { day: string; amount: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...days.map((d) => d.amount)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / days.length;
  const barW = Math.max(3, Math.min(18, slot - 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const h = hover !== null ? days[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ingresos cobrados por día" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#efe3f2" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#8a6a93">
              {money(t).replace(".00", "")}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const top = y(d.amount);
          const height = PAD.top + innerH - top;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              {/* Zona de hover más grande que la barra */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              {d.amount > 0 && (
                <path
                  d={`M${x},${top + Math.min(4, height)} q0,-${Math.min(4, height)} ${Math.min(4, barW / 2)},-${Math.min(4, height)} h${barW - 2 * Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, height)} V${PAD.top + innerH} H${x} Z`}
                  fill={hover === i ? "#7d2f78" : "#A0449A"}
                />
              )}
              {(i === 0 || (i + 1) % 5 === 0) && (
                <text x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#8a6a93">
                  {Number(d.day.slice(8))}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="#d9c3de" strokeWidth={1} />
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-brand-100 bg-white px-3 py-1.5 text-xs shadow-md"
          style={{ left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%`, top: 0 }}
        >
          <span className="block text-brand-700/70">{Number(h.day.slice(8))} de este mes</span>
          <span className="font-semibold text-brand-950">{money(h.amount)}</span>
        </div>
      )}
    </div>
  );
}
