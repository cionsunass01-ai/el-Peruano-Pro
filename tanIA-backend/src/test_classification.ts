import assert from 'assert';
import { consolidateAnalysisResults } from './services/consolidationService';
import { validateAnalysisResult } from './services/classificationValidationService';
import { isOperationallyReportable } from './services/reportPolicyService';
import {
  AnalysisResult,
  ImpactDimension,
  ImpactType,
  Norm,
  Relevance,
} from './types/domainTypes';

const pages = [{ page: 41, text: 'Texto normativo de prueba' }];

const makeNorm = (overrides: Partial<Norm> = {}): Norm => ({
  sector: 'Sector de prueba',
  normId: 'R.J. N° 000001-2026-TEST/ENTIDAD',
  title: 'Norma de prueba sobre una obligación institucional',
  publicationDate: '20/08/2026',
  summary: 'Resumen objetivo de la norma.',
  object: 'Establecer una obligación de prueba.',
  affectedSubjects: 'SUNASS como entidad pública.',
  applicationScope: 'Entidades públicas comprendidas en la norma.',
  sunassRelationship: 'Obligación concreta aplicable a SUNASS.',
  impactDimension: ImpactDimension.INSTITUCIONAL_TRANSVERSAL,
  impactType: ImpactType.DIRECTO,
  relevanceToWaterSector: Relevance.MEDIA,
  classificationReason: 'La norma impone una obligación concreta a SUNASS.',
  pageNumber: 41,
  ...overrides,
});

const makeResult = (norms: Norm[]): AnalysisResult => ({
  gazetteDate: '20/08/2026',
  norms,
  designatedAppointments: [],
  concludedAppointments: [],
});

const run = (name: string, test: () => void): void => {
  test();
  console.log(`PASS ${name}`);
};

run('A: Alta y Media son operativamente reportables', () => {
  assert.equal(isOperationallyReportable(makeNorm({ relevanceToWaterSector: Relevance.ALTA })), true);
  assert.equal(isOperationallyReportable(makeNorm({ relevanceToWaterSector: Relevance.MEDIA })), true);
});

run('A: Baja y Ninguna no son operativamente reportables', () => {
  assert.equal(isOperationallyReportable(makeNorm({
    relevanceToWaterSector: Relevance.BAJA,
  })), false);
  assert.equal(isOperationallyReportable(makeNorm({
    relevanceToWaterSector: Relevance.NINGUNA,
    impactDimension: ImpactDimension.NINGUNA,
    impactType: ImpactType.INEXISTENTE,
    sunassRelationship: 'No existe relación material con SUNASS.',
  })), false);
});

run('B: enums válidos pasan la validación', () => {
  assert.doesNotThrow(() => validateAnalysisResult(makeResult([makeNorm()]), pages));
});

run('B: enum inválido es rechazado', () => {
  const norm = makeNorm({ relevanceToWaterSector: 'No válido' as Relevance });
  assert.throws(
    () => validateAnalysisResult(makeResult([norm]), pages),
    /CLASSIFICATION_VALIDATION_ERROR/,
  );
});

run('B: campo obligatorio vacío es rechazado', () => {
  const norm = makeNorm({ object: '' });
  assert.throws(
    () => validateAnalysisResult(makeResult([norm]), pages),
    /CLASSIFICATION_VALIDATION_ERROR/,
  );
});

run('B: dimensión NINGUNA con Alta es rechazado', () => {
  const norm = makeNorm({
    impactDimension: ImpactDimension.NINGUNA,
    impactType: ImpactType.INEXISTENTE,
    relevanceToWaterSector: Relevance.ALTA,
  });
  assert.throws(
    () => validateAnalysisResult(makeResult([norm]), pages),
    /CLASSIFICATION_VALIDATION_ERROR/,
  );
});

run('B: impacto INEXISTENTE con Media es rechazado', () => {
  const norm = makeNorm({
    impactType: ImpactType.INEXISTENTE,
    relevanceToWaterSector: Relevance.MEDIA,
  });
  assert.throws(
    () => validateAnalysisResult(makeResult([norm]), pages),
    /CLASSIFICATION_VALIDATION_ERROR/,
  );
});

