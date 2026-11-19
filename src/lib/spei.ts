import "server-only";
import { listarInstitucionesCep, type BanxicoInstitucion } from "@/lib/banxico-cep";
import { todayStr } from "@/lib/agenda";

/** "2026-11-19" → "19-11-2026", el formato que pide Banxico. */
export const toBanxicoDate = (iso: string) => iso.split("-").reverse().join("-");

let cached: { at: number; banks: BanxicoInstitucion[] } | null = null;

/** Catálogo de bancos SPEI de Banxico (se guarda 12 h en memoria). */
export async function speiBanks(): Promise<BanxicoInstitucion[]> {
  if (cached && Date.now() - cached.at < 12 * 3600_000) return cached.banks;
  try {
    const r = await listarInstitucionesCep(toBanxicoDate(todayStr()), { signal: AbortSignal.timeout(15_000) });
    const banks = [...r.instituciones, ...r.institucionesMISPEI]
      .filter((b, i, all) => all.findIndex((x) => x.clave === b.clave) === i)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    cached = { at: Date.now(), banks };
    return banks;
  } catch {
    return cached?.banks ?? [];
  }
}

export const DISCREPANCY_LABEL: Record<string, string> = {
  monto: "monto",
  cuenta: "cuenta receptora",
  bancoEmisor: "banco que envía",
  bancoReceptor: "banco receptor",
  claveRastreo: "clave de rastreo",
  fecha: "fecha",
};
