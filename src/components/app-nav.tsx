"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AppRole } from "@/lib/database.types";
import { Logo } from "@/components/logo";
import { cx } from "@/components/ui";

type Item = { href: string; label: string; icon: string; roles?: AppRole[]; soon?: boolean };

const ITEMS: Item[] = [
  { href: "/", label: "Inicio", icon: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" },
  { href: "/pacientes", label: "Pacientes", icon: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8" },
  { href: "/agenda", label: "Agenda", icon: "M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"},
  { href: "/caja", label: "Caja", icon: "M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 9.5v.01M18 14.5v.01", roles: ["admin", "reception"] },
  { href: "/comisiones", label: "Comisiones", icon: "M19 5 5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z", roles: ["admin", "dentist"] },
  { href: "/configuracion", label: "Configuración", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z", roles: ["admin"] },
  { href: "/bitacora", label: "Bitácora", icon: "M9 12h6M9 16h6M9 8h2M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z", roles: ["admin"] },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function AppNav({
  role,
  name,
  roleLabel,
}: {
  role: AppRole;
  name: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = ITEMS.filter((i) => !i.roles || i.roles.includes(role));

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) =>
        item.soon ? (
          <span key={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/45">
            <Icon d={item.icon} />
            {item.label}
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">Pronto</span>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              isActive(item.href) ? "bg-white text-brand-800 shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon d={item.icon} />
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );

  const footer = (
    <div className="mt-6 border-t border-white/15 pt-4">
      <div className="px-3 text-sm font-medium text-white">{name}</div>
      <div className="px-3 text-xs text-white/60">{roleLabel}</div>
      <form action="/auth/signout" method="post" className="mt-3">
        <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-white">
          Cerrar sesión
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Escritorio */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-gradient-to-b from-brand-700 via-brand-800 to-brand-900 p-4 lg:flex">
        <div className="mb-8 rounded-xl bg-white px-3 py-3">
          <Logo />
        </div>
        {nav}
        {footer}
      </aside>

      {/* Móvil / tablet */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-brand-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-brand-700 hover:bg-brand-100"
          aria-label="Abrir menú"
        >
          <Icon d="M4 6h16M4 12h16M4 18h16" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-brand-950/40" onClick={() => setOpen(false)} aria-label="Cerrar menú" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-gradient-to-b from-brand-700 via-brand-800 to-brand-900 p-4">
            <div className="mb-8 rounded-xl bg-white px-3 py-3">
              <Logo />
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}
