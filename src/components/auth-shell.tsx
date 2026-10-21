import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-100 via-white to-brand-50 px-4 py-12">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-magenta-500/15 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <div className="rounded-2xl border border-brand-100 bg-white/90 p-7 shadow-xl shadow-brand-900/10 backdrop-blur">
          <h1 className="text-xl font-semibold text-brand-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-brand-700/80">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-brand-700/70">
          Clínica Dental Villa San Juan · San Juan Solís
        </p>
      </div>
    </main>
  );
}
