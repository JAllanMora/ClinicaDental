import type { FindingLayer, ToothSurface } from "@/lib/database.types";

/** Capas del odontograma y su color. */
export const LAYERS: { key: FindingLayer; label: string; color: string; description: string }[] = [
  { key: "patologia", label: "Patología", color: "#dc2626", description: "Caries, fracturas y otros hallazgos activos" },
  { key: "previo", label: "Tratamiento previo", color: "#2563eb", description: "Trabajo existente al llegar a la clínica" },
  { key: "propuesto", label: "Propuesto", color: "#d97706", description: "Plan de tratamiento" },
  { key: "realizado", label: "Realizado", color: "#059669", description: "Hecho en la clínica" },
];

export const LAYER_COLOR = Object.fromEntries(LAYERS.map((l) => [l.key, l.color])) as Record<FindingLayer, string>;
export const LAYER_LABEL = Object.fromEntries(LAYERS.map((l) => [l.key, l.label])) as Record<FindingLayer, string>;

export type ConditionScope = "surface" | "tooth";

/** Catálogo de condiciones. scope=surface se marca por cara; tooth, en la pieza completa. */
export const CONDITIONS: { key: string; label: string; scope: ConditionScope; symbol?: string }[] = [
  { key: "caries", label: "Caries", scope: "surface" },
  { key: "resina", label: "Resina", scope: "surface" },
  { key: "amalgama", label: "Amalgama", scope: "surface" },
  { key: "ionomero", label: "Ionómero", scope: "surface" },
  { key: "sellador", label: "Sellador", scope: "surface" },
  { key: "incrustacion", label: "Incrustación", scope: "surface" },
  { key: "fractura", label: "Fractura", scope: "surface" },
  { key: "abfraccion", label: "Abfracción / desgaste", scope: "surface" },
  { key: "ausente", label: "Ausente", scope: "tooth", symbol: "X" },
  { key: "extraccion", label: "Extracción", scope: "tooth", symbol: "X" },
  { key: "endodoncia", label: "Endodoncia", scope: "tooth", symbol: "EN" },
  { key: "corona", label: "Corona", scope: "tooth", symbol: "CO" },
  { key: "puente", label: "Puente (pilar/póntico)", scope: "tooth", symbol: "PT" },
  { key: "implante", label: "Implante", scope: "tooth", symbol: "IM" },
  { key: "protesis_removible", label: "Prótesis removible", scope: "tooth", symbol: "PR" },
  { key: "carilla", label: "Carilla", scope: "tooth", symbol: "CA" },
  { key: "perno", label: "Perno / poste", scope: "tooth", symbol: "PE" },
  { key: "fractura_pieza", label: "Fractura de pieza / raíz", scope: "tooth", symbol: "FR" },
  { key: "resto_radicular", label: "Resto radicular", scope: "tooth", symbol: "RR" },
  { key: "movilidad", label: "Movilidad", scope: "tooth", symbol: "MO" },
  { key: "erupcion", label: "En erupción / no erupcionado", scope: "tooth", symbol: "ER" },
  { key: "ortodoncia", label: "Aparato de ortodoncia", scope: "tooth", symbol: "OR" },
];

export const CONDITION_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.key, c.label])) as Record<string, string>;
export const CONDITION_BY_KEY = Object.fromEntries(CONDITIONS.map((c) => [c.key, c])) as Record<
  string,
  (typeof CONDITIONS)[number]
>;

export const SURFACE_LABEL: Record<ToothSurface, string> = {
  M: "Mesial",
  O: "Oclusal / incisal",
  D: "Distal",
  V: "Vestibular",
  L: "Lingual / palatino",
};

/** Filas del odontograma en notación FDI, como se ven de frente al paciente. */
export const PERMANENT_ROWS = [
  [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
];
export const PRIMARY_ROWS = [
  [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
];

export const isUpper = (tooth: number) => [1, 2, 5, 6].includes(Math.floor(tooth / 10));
/** Cuadrantes del lado derecho del paciente (izquierda del dibujo): su mesial queda a la derecha. */
export const isPatientRight = (tooth: number) => [1, 4, 5, 8].includes(Math.floor(tooth / 10));
export const isAnterior = (tooth: number) => tooth % 10 <= 3;

/**
 * Posición de cada cara dentro del diagrama de 5 zonas:
 * arriba/abajo = vestibular o lingual según la arcada; izquierda/derecha = mesial o distal según el lado.
 */
export function surfaceAt(tooth: number, pos: "top" | "bottom" | "left" | "right" | "center"): ToothSurface {
  if (pos === "center") return "O";
  if (pos === "top") return isUpper(tooth) ? "V" : "L";
  if (pos === "bottom") return isUpper(tooth) ? "L" : "V";
  if (pos === "left") return isPatientRight(tooth) ? "D" : "M";
  return isPatientRight(tooth) ? "M" : "D";
}

/** Prioridad para pintar cuando hay varios hallazgos en la misma cara. */
export const LAYER_PRIORITY: Record<FindingLayer, number> = { previo: 0, realizado: 1, propuesto: 2, patologia: 3 };
