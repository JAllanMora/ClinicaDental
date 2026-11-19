"use client";

import { useId } from "react";

type Props = { className?: string; title?: string };

/** Isotipo: diente con kiosco (como en la fachada y la publicidad de la clínica). */
export function LogoMark({ className, title = "Clínica Dental Villa San Juan" }: Props) {
  // Id único: si se repite y la primera copia está oculta, el degradado no se pinta.
  const gradientId = `vsj-tooth-${useId()}`;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a3685" />
          <stop offset="1" stopColor="#c2187a" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M20 4c-8.6 0-14 6.4-14 15.4 0 7.4 3 12.2 5.2 18.4 2.4 6.8 3 21.2 8.6 21.2 4.8 0 4.6-13.8 7-17.4 1.2-1.8 2.4-2.6 5.2-2.6s4 .8 5.2 2.6c2.4 3.6 2.2 17.4 7 17.4 5.6 0 6.2-14.4 8.6-21.2C55 31.6 58 26.8 58 19.4 58 10.4 52.6 4 44 4c-5.4 0-8.2 2.8-12 2.8S25.4 4 20 4Z"
      />
      {/* Kiosco */}
      <g fill="#fff">
        <path d="M32 13.5l1 1.6h-2z" />
        <rect x="31.5" y="11.6" width="1" height="2.2" rx=".4" />
        <path d="M22.5 22.5c2.6-.6 6.2-3.6 9.5-7.4 3.3 3.8 6.9 6.8 9.5 7.4z" />
        <rect x="21.5" y="22.6" width="21" height="1.8" rx=".6" />
        <rect x="23.4" y="24.4" width="1.6" height="7.4" />
        <rect x="28" y="24.4" width="1.6" height="7.4" />
        <rect x="34.4" y="24.4" width="1.6" height="7.4" />
        <rect x="39" y="24.4" width="1.6" height="7.4" />
        <rect x="21" y="31.6" width="22" height="1.8" rx=".6" />
        <rect x="19.6" y="33.4" width="24.8" height="1.6" rx=".6" />
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <LogoMark className="h-10 w-10 shrink-0" />
      <div className="leading-none">
        <div className="text-[15px] font-bold tracking-tight text-magenta-500">VILLA SAN JUAN</div>
        <div className="mt-1 text-[11px] tracking-[0.25em] text-brand-700">clínica dental</div>
      </div>
    </div>
  );
}