run('B: relevancia positiva sin relación SUNASS es rechazado', () => {
  const norm = makeNorm({ sunassRelationship: '' });
  assert.throws(
    () => validateAnalysisResult(makeResult([norm]), pages),
    /CLASSIFICATION_VALIDATION_ERROR/,
  );
});

run('B: Ninguna con INEXISTENTE es válido', () => {
  const norm = makeNorm({
    impactDimension: ImpactDimension.NINGUNA,
    impactType: ImpactType.INEXISTENTE,
    relevanceToWaterSector: Relevance.NINGUNA,
    sunassRelationship: 'No existe relación material con SUNASS.',
  });
  assert.doesNotThrow(() => validateAnalysisResult(makeResult([norm]), pages));
});

run('C: casos conceptuales son datos estructurados, no un segundo clasificador', () => {
  const conceptualCases: Norm[] = [
    makeNorm({
      title: 'Keyword sectorial sin afectación material',
      impactDimension: ImpactDimension.NINGUNA,
      impactType: ImpactType.INEXISTENTE,
      relevanceToWaterSector: Relevance.NINGUNA,
      sunassRelationship: 'No existe relación material con SUNASS.',
    }),
    makeNorm({
      title: 'Tarifa de EPS directamente aplicable',
      impactDimension: ImpactDimension.SECTORIAL,
      impactType: ImpactType.DIRECTO,
      relevanceToWaterSector: Relevance.ALTA,
      sunassRelationship: 'Afecta directamente una tarifa de una EPS regulada.',
    }),
    makeNorm({
      title: 'Obligación concreta de SERVIR aplicable a SUNASS',
      relevanceToWaterSector: Relevance.MEDIA,
    }),
    makeNorm({
      title: 'Organización interna exclusiva de SERVIR',
      impactDimension: ImpactDimension.NINGUNA,
      impactType: ImpactType.INEXISTENTE,
      relevanceToWaterSector: Relevance.NINGUNA,
      sunassRelationship: 'No existe relación material con SUNASS.',
    }),
    makeNorm({
      title: 'ROF o Manual de Cargos de otra entidad',
      impactDimension: ImpactDimension.NINGUNA,
      impactType: ImpactType.INEXISTENTE,
      relevanceToWaterSector: Relevance.NINGUNA,
      sunassRelationship: 'No existe relación material con SUNASS.',
    }),
    makeNorm({
      title: 'Obligación administrativa menor aplicable a SUNASS',
      relevanceToWaterSector: Relevance.BAJA,
    }),
  ];

  assert.doesNotThrow(() => validateAnalysisResult(makeResult(conceptualCases), pages));
});

run('D: los conflictos incluyen campos nuevos de clasificación', () => {
  const first = makeNorm({
    impactDimension: ImpactDimension.SECTORIAL,
    impactType: ImpactType.DIRECTO,
    sunassRelationship: 'Afecta directamente una EPS.',
    classificationReason: 'Impacto material sectorial.',
  });
  const second = makeNorm({
    impactDimension: ImpactDimension.INSTITUCIONAL_TRANSVERSAL,
    impactType: ImpactType.INDIRECTO,
    sunassRelationship: 'Afecta indirectamente una obligación institucional.',
    classificationReason: 'Impacto institucional moderado.',
  });
  const result = consolidateAnalysisResults([
    makeResult([first]),
    makeResult([second]),
  ]);

  assert.equal(result.norms.length, 1);
  assert.ok(result.normConflicts?.[0].conflictingFields.includes('impactDimension'));
  assert.ok(result.normConflicts?.[0].conflictingFields.includes('impactType'));
  assert.ok(result.normConflicts?.[0].conflictingFields.includes('sunassRelationship'));
  assert.ok(result.normConflicts?.[0].conflictingFields.includes('classificationReason'));
});
