import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { FILE_KINDS, FILE_KIND_LABEL } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { Uploader } from "./uploader";

export const metadata: Metadata = { title: "Imágenes" };

const FORMAT_ICON: Record<string, string> = { dicom: "DICOM", stl: "3D · STL", pdf: "PDF", otro: "Archivo" };

export default async function FilesPage({ params, searchParams }: PageProps<"/pacientes/[id]/imagenes">) {
  const profile = await requireProfile();
  const { id } = await params;
  const { tipo } = await searchParams;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  let q = supabase
    .from("patient_files")
    .select("*")
    .eq("patient_id", id)
    .is("voided_at", null)
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (typeof tipo === "string" && tipo) q = q.eq("kind", tipo as never);
  const { data: files } = await q;

  // Miniaturas: URLs firmadas de corta duración (el bucket es privado).
  const images = (files ?? []).filter((f) => f.format === "imagen");
  const { data: signed } = images.length
    ? await supabase.storage.from("clinical").createSignedUrls(
        images.map((f) => f.storage_path),
        60 * 30,
      )
    : { data: [] };
  const thumbs = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="space-y-6">
      <Uploader patientId={id} />

      <div className="flex flex-wrap gap-2">
        <Link href={`/pacientes/${id}/imagenes`}>
          <Badge tone={!tipo ? "magenta" : "brand"}>Todos</Badge>
        </Link>
        {FILE_KINDS.map((k) => (
          <Link key={k.key} href={`/pacientes/${id}/imagenes?tipo=${k.key}`}>
            <Badge tone={tipo === k.key ? "magenta" : "brand"}>{k.label}</Badge>
          </Link>
        ))}
      </div>

      {!files?.length ? (
        <EmptyState title="Sin archivos">Sube radiografías, fotos intraorales, DICOM o escaneos STL.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <Link
              key={f.id}
              href={`/pacientes/${id}/imagenes/${f.id}`}
              className="group overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-brand-950">
                {f.format === "imagen" && thumbs.get(f.storage_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs.get(f.storage_path)!} alt={f.file_name} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <span className="text-sm font-semibold tracking-wide text-brand-200">{FORMAT_ICON[f.format]}</span>
                )}
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium text-brand-900">{FILE_KIND_LABEL[f.kind]}</div>
                <div className="truncate text-xs text-brand-700/70">
                  {formatDate(f.taken_on)}
                  {f.teeth.length > 0 && ` · ${f.teeth.join(", ")}`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
