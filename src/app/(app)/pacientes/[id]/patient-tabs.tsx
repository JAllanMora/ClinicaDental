"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

type Tab = { href: string; label: string; soon?: boolean };

export function PatientTabs({ id, clinical }: { id: string; clinical: boolean }) {
  const pathname = usePathname();
  const base = `/pacientes/${id}`;
  const tabs: Tab[] = [
    { href: base, label: "Resumen" },
    ...(clinical
      ? [
          { href: `${base}/historia`, label: "Historia clínica" },
          { href: `${base}/odontograma`, label: "Odontograma", soon: true },
          { href: `${base}/periodontograma`, label: "Periodontograma", soon: true },
          { href: `${base}/evolucion`, label: "Notas de evolución", soon: true },
          { href: `${base}/imagenes`, label: "Imágenes", soon: true },
        ]
      : []),
  ];

  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-brand-100 px-1">
      {tabs.map((t) =>
        t.soon ? (
          <span key={t.href} className="whitespace-nowrap px-3 py-2.5 text-sm text-brand-300" title="Disponible en la siguiente fase">
            {t.label}
          </span>
        ) : (
          <Link
            key={t.href}
            href={t.href}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
              pathname === t.href
                ? "border-magenta-500 text-magenta-600"
                : "border-transparent text-brand-700 hover:border-brand-300 hover:text-brand-900",
            )}
          >
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}
