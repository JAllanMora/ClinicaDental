import type { FileKind } from "@/lib/database.types";

export const FILE_KINDS: { key: FileKind; label: string; group: "Radiografía" | "Foto" | "3D" | "Otro" }[] = [
  { key: "periapical", label: "Periapical", group: "Radiografía" },
  { key: "aleta_mordida", label: "Aleta de mordida", group: "Radiografía" },
  { key: "oclusal", label: "Oclusal", group: "Radiografía" },
  { key: "panoramica", label: "Panorámica", group: "Radiografía" },
  { key: "cefalometrica", label: "Cefalométrica", group: "Radiografía" },
  { key: "tomografia", label: "Tomografía (CBCT)", group: "Radiografía" },
  { key: "foto_intraoral", label: "Foto intraoral", group: "Foto" },
  { key: "foto_extraoral", label: "Foto extraoral", group: "Foto" },
  { key: "escaneo_stl", label: "Escaneo intraoral (STL)", group: "3D" },
  { key: "documento", label: "Documento", group: "Otro" },
  { key: "otro", label: "Otro", group: "Otro" },
];

export const FILE_KIND_LABEL = Object.fromEntries(FILE_KINDS.map((k) => [k.key, k.label])) as Record<FileKind, string>;

export type FileFormat = "imagen" | "dicom" | "stl" | "pdf" | "otro";

export function detectFormat(name: string, mime: string): FileFormat {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "dcm" || ext === "dicom" || mime === "application/dicom") return "dicom";
  if (ext === "stl" || mime === "model/stl") return "stl";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/") && ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext)) return "imagen";
  return "otro";
}

export function guessKind(format: FileFormat): FileKind {
  if (format === "stl") return "escaneo_stl";
  if (format === "pdf") return "documento";
  return "periapical";
}

export function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Nombre seguro para la ruta en storage (sin acentos ni espacios). */
export function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);
}
