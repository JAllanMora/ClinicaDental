// cspell:words BANXICO Banxico Institucion institucion MISPEI SPEI Spei apos aacute eacute iacute oacute uacute ntilde Aacute Eacute Iacute Oacute Uacute Ntilde
import { z } from "zod";

const BANXICO_CEP_BASE_URL = "https://www.banxico.org.mx/cep";
const BANXICO_CEP_TIMEOUT_MS = 60_000;
const BANXICO_CEP_XML_MAX_LENGTH = 256_000;

const institucionSchema = z.tuple([z.string(), z.string()]);
const institucionesResponseSchema = z
  .object({
    instituciones: z.array(institucionSchema).default([]),
    institucionesMISPEI: z.array(institucionSchema).default([]),
    overrideCaptcha: z.boolean().optional(),
  })
  .passthrough();

export class BanxicoCepError extends Error {
  readonly status: 400 | 502 | 504;

  constructor(
    message: string,
    status: 400 | 502 | 504,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BanxicoCepError";
    this.status = status;
  }
}

export type BanxicoInstitucion = {
  clave: string;
  nombre: string;
};

export type BanxicoCepConsulta = {
  fecha: string;
  criterio: string;
  emisor: string;
  receptor: string;
  cuenta: string;
  monto: string;
  tipoCriterio?: string;
  receptorParticipante?: string;
  tipoConsulta?: string;
  captcha?: string;
};

export type BanxicoCepResultado = {
  encontrado: boolean;
  valido: boolean;
  captchaRequerido: boolean;
  mensaje: string;
  texto: string;
  validaciones?: BanxicoCepValidaciones;
  discrepancias?: BanxicoCepDiscrepancia[];
  html?: string;
};

export type BanxicoCepValidaciones = {
  monto: boolean;
  cuenta: boolean;
  bancoEmisor: boolean;
  bancoReceptor: boolean;
  claveRastreo: boolean;
  fecha: boolean;
};

export type BanxicoCepDiscrepancia = keyof BanxicoCepValidaciones;

type BanxicoCepXml = {
  fecha: string;
  claveRastreo: string;
  claveSpei: string;
  bancoEmisor: string;
  cuenta: string;
  monto: string;
};

function assertFechaCep(fecha: string) {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(fecha)) {
    throw new BanxicoCepError("fecha debe venir en formato DD-MM-YYYY", 400);
  }
}

function assertTexto(value: string, field: string) {
  if (!value.trim()) {
    throw new BanxicoCepError(`${field} es requerido`, 400);
  }
}

function normalizarMontoCentavos(value: string): string | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;

  const enteros = match[1].replace(/^0+(?=\d)/, "");
  const centavos = (match[2] ?? "").padEnd(2, "0");
  return `${enteros}.${centavos || "00"}`;
}

function assertMontoCep(monto: string): string {
  const centavos = normalizarMontoCentavos(monto);
  if (centavos === null) {
    throw new BanxicoCepError(
      "monto debe ser un decimal no negativo con máximo dos decimales",
      400,
    );
  }
  return centavos;
}

function normalizarCuenta(value: string): string {
  return value.trim().replace(/[\s-]/g, "");
}

function normalizarInstitucion(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripExecutableHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/g, "a")
    .replace(/&eacute;/g, "e")
    .replace(/&iacute;/g, "i")
    .replace(/&oacute;/g, "o")
    .replace(/&uacute;/g, "u")
    .replace(/&ntilde;/g, "n")
    .replace(/&Aacute;/g, "A")
    .replace(/&Eacute;/g, "E")
    .replace(/&Iacute;/g, "I")
    .replace(/&Oacute;/g, "O")
    .replace(/&Uacute;/g, "U")
    .replace(/&Ntilde;/g, "N")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getMensaje(texto: string): string {
  const noEncontrado = texto.match(/Lo sentimos,[^.]+\./i)?.[0];
  if (noEncontrado) return noEncontrado;

  const error = texto.match(/No se ingreso[^.]+\./i)?.[0];
  if (error) return error;

  if (normalizarTexto(texto).includes("Informacion del estado del pago")) {
    return "Banxico respondió información del estado del pago";
  }

  if (/Descargar CEP/i.test(texto)) {
    return "Banxico generó el CEP";
  }

  return texto.slice(0, 240);
}

function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

async function fetchBanxico(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  try {
    const response = await fetch(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(BANXICO_CEP_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new BanxicoCepError(`Banxico respondió ${response.status}`, 502);
    }
    return response;
  } catch (error) {
    if (error instanceof BanxicoCepError) throw error;
    if (isTimeoutError(error)) {
      throw new BanxicoCepError("Banxico agotó el tiempo de espera", 504, {
        cause: error,
      });
    }
    throw new BanxicoCepError("No fue posible conectar con Banxico", 502, {
      cause: error,
    });
  }
}

async function readBanxicoText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new BanxicoCepError("Banxico agotó el tiempo de espera", 504, {
        cause: error,
      });
    }
    throw new BanxicoCepError(
      "No fue posible leer la respuesta de Banxico",
      502,
      { cause: error },
    );
  }
}

