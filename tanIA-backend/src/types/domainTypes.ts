export enum Relevance {
  ALTA = 'Alta',
  MEDIA = 'Media',
  BAJA = 'Baja',
  NINGUNA = 'Ninguna',
}

export enum ImpactDimension {
  SECTORIAL = 'SECTORIAL',
  INSTITUCIONAL_TRANSVERSAL = 'INSTITUCIONAL_TRANSVERSAL',
  AMBAS = 'AMBAS',
  NINGUNA = 'NINGUNA',
}

export enum ImpactType {
  DIRECTO = 'DIRECTO',
  INDIRECTO = 'INDIRECTO',
  INEXISTENTE = 'INEXISTENTE',
}

export interface Norm {
  sector: string;
  normId: string;
  title: string;
  publicationDate: string;
  summary: string;
  object: string;
  affectedSubjects: string;
  applicationScope: string;
  sunassRelationship: string;
  impactDimension: ImpactDimension;
  impactType: ImpactType;
  relevanceToWaterSector: Relevance;
  classificationReason: string;
  pageNumber: number;
  url?: string;
}

export type NormConflictField =
  | 'relevanceToWaterSector'
  | 'title'
  | 'sector'
  | 'summary'
  | 'publicationDate'
  | 'pageNumber'
  | 'object'
  | 'affectedSubjects'
  | 'applicationScope'
  | 'sunassRelationship'
  | 'impactDimension'
  | 'impactType'
  | 'classificationReason';

export interface NormConflict {
  normalizedKey: string;
  occurrenceCount: number;
  conflictingFields: NormConflictField[];
  observedValues: Partial<Record<NormConflictField, string[]>>;
  selectedNormId: string;
}

export interface Appointment {
  institution: string;
  personName: string;
  position: string;
  summary: string;
}

export interface AnalysisResult {
  gazetteDate: string;
  norms: Norm[];
  designatedAppointments: Appointment[];
  concludedAppointments: Appointment[];
  /** Internal diagnostic data; ignored by report generators. */
  normConflicts?: NormConflict[];
}
