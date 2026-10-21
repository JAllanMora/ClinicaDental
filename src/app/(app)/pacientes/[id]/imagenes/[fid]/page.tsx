import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { canSeeClinical, requireProfile } from "@/lib/auth";
import { FILE_KIND_LABEL, formatBytes } from "@/lib/files";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { FileViewer } from "./viewer";
import { VoidFileButton } from "./void-button";

export const metadata: Metadata = { title: "Visor" };

export default async function FilePage({ params }: PageProps<"/pacientes/[id]/imagenes/[fid]">) {
  const profile = await requireProfile();
  const { id, fid } = await params;
  if (!canSeeClinical(profile.role)) redirect(`/pacientes/${id}`);

  const supabase = await createClient();
  const { data: file } = await supabase
    .from("patient_files")
    .select("*, uploader:profiles!patient_files_uploaded_by_fkey(full_name)")
    .eq("id", fid)
    .eq("patient_id", id)
    .maybeSingle();
  if (!file) notFound();

  const { data: signed } = await supabase.storage.from("clinical").createSignedUrl(file.storage_path, 60 * 60);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/pacientes/${id}/imagenes`} className="text-sm text-brand-600 hover:underline">
          ← Imágenes
        </Link>
        <div className="flex gap-2">
          {signed?.signedUrl && (
            <a href={signed.signedUrl} download={file.file_name} className="rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm text-brand-800 hover:bg-brand-50">
              Descargar
            </a>
          )}
          {!file.voided_at && <VoidFileButton patientId={id} id={fid} />}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {signed?.signedUrl ? (
          <FileViewer url={signed.signedUrl} format={file.format} name={file.file_name} />
        ) : (
          <Card>No se pudo obtener el archivo.</Card>
        )}
        <Card className="h-fit space-y-2 text-sm">
          <h2 className="font-semibold text-brand-900">{FILE_KIND_LABEL[file.kind]}</h2>
          <p className="break-all text-brand-700/80">{file.file_name}</p>
          <dl className="space-y-1">
            <Row label="Fecha de toma" value={formatDate(file.taken_on)} />
            <Row label="Piezas" value={file.teeth.join(", ") || "—"} />
            <Row label="Tamaño" value={formatBytes(file.size_bytes)} />
            <Row label="Subió" value={`${file.uploader?.full_name ?? "—"} · ${formatDateTime(file.created_at)}`} />
          </dl>
          {file.description && <p className="border-t border-brand-50 pt-2 text-brand-950">{file.description}</p>}
          {file.voided_at && <p className="rounded bg-red-50 p-2 text-red-800">Anulado: {file.void_reason}</p>}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-brand-700/70">{label}</dt>
      <dd className="text-brand-950">{value}</dd>
    </div>
  );
}
