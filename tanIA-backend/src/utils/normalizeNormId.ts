/**
 * Normaliza texto libre para comparar títulos, sectores y fechas en el
 * fallback de deduplicación. No se utiliza como identificador jurídico.
 */
export const normalizeTextForComparison = (value: string | null | undefined): string => {
  if (value == null) return '';

  return String(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Normaliza identificadores de normas únicamente en aspectos de formato:
 * - mayúsculas y acentos;
 * - abreviaturas jurídicas frecuentes (R.J., D.S., R.M., etc.);
 * - variantes de numeración N°, Nº, N.°, No.;
 * - espacios alrededor de guiones y barras;
 * - alias explícitos de Ordenanza Regional/Municipal y Resolución de
 *   Presidencia Ejecutiva.
 *
 * No elimina números, años, códigos de entidad, guiones ni barras, porque
 * esos componentes pueden distinguir normas distintas.
 */
export const normalizeNormId = (id: string | null | undefined): string => {
  if (id == null) return '';

  let normalized = String(id)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  normalized = normalized
    .replace(/\bD\s*\.?\s*S\s*\.?(?=\s|N|$)/g, 'DECRETO SUPREMO')
    .replace(/\bR\s*\.?\s*S\s*\.?(?=\s|N|$)/g, 'RESOLUCION SUPREMA')
    .replace(/\bR\s*\.?\s*M\s*\.?(?=\s|N|$)/g, 'RESOLUCION MINISTERIAL')
    .replace(/\bR\s*\.?\s*J\s*\.?(?=\s|N|$)/g, 'RESOLUCION JEFATURAL')
    .replace(/\bR\s*\.?\s*D\s*\.?(?=\s|N|$)/g, 'RESOLUCION DIRECTORAL')
    .replace(/\bR\s*\.?\s*A\s*\.?(?=\s|N|$)/g, 'RESOLUCION ADMINISTRATIVA')
    .replace(/\bRES\s*\.?(?=\s*N|\s+\d|$)/g, 'RESOLUCION')
    .replace(/\bRESOLUCION\s+DE\s+PRESIDENCIA\s+EJECUTIVA\b/g, 'RESOLUCION')
    .replace(/\bORDENANZA\s+(?:REGIONAL|MUNICIPAL)\b/g, 'ORDENANZA')
    .replace(/\bN\s*(?:\.\s*)?[°º]\s*/g, 'N°')
    .replace(/\bNO\.?\s*/g, 'N°')
    .replace(/\bN°\s*/g, 'N°')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
};

const FORMAL_TYPE_PREFIX = /^(?:ACUERDO(?:\s+DE)?|DECRETO(?:\s+SUPREMO|\s+LEGISLATIVO|\s+LEY|\s+DE\s+URGENCIA)?|DIRECTIVA|LEY|ORDENANZA|RESOLUCION(?:\s+SUPREMA|\s+MINISTERIAL|\s+JEFATURAL|\s+DIRECTORAL|\s+ADMINISTRATIVA)?)\s+/;

export interface NormIdIdentity {
  /** Complete normalized identity, including the formal type when present. */
  complete: string;
  /** Number + year + entity/code, without the formal type or N° marker. */
  base: string;
  /** Whether the complete identity contained a recognized formal type. */
  hasFormalType: boolean;
  /** Whether the base contains a sufficiently discriminating entity/code suffix. */
  hasDiscriminatingCode: boolean;
}

/**
 * Returns a conservative identity decomposition for duplicate comparison.
 * The base is never used alone: callers must combine it with contextual
 * signals before merging records.
 */
export const getNormIdIdentity = (
  id: string | null | undefined,
): NormIdIdentity => {
  const complete = normalizeNormId(id);
  const withoutFormalType = complete.replace(FORMAL_TYPE_PREFIX, '').trim();
  const base = withoutFormalType.replace(/^N°\s*/, '').trim();
  const suffixMatch = /^\d{1,}-\d{4}-(.+)$/.exec(base);
  const suffix = suffixMatch?.[1] ?? '';
  const hasDiscriminatingCode =
    suffix.length >= 3 && /[A-Z]/.test(suffix) && /[A-Z0-9]/.test(suffix);

  return {
    complete,
    base,
    hasFormalType: withoutFormalType !== complete,
    hasDiscriminatingCode,
  };
};

const DEFECTIVE_NORM_ID = /^(?:-|N\/?A|S\/?N|SIN IDENTIFICADOR|SIN NUMERO|NO IDENTIFICADO|DESCONOCIDO|UNKNOWN|UNDEFINED|NULL)$/;

/** Returns false only for empty, placeholder or clearly non-norm identifiers. */
export const isUsableNormId = (id: string | null | undefined): boolean => {
  const normalized = normalizeNormId(id);
  if (!normalized || DEFECTIVE_NORM_ID.test(normalized)) return false;
  if (normalized.length < 4) return false;

  return /(?:N°|LEY|DECRETO|RESOLUCION|ORDENANZA|DIRECTIVA|\d{2,})/.test(normalized);
};