function splitCombinedSetCookieHeader(value: string): string[] {
  return value.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s*=)/);
}

function getBanxicoSessionCookies(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const individualCookies = headers.getSetCookie?.() ?? [];
  const setCookieValues =
    individualCookies.length > 0
      ? individualCookies
      : splitCombinedSetCookieHeader(response.headers.get("set-cookie") ?? "");

  const cookieHeader = setCookieValues
    .map(value => value.split(";", 1)[0]?.trim())
    .filter((value): value is string => Boolean(value?.includes("=")))
    .join("; ");

  if (!cookieHeader) {
    throw new BanxicoCepError(
      "Banxico no proporcionó la sesión para descargar el CEP",
      502,
    );
  }

  return cookieHeader;
}

function decodeXmlAttribute(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|amp|quot|apos|lt|gt);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number(decimal));

      if (hexadecimal) {
        return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      }

      const namedEntities: Record<string, string> = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      };
      return namedEntities[entity.toLowerCase()] ?? entity;
    },
  );
}

function getXmlElementAttributes(
  xml: string,
  elementName: "SPEI_Tercero" | "Beneficiario" | "Ordenante",
): Record<string, string> | null {
  const element = xml.match(new RegExp(`<${elementName}\\b([^>]*)\\/?>`, "i"));
  if (!element) return null;

  const attributes: Record<string, string> = {};
  const attributePattern =
    /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of element[1].matchAll(attributePattern)) {
    attributes[match[1]] = decodeXmlAttribute(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

function requireXmlAttribute(
  attributes: Record<string, string>,
  name: string,
): string {
  const value = attributes[name]?.trim();
  if (!value) {
    throw new BanxicoCepError(
      "Banxico devolvió el XML del CEP en un formato inesperado",
      502,
    );
  }
  return value;
}

function parseBanxicoCepXml(xml: string): BanxicoCepXml {
  if (xml.length > BANXICO_CEP_XML_MAX_LENGTH) {
    throw new BanxicoCepError(
      "Banxico devolvió el XML del CEP en un formato inesperado",
      502,
    );
  }

  const tercero = getXmlElementAttributes(xml, "SPEI_Tercero");
  const beneficiario = getXmlElementAttributes(xml, "Beneficiario");
  const ordenante = getXmlElementAttributes(xml, "Ordenante");
  if (!tercero || !beneficiario || !ordenante) {
    throw new BanxicoCepError(
      "Banxico devolvió el XML del CEP en un formato inesperado",
      502,
    );
  }
  requireXmlAttribute(beneficiario, "BancoReceptor");

  return {
    fecha: requireXmlAttribute(tercero, "FechaOperacion"),
    claveRastreo: requireXmlAttribute(tercero, "claveRastreo"),
    claveSpei: requireXmlAttribute(tercero, "ClaveSPEI"),
    bancoEmisor: requireXmlAttribute(ordenante, "BancoEmisor"),
    cuenta: requireXmlAttribute(beneficiario, "Cuenta"),
    monto: requireXmlAttribute(beneficiario, "MontoPago"),
  };
}

async function descargarCepXml(
  cookieHeader: string,
  signal: AbortSignal,
): Promise<BanxicoCepXml> {
  const response = await fetchBanxico(
    `${BANXICO_CEP_BASE_URL}/descarga.do?formato=XML`,
    {
      headers: {
        Accept: "application/xml",
        Cookie: cookieHeader,
      },
      signal,
    },
  );
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.includes("application/xml") &&
    !contentType.includes("text/xml")
  ) {
    throw new BanxicoCepError(
      "Banxico devolvió el XML del CEP en un formato inesperado",
      502,
    );
  }

  return parseBanxicoCepXml(await readBanxicoText(response));
}

export async function listarInstitucionesCep(
  fecha: string,
  options: { signal?: AbortSignal } = {},
) {
  assertFechaCep(fecha);

  const url = new URL(`${BANXICO_CEP_BASE_URL}/instituciones.do`);
  url.searchParams.set("fecha", fecha);

  const response = await fetchBanxico(url, {
    headers: { Accept: "application/json" },
    signal: options.signal,
  });

  let rawData: unknown;
  try {
    rawData = await response.json();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new BanxicoCepError("Banxico agotó el tiempo de espera", 504, {
        cause: error,
      });
    }
    throw new BanxicoCepError(
      "Banxico devolvió instituciones en un formato inesperado",
      502,
      { cause: error },
    );
  }

  const parsed = institucionesResponseSchema.safeParse(rawData);
  if (!parsed.success) {
    throw new BanxicoCepError(
      "Banxico devolvió instituciones en un formato inesperado",
      502,
      { cause: parsed.error },
    );
  }
  const data = parsed.data;

  return {
    instituciones: data.instituciones.map(([clave, nombre]) => ({
      clave,
      nombre,
    })),
    institucionesMISPEI: data.institucionesMISPEI.map(([clave, nombre]) => ({
      clave,
      nombre,
    })),
    captchaRequerido: data.overrideCaptcha !== true,
  };
}

