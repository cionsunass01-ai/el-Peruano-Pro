import {
  AnalysisResult,
  ImpactDimension,
  ImpactType,
  Relevance,
} from '../types/domainTypes';

const REQUIRED_NORM_FIELDS = [
  'sector',
  'title',
  'publicationDate',
  'summary',
] as const;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const validationError = (message: string): Error =>
  new Error(`CLASSIFICATION_VALIDATION_ERROR: ${message}`);

/**
 * Deterministic structural validation only.
 */
export const validateAnalysisResult = (
  result: AnalysisResult,
  pagesText: Array<{ page: number; text: string }>,
): void => {
  if (!isNonEmptyString(result.gazetteDate)) {
    throw validationError('gazetteDate debe ser un string no vacío.');
  }

  if (!Array.isArray(result.norms)) {
    throw validationError('norms debe ser un arreglo.');
  }

  if (!Array.isArray(result.designatedAppointments)) {
    throw validationError('designatedAppointments debe ser un arreglo.');
  }

  if (!Array.isArray(result.concludedAppointments)) {
    throw validationError('concludedAppointments debe ser un arreglo.');
  }

  const validPages = new Set(pagesText.map((page) => page.page));

  for (const [index, norm] of (result.norms ?? []).entries()) {
    for (const field of REQUIRED_NORM_FIELDS) {
      if (!isNonEmptyString(norm[field])) {
        throw validationError(`norms[${index}].${field} debe ser un string no vacío.`);
      }
    }

    if (!Object.values(Relevance).includes(norm.relevanceToWaterSector)) {
      throw validationError(`norms[${index}].relevanceToWaterSector contiene un enum inválido.`);
    }

    if (!Number.isInteger(norm.pageNumber) || !validPages.has(norm.pageNumber)) {
      console.warn(`[WARNING] norms[${index}].pageNumber (${norm.pageNumber}) inválido. Asignando la primera página del chunk.`);
      norm.pageNumber = Array.from(validPages)[0] || 1;
    }
  }
};
