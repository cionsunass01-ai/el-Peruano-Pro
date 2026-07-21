export enum Relevance {
  ALTA = 'Alta',
  MEDIA = 'Media',
  BAJA = 'Baja',
  NINGUNA = 'Ninguna',
}

export interface Norm {
  sector: string;
  normId: string;
  title: string;
  publicationDate: string;
  summary: string;
  relevanceToWaterSector: Relevance;
  pageNumber: number;
  url?: string;
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
}