export async function consultarCepBanxico(
  consulta: BanxicoCepConsulta,
  options: { incluirHtml?: boolean } = {},
): Promise<BanxicoCepResultado> {
  assertFechaCep(consulta.fecha);
  assertTexto(consulta.criterio, "criterio");
  assertTexto(consulta.emisor, "emisor");
  assertTexto(consulta.receptor, "receptor");
  assertTexto(consulta.cuenta, "cuenta");
  assertTexto(consulta.monto, "monto");
  const montoEsperado = assertMontoCep(consulta.monto);
  const signal = AbortSignal.timeout(BANXICO_CEP_TIMEOUT_MS);

  const body = new URLSearchParams({
    tipoCriterio: consulta.tipoCriterio ?? "T",
    fecha: consulta.fecha,
    criterio: consulta.criterio.trim(),
    emisor: consulta.emisor.trim(),
    receptor: consulta.receptor.trim(),
    cuenta: consulta.cuenta.trim(),
    receptorParticipante: consulta.receptorParticipante ?? "0",
    monto: consulta.monto.trim(),
    captcha: consulta.captcha ?? "c",
    tipoConsulta: consulta.tipoConsulta ?? "1",
  });

  const response = await fetchBanxico(`${BANXICO_CEP_BASE_URL}/valida.do`, {
    method: "POST",
    headers: {
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
    signal,
  });

  const html = await readBanxicoText(response);
  const htmlSeguro = stripExecutableHtml(html);
  const texto = htmlToText(htmlSeguro);
  const textoNormalizado = normalizarTexto(`${texto} ${htmlSeguro}`);
  const captchaRequerido = /captcha|imagen de seguridad/i.test(
    textoNormalizado,
  );
  const noEncontrado =
    /Operacion no encontrada|No se ingreso correctamente|meta:stats=ERR/i.test(
      textoNormalizado,
    );
  const ofreceDescarga =
    /Descargar CEP|descarga\.do\?formato=(?:XML|PDF|ZIP)/i.test(
      textoNormalizado,
    );

  if (captchaRequerido || noEncontrado) {
    return {
      encontrado: false,
      valido: false,
      captchaRequerido,
      mensaje: getMensaje(texto),
      texto,
      ...(options.incluirHtml ? { html } : {}),
    };
  }

  if (!ofreceDescarga) {
    throw new BanxicoCepError("Banxico devolvió una respuesta inesperada", 502);
  }

  const cookieHeader = getBanxicoSessionCookies(response);
  const [cep, instituciones] = await Promise.all([
    descargarCepXml(cookieHeader, signal),
    listarInstitucionesCep(consulta.fecha, { signal }),
  ]);
  const bancoEmisorEsperado = [
    ...instituciones.instituciones,
    ...instituciones.institucionesMISPEI,
  ].find(
    institucion => institucion.clave.trim() === consulta.emisor.trim(),
  )?.nombre;
  const montoRecibido = normalizarMontoCentavos(cep.monto);

  const validaciones: BanxicoCepValidaciones = {
    monto: montoRecibido !== null && montoRecibido === montoEsperado,
    cuenta: normalizarCuenta(cep.cuenta) === normalizarCuenta(consulta.cuenta),
    bancoEmisor:
      Boolean(bancoEmisorEsperado) &&
      normalizarInstitucion(cep.bancoEmisor) ===
        normalizarInstitucion(bancoEmisorEsperado ?? ""),
    // El nombre visible puede usar alias históricos; ClaveSPEI es el código
    // estable que corresponde al banco receptor solicitado.
    bancoReceptor: cep.claveSpei.trim() === consulta.receptor.trim(),
    claveRastreo:
      cep.claveRastreo.trim().toUpperCase() ===
      consulta.criterio.trim().toUpperCase(),
    // Banxico puede registrar FechaOperacion al día siguiente de la fecha
    // usada para encontrar el CEP; no debe invalidar una operación encontrada.
    fecha: true,
  };
  const discrepancias = (
    Object.entries(validaciones) as [BanxicoCepDiscrepancia, boolean][]
  )
    .filter(([, coincide]) => !coincide)
    .map(([campo]) => campo);
  const valido = discrepancias.length === 0;

  return {
    encontrado: true,
    valido,
    captchaRequerido: false,
    validaciones,
    discrepancias,
    mensaje: valido
      ? "El CEP coincide con los datos esperados"
      : `El CEP no coincide en: ${discrepancias.join(", ")}`,
    texto,
    ...(options.incluirHtml ? { html } : {}),
  };
}
