"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FileKind } from "@/lib/database.types";
import { FILE_KINDS, detectFormat, formatBytes, guessKind, safeFileName } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, Field, cx } from "@/components/ui";
import { registerFile } from "./actions";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

export function Uploader({ patientId }: { patientId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<FileKind | "">("");
  const [date, setDate] = useState(today());
  const [teeth, setTeeth] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    setFiles((f) => [...f, ...next]);
    if (!kind && next[0]) setKind(guessKind(detectFormat(next[0].name, next[0].type)));
  };

  const upload = async () => {
    setError(null);
    const toothList = teeth.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (toothList.some((t) => !Number.isInteger(t) || t < 11 || t > 85)) {
      setError("Revisa las piezas (notación FDI).");
      return;
    }
    const supabase = createClient();
    for (const [i, file] of files.entries()) {
      setProgress(`Subiendo ${i + 1} de ${files.length}: ${file.name}`);
      const format = detectFormat(file.name, file.type);
      const path = `${patientId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const contentType = file.type || (format === "dicom" ? "application/dicom" : format === "stl" ? "model/stl" : "application/octet-stream");
      const { error: upErr } = await supabase.storage.from("clinical").upload(path, file, { contentType, upsert: false });
      if (upErr) {
        setError(`No se pudo subir ${file.name}: ${upErr.message}`);
        setProgress(null);
        return;
      }
      const res = await registerFile(patientId, {
        // En lotes mixtos, un STL siempre es escaneo aunque el tipo elegido sea radiografía.
        kind: format === "stl" ? "escaneo_stl" : kind || guessKind(format),
        storage_path: path,
        file_name: file.name,
        mime_type: contentType,
        size_bytes: file.size,
        format,
        taken_on: date,
        teeth: toothList,
        description: description || null,
      });
      if (res.error) {
        setError(res.error);
        setProgress(null);
        return;
      }
    }
    setFiles([]);
    setKind("");
    setDescription("");
    setTeeth("");
    setProgress(null);
    router.refresh();
  };

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold text-brand-900">Subir archivos</h2>
      {error && <Alert>{error}</Alert>}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        className={cx(
          "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-sm transition",
          drag ? "border-magenta-500 bg-pink-50" : "border-brand-200 hover:bg-brand-50",
        )}
      >
        <span className="font-medium text-brand-800">Arrastra aquí o toca para elegir</span>
        <span className="mt-1 text-xs text-brand-700/70">Radiografías y fotos (JPG, PNG), DICOM (.dcm), escaneos STL o PDF · hasta 200 MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.dcm,.dicom,application/dicom,.stl,model/stl,application/pdf"
        className="hidden"
        data-testid="file-input"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <>
          <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2">
                <span className="truncate">{f.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-brand-700/70">
                  {formatBytes(f.size)}
                  <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="text-red-600 hover:underline">
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Tipo">
              <select value={kind} onChange={(e) => setKind(e.target.value as FileKind)} className="field">
                {FILE_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.group} · {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha de toma">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
            </Field>
            <Field label="Pieza(s)">
              <input value={teeth} onChange={(e) => setTeeth(e.target.value)} placeholder="16, 17" className="field" />
            </Field>
            <Field label="Descripción">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="field" />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3">
            {progress && <span className="text-sm text-brand-700">{progress}</span>}
            <Button onClick={upload} disabled={!!progress}>
              Subir {files.length} archivo{files.length > 1 ? "s" : ""}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
