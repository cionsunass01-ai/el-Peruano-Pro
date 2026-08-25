import { AnalysisResult, Appointment, Norm, NormConflict, NormConflictField } from '../types/domainTypes';
import {
  getNormIdIdentity,
  isUsableNormId,
  normalizeNormId,
  normalizeTextForComparison,
} from '../utils/normalizeNormId';

type NormOccurrence = {
  norm: Norm;
  order: number;
};

const CONFLICT_FIELDS: NormConflictField[] = [
  'relevanceToWaterSector',
  'title',
  'sector',
  'summary',
  'publicationDate',
  'pageNumber',
  'object',
  'affectedSubjects',
  'applicationScope',
  'sunassRelationship',
  'impactDimension',
  'impactType',
  'classificationReason',
];

const fieldValue = (norm: Norm, field: NormConflictField): string => {
  const value = norm[field];
  return value == null ? '' : String(value);
};

const comparableFieldValue = (norm: Norm, field: NormConflictField): string => {
  const value = fieldValue(norm, field);
  return field === 'pageNumber' ? value.trim() : normalizeTextForComparison(value);
};

const nonEmpty = (value: unknown): boolean => String(value ?? '').trim() !== '';

const representativeScore = (norm: Norm): number => {
  const fields: Array<keyof Norm> = [
    'normId',
    'title',
    'sector',
    'publicationDate',
    'summary',
  ];

  return fields.reduce((score, field) => score + (nonEmpty(norm[field]) ? 1 : 0), 0);
};

/**
 * Selects the record used in the final report. This is a data-quality policy,
 * not a relevance policy: the most complete record wins; ties preserve the
 * first occurrence so no relevance precedence is invented.
 */
const chooseRepresentative = (occurrences: NormOccurrence[]): NormOccurrence => {
  return occurrences.reduce((selected, candidate) => {
    const selectedScore = representativeScore(selected.norm);
    const candidateScore = representativeScore(candidate.norm);

    if (candidateScore > selectedScore) return candidate;
    if (candidateScore < selectedScore) return selected;

    const selectedIdLength = selected.norm.normId?.trim().length ?? 0;
    const candidateIdLength = candidate.norm.normId?.trim().length ?? 0;
    if (candidateIdLength > selectedIdLength) return candidate;

    return candidate.order < selected.order ? candidate : selected;
  });
};

const fallbackKey = (norm: Norm): string | null => {
  const title = normalizeTextForComparison(norm.title);
  const sector = normalizeTextForComparison(norm.sector);
  const publicationDate = normalizeTextForComparison(norm.publicationDate);

  // Requiring all three fields prevents similar titles from being merged
  // when Gemini omitted the identifier or returned a malformed one.
  if (title.length < 12 || !sector || !publicationDate) return null;
  return `fallback:${title}|${sector}|${publicationDate}`;
};

const titleSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(normalizeTextForComparison(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeTextForComparison(right).split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  return intersection / new Set([...leftTokens, ...rightTokens]).size;
};

const matchingContextSignals = (left: Norm, right: Norm): number => {
  const titleMatches = titleSimilarity(left.title, right.title) >= 0.6;
  const sectorLeft = normalizeTextForComparison(left.sector);
  const sectorRight = normalizeTextForComparison(right.sector);
  const sectorMatches = Boolean(sectorLeft && sectorLeft === sectorRight);
  const dateLeft = normalizeTextForComparison(left.publicationDate);
  const dateRight = normalizeTextForComparison(right.publicationDate);
  const dateMatches = Boolean(dateLeft && dateLeft === dateRight);

  return [titleMatches, sectorMatches, dateMatches].filter(Boolean).length;
};

/**
 * A base-identity merge is deliberately narrower than complete-ID equality:
 * one side must omit the formal type, the base must include an entity/code,
 * and at least two independent context signals must agree.
 */
const canMergeByBaseIdentity = (left: Norm, right: Norm): boolean => {
  if (!isUsableNormId(left.normId) || !isUsableNormId(right.normId)) return false;

  const leftIdentity = getNormIdIdentity(left.normId);
  const rightIdentity = getNormIdIdentity(right.normId);

  if (
    !leftIdentity.base ||
    leftIdentity.base !== rightIdentity.base ||
    leftIdentity.hasFormalType === rightIdentity.hasFormalType ||
    !leftIdentity.hasDiscriminatingCode ||
    !rightIdentity.hasDiscriminatingCode
  ) {
    return false;
  }

  return matchingContextSignals(left, right) >= 2;
};

const normKey = (norm: Norm, occurrenceOrder: number): string => {
  if (isUsableNormId(norm.normId)) {
    return `id:${normalizeNormId(norm.normId)}`;
  }

  return fallbackKey(norm) ?? `unidentified:${occurrenceOrder}`;
};

const buildConflict = (
  normalizedKey: string,
  occurrences: NormOccurrence[],
  selected: NormOccurrence,
): NormConflict | null => {
  const conflictingFields: NormConflictField[] = [];
  const observedValues: Partial<Record<NormConflictField, string[]>> = {};

  for (const field of CONFLICT_FIELDS) {
    const values = new Map<string, string>();
    for (const occurrence of occurrences) {
      const comparable = comparableFieldValue(occurrence.norm, field);
      if (!values.has(comparable)) {
        values.set(comparable, fieldValue(occurrence.norm, field));
      }
    }

    // An empty value versus a populated value is also a data conflict. If all
    // occurrences are empty, there is no conflict to report.
    if (values.size > 1 && !(values.size === 1 && values.has(''))) {
      conflictingFields.push(field);
      observedValues[field] = Array.from(values.values());
    }
  }

  if (conflictingFields.length === 0) return null;

  return {
    normalizedKey,
    occurrenceCount: occurrences.length,
    conflictingFields,
    observedValues,
    selectedNormId: selected.norm.normId,
  };
};

export function consolidateAnalysisResults(results: AnalysisResult[]): AnalysisResult {
  if (results.length === 0) {
    return {
      gazetteDate: 'Fecha no encontrada',
      norms: [],
      designatedAppointments: [],
      concludedAppointments: [],
      normConflicts: [],
    };
  }

  const gazetteDate = results[results.length - 1].gazetteDate;
  const normOccurrences: NormOccurrence[] = [];
  const initialKeys: string[] = [];
  let occurrenceOrder = 0;

  for (const result of results) {
    for (const norm of result.norms ?? []) {
      normOccurrences.push({ norm, order: occurrenceOrder });
      initialKeys.push(normKey(norm, occurrenceOrder));
      occurrenceOrder += 1;
    }
  }

  const parent = normOccurrences.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] === index) return index;
    parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  const firstByInitialKey = new Map<string, number>();
  for (let index = 0; index < initialKeys.length; index += 1) {
    const key = initialKeys[index];
    const firstIndex = firstByInitialKey.get(key);
    if (firstIndex == null) firstByInitialKey.set(key, index);
    else union(firstIndex, index);
  }

  for (let left = 0; left < normOccurrences.length; left += 1) {
    for (let right = left + 1; right < normOccurrences.length; right += 1) {
      if (canMergeByBaseIdentity(normOccurrences[left].norm, normOccurrences[right].norm)) {
        union(left, right);
      }
    }
  }

  const normGroups = new Map<number, NormOccurrence[]>();
  for (let index = 0; index < normOccurrences.length; index += 1) {
    const root = find(index);
    const occurrences = normGroups.get(root) ?? [];
    occurrences.push(normOccurrences[index]);
    normGroups.set(root, occurrences);
  }

  const norms: Norm[] = [];
  const normConflicts: NormConflict[] = [];

  for (const [root, occurrences] of normGroups) {
    const selected = chooseRepresentative(occurrences);
    norms.push(selected.norm);

    const keys = new Set(
      occurrences.map((occurrence) => initialKeys[occurrence.order]),
    );
    const conflictKey = keys.size === 1
      ? initialKeys[occurrences[0].order]
      : `id-base:${getNormIdIdentity(selected.norm.normId).base || root}`;
    const conflict = buildConflict(conflictKey, occurrences, selected);
    if (conflict) normConflicts.push(conflict);
  }

  const appointmentKey = (appointment: Appointment): string =>
    `${appointment.institution}|${appointment.personName}|${appointment.position}`;

  const designatedMap = new Map<string, Appointment>();
  for (const result of results) {
    for (const appointment of result.designatedAppointments ?? []) {
      const key = appointmentKey(appointment);
      if (!designatedMap.has(key)) designatedMap.set(key, appointment);
    }
  }

  const concludedMap = new Map<string, Appointment>();
  for (const result of results) {
    for (const appointment of result.concludedAppointments ?? []) {
      const key = appointmentKey(appointment);
      if (!concludedMap.has(key)) concludedMap.set(key, appointment);
    }
  }

  return {
    gazetteDate,
    norms,
    designatedAppointments: Array.from(designatedMap.values()),
    concludedAppointments: Array.from(concludedMap.values()),
    normConflicts,
  };
}
