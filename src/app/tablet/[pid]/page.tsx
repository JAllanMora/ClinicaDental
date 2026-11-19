import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TabletPatient({ params }: PageProps<"/tablet/[pid]">) {
  const profile = await requireProfile();
  const { pid } = await params;
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("id, first_name").eq("id", pid).maybeSingle();
  if (!patient) notFound();

  const card = "block rounded-3xl border border-brand-100 bg-white p-8 shadow-sm transition hover:border-brand-300 hover:shadow-lg";
  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-3xl font-semibold text-brand-900">Hola, {patient.first_name}</h1>
      <p className="text-brand-700/80">¿Qué vamos a hacer?</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/tablet/${pid}/cuestionario`} className={card}>
          <span className="text-4xl" aria-hidden>
            📝
          </span>
          <span className="mt-3 block text-xl font-semibold text-brand-900">Cuestionario de salud</span>
          <span className="mt-1 block text-base text-brand-700/80">Tus enfermedades, alergias y medicamentos. Toma unos 3 minutos.</span>
        </Link>
        {canSeeClinical(profile.role) && (
          <Link href={`/tablet/${pid}/consentimiento`} className={card}>
            <span className="text-4xl" aria-hidden>
              ✍️
            </span>
            <span className="mt-3 block text-xl font-semibold text-brand-900">Firmar consentimiento</span>
            <span className="mt-1 block text-base text-brand-700/80">Lee el procedimiento y firma con el dedo.</span>
          </Link>
        )}
      </div>
    </div>
  );
}
