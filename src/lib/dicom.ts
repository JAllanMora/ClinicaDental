import * as dicomParser from "dicom-parser";

export type DicomInfo = {
  rows: number;
  columns: number;
  patientName?: string;
  studyDate?: string;
  modality?: string;
  manufacturer?: string;
  transferSyntax: string;
  windowCenter: number;
  windowWidth: number;
};

export type DicomImage =
  | { kind: "gray"; info: DicomInfo; pixels: Float32Array; min: number; max: number; invert: boolean }
  | { kind: "rgb"; info: DicomInfo; rgb: Uint8Array }
  | { kind: "jpeg"; info: DicomInfo; blob: Blob }
  | { kind: "unsupported"; info: DicomInfo; reason: string };

const UNCOMPRESSED = new Set(["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.1.99"]);
const JPEG_BASELINE = new Set(["1.2.840.10008.1.2.4.50", "1.2.840.10008.1.2.4.51"]);

/**
 * Decodifica la primera imagen de un DICOM. Soporta escala de grises sin
 * compresión (8/16 bits, con signo o sin signo), RGB sin compresión y JPEG
 * baseline (lo que exportan la mayoría de sensores intraorales y ortopantomógrafos).
 */
export function decodeDicom(buffer: ArrayBuffer): DicomImage {
  const ds = dicomParser.parseDicom(new Uint8Array(buffer));
  const transferSyntax = ds.string("x00020010") ?? "1.2.840.10008.1.2";
  const rows = ds.uint16("x00280010") ?? 0;
  const columns = ds.uint16("x00280011") ?? 0;
  const bits = ds.uint16("x00280100") ?? 16;
  const signed = ds.uint16("x00280103") === 1;
  const samples = ds.uint16("x00280002") ?? 1;
  const photometric = (ds.string("x00280004") ?? "MONOCHROME2").trim();
  const slope = ds.floatString("x00281053") ?? 1;
  const intercept = ds.floatString("x00281052") ?? 0;

  const info: DicomInfo = {
    rows,
    columns,
    patientName: ds.string("x00100010")?.replace(/\^/g, " ").trim(),
    studyDate: ds.string("x00080020"),
    modality: ds.string("x00080060"),
    manufacturer: ds.string("x00080070"),
    transferSyntax,
    windowCenter: ds.floatString("x00281050") ?? NaN,
    windowWidth: ds.floatString("x00281051") ?? NaN,
  };

  const pixelEl = ds.elements.x7fe00010;
  if (!pixelEl) return { kind: "unsupported", info, reason: "El archivo no contiene imagen." };

  if (JPEG_BASELINE.has(transferSyntax)) {
    const frame = pixelEl.fragments?.length
      ? dicomParser.readEncapsulatedPixelDataFromFragments(ds, pixelEl, 0, pixelEl.fragments.length)
      : dicomParser.readEncapsulatedPixelData(ds, pixelEl, 0);
    return { kind: "jpeg", info, blob: new Blob([new Uint8Array(frame)], { type: "image/jpeg" }) };
  }

  if (!UNCOMPRESSED.has(transferSyntax)) {
    return {
      kind: "unsupported",
      info,
      reason: `Compresión no soportada en el navegador (${transferSyntax}). Descarga el archivo y ábrelo en el software del equipo.`,
    };
  }

  const n = rows * columns;
  const bytes = ds.byteArray.buffer.slice(
    ds.byteArray.byteOffset + pixelEl.dataOffset,
    ds.byteArray.byteOffset + pixelEl.dataOffset + pixelEl.length,
  );

  if (samples === 3 && bits === 8) {
    const src = new Uint8Array(bytes);
    const planar = ds.uint16("x00280006") === 1;
    const rgb = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      rgb[i * 3] = planar ? src[i] : src[i * 3];
      rgb[i * 3 + 1] = planar ? src[n + i] : src[i * 3 + 1];
      rgb[i * 3 + 2] = planar ? src[2 * n + i] : src[i * 3 + 2];
    }
    return { kind: "rgb", info, rgb };
  }

  if (samples !== 1) return { kind: "unsupported", info, reason: "Formato de color no soportado." };

  const raw =
    bits === 8
      ? signed
        ? new Int8Array(bytes, 0, n)
        : new Uint8Array(bytes, 0, n)
      : signed
        ? new Int16Array(bytes, 0, n)
        : new Uint16Array(bytes, 0, n);
  const pixels = new Float32Array(n);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = raw[i] * slope + intercept;
    pixels[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(info.windowCenter) || !Number.isFinite(info.windowWidth) || info.windowWidth <= 0) {
    info.windowCenter = (min + max) / 2;
    info.windowWidth = Math.max(1, max - min);
  }
  return { kind: "gray", info, pixels, min, max, invert: photometric === "MONOCHROME1" };
}

/** Aplica ventana/nivel y devuelve RGBA para un canvas. */
export function renderGray(img: Extract<DicomImage, { kind: "gray" }>, center: number, width: number, invert: boolean) {
  const out = new Uint8ClampedArray(img.pixels.length * 4);
  const lo = center - width / 2;
  const flip = invert !== img.invert;
  for (let i = 0; i < img.pixels.length; i++) {
    let v = ((img.pixels[i] - lo) / width) * 255;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (flip) v = 255 - v;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}
