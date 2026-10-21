import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/components/ui";
import { PerioChart } from "./perio-chart";

export const metadata: Metadata = { title: "Periodontograma" };

export default async function PerioPage({ params, searchParams }: PageProps<"/pacientes/[id]/periodontograma">) {
  const profile = await requireProfile();
  const { id } = await params;
  const { examen } = await searchParams;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  const { data: exams } = await supabase
    .from("periodontal_exams")
    .select("*")
    .eq("patient_id", id)
    .order("exam_date", { ascending: false })
    .order("created_at", { ascending: false });

  const isNew = examen === "nuevo" || !exams?.length;
  const current = isNew ? null : (exams.find((e) => e.id === examen) ?? exams[0]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-brand-700/80">Evaluaciones:</span>
        {exams?.map((e) => (
          <Link
            key={e.id}
            href={`/pacientes/${id}/periodontograma?examen=${e.id}`}
            className={cx(
              "rounded-full px-3 py-1 text-sm transition",
              current?.id === e.id ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-800 hover:bg-brand-100",
            )}
          >
            {formatDate(e.exam_date)}
          </Link>
        ))}
        <Link
          href={`/pacientes/${id}/periodontograma?examen=nuevo`}
          className={cx(
            "rounded-full border border-dashed px-3 py-1 text-sm transition",
            isNew ? "border-magenta-500 text-magenta-600" : "border-brand-300 text-brand-700 hover:bg-brand-50",
          )}
        >
          + Nueva evaluación
        </Link>
      </div>
      <PerioChart
        key={current?.id ?? "nuevo"}
        patientId={id}
        exam={current}
        previous={isNew ? (exams?.[0] ?? null) : null}
      />
    </div>
  );
}
