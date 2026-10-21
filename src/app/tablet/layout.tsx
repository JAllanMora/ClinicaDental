import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Modo tablet" };

export default async function TabletLayout({ children }: LayoutProps<"/tablet">) {
  await requireProfile();
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-pink-50">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-3">
          <LogoMark className="h-10 w-10" />
          <span className="text-lg font-semibold text-brand-800">Clínica Dental Villa San Juan</span>
        </span>
        <Link href="/tablet" className="rounded-lg px-3 py-2 text-sm text-brand-600 hover:bg-brand-50">
          Inicio de tablet
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16 text-lg">{children}</main>
    </div>
  );
}
