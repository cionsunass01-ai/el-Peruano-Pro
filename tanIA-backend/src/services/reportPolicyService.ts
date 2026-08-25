import { Norm, Relevance } from '../types/domainTypes';

/**
 * Operational reports intentionally expose only actionable relevance levels.
 * Baja and Ninguna remain in the internal analysis result until this boundary.
 */
export const isOperationallyReportable = (norm: Norm): boolean =>
  norm.relevanceToWaterSector === Relevance.ALTA ||
  norm.relevanceToWaterSector === Relevance.MEDIA;
