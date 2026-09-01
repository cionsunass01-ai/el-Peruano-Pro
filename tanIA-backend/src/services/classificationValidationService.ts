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
  'object',
  'affectedSubjects',
  'applicationScope',
  'sunassRelationship',
  'classificationReason',
] as const;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const validationError = (message: string): Error =>
  new Error(`CLASSIFICATION_VALIDATION_ERROR: ${message}`);

/**
 * Deterministic structural validation only. This service deliberately does
 * not inspect keywords or attempt to replace Gemini's semantic judgment.
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

    if (!Object.values(ImpactDimension).includes(norm.impactDimension)) {
      throw validationError(`norms[${index}].impactDimension contiene un enum inválido.`);
    }

    if (!Object.values(ImpactType).includes(norm.impactType)) {
      throw validationError(`norms[${index}].impactType contiene un enum inválido.`);
    }

    if (!Number.isInteger(norm.pageNumber) || !validPages.has(norm.pageNumber)) {
      console.warn(`[WARNING] norms[${index}].pageNumber (${norm.pageNumber}) inválido. Asignando la primera página del chunk.`);
      norm.pageNumber = Array.from(validPages)[0] || 1;
    }

    // Baja is a deliberate borderline classification: the content may have
    // been worth evaluating, while still having no operational impact. It is
    // therefore valid with NINGUNA dimension and INEXISTENTE impact type.
    if (
      norm.impactDimension === ImpactDimension.NINGUNA &&
      (norm.relevanceToWaterSector === Relevance.ALTA ||
        norm.relevanceToWaterSector === Relevance.MEDIA)
    ) {
      throw validationError(
        `norms[${index}] no puede tener dimensión NINGUNA y relevancia Alta o Media.`,
      );
    }

    if (
      norm.impactType === ImpactType.INEXISTENTE &&
      (norm.relevanceToWaterSector === Relevance.ALTA ||
        norm.relevanceToWaterSector === Relevance.MEDIA)
    ) {
      throw validationError(
        `norms[${index}] no puede tener impacto INEXISTENTE y relevancia Alta o Media.`,
      );
    }

    if (
      norm.relevanceToWaterSector !== Relevance.NINGUNA &&
      !isNonEmptyString(norm.sunassRelationship)
    ) {
      throw validationError(
        `norms[${index}].sunassRelationship es obligatorio para una norma relevante.`,
      );
    }

    if (
      norm.relevanceToWaterSector === Relevance.ALTA &&
      !isNonEmptyString(norm.classificationReason)
    ) {
      throw validationError(
        `norms[${index}].classificationReason es obligatorio para Alta.`,
      );
    }
  }
};
