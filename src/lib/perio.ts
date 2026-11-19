import type { PerioData } from "@/lib/database.types";
import { PERMANENT_ROWS, PRIMARY_ROWS, isPatientRight } from "@/lib/odontogram";

export type Site = "MV" | "V" | "DV" | "ML" | "L" | "DL";
export const BUCCAL: Site[] = ["DV", "V", "MV"];
export const LINGUAL: Site[] = ["DL", "L", "ML"];

/** Orden de los sitios de izquierda a derecha en el dibujo (el distal mira hacia afuera). */
export function sitesInOrder(tooth: number, side: "V" | "L"): Site[] {
  const base = side === "V" ? BUCCAL : LINGUAL;
  return isPatientRight(tooth) ? base : [...base].reverse();
}

export function perioRows(dentition: "permanente" | "temporal") {
  return dentition === "permanente" ? PERMANENT_ROWS : PRIMARY_ROWS;
}

export function perioSummary(data: PerioData) {
  let sites = 0;
  let bop = 0;
  let sup = 0;
  let pdSum = 0;
  let pdCount = 0;
  let deep4 = 0;
  let deep6 = 0;
  let calSum = 0;
  let calCount = 0;
  let teeth = 0;
  for (const tooth of Object.values(data)) {
    if (tooth.missing) continue;
    const entries = Object.values(tooth.sites ?? {});
    if (entries.length) teeth++;
    for (const s of entries) {
      if (!s) continue;
      sites++;
      if (s.bop) bop++;
      if (s.sup) sup++;
      if (typeof s.pd === "number") {
        pdSum += s.pd;
        pdCount++;
        if (s.pd >= 4) deep4++;
        if (s.pd >= 6) deep6++;
        calSum += s.pd + (s.rec ?? 0);
        calCount++;
      }
    }
  }
  return {
    teeth,
    sites,
    bopPct: sites ? Math.round((bop / sites) * 100) : 0,
    sup,
    meanPd: pdCount ? Math.round((pdSum / pdCount) * 10) / 10 : 0,
    meanCal: calCount ? Math.round((calSum / calCount) * 10) / 10 : 0,
    deep4,
    deep6,
  };
}

export function pdTone(pd: number | null | undefined) {
  if (pd == null) return "";
  if (pd >= 6) return "bg-red-100 text-red-800";
  if (pd >= 4) return "bg-amber-100 text-amber-800";
  return "";
}
