import assert from 'assert';
import { consolidateAnalysisResults } from './services/consolidationService';
import {
  AnalysisResult,
  ImpactDimension,
  ImpactType,
  Norm,
  Relevance,
} from './types/domainTypes';
import { normalizeNormId } from './utils/normalizeNormId';

const makeNorm = (overrides: Partial<Norm> = {}): Norm => ({
  sector: 'Sector de prueba',
  normId: 'R.J. N° 000001-2026-TEST/ENTIDAD',
  title: 'Norma de prueba sobre una materia regulatoria',
  publicationDate: '01/01/2026',
  summary: 'Resumen de prueba',
  object: 'Objeto de prueba',
  affectedSubjects: 'Sujetos de prueba',
  applicationScope: 'Ámbito de prueba',
  sunassRelationship: 'Relación material de prueba',
  impactDimension: ImpactDimension.SECTORIAL,
  impactType: ImpactType.INDIRECTO,
  relevanceToWaterSector: Relevance.MEDIA,
  classificationReason: 'Razón de clasificación de prueba',
  pageNumber: 1,
  ...overrides,
});

const makeResult = (norms: Norm[]): AnalysisResult => ({
  gazetteDate: '01/01/2026',
  norms,
  designatedAppointments: [],
  concludedAppointments: [],
});

const run = (name: string, test: () => void): void => {
  test();
  console.log(`PASS ${name}`);
};

run('A: identificadores idénticos producen un solo registro', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm()]),
    makeResult([makeNorm()]),
  ]);

  assert.equal(result.norms.length, 1);
  assert.equal(result.normConflicts?.length, 0);
});

run('B: variantes de formato producen un solo registro', () => {
  assert.equal(
    normalizeNormId('R.J. N° 000232-2026-INDECI/JEF'),
    normalizeNormId('R.J. Nº 000232-2026-INDECI/JEF'),
  );
  assert.equal(normalizeNormId('N.° 12-2026-TEST'), normalizeNormId('No. 12-2026-TEST'));

  const result = consolidateAnalysisResults([
    makeResult([makeNorm({ normId: 'R.J. N° 000232-2026-INDECI/JEF' })]),
    makeResult([makeNorm({ normId: 'R.J. Nº 000232-2026-INDECI/JEF' })]),
  ]);

  assert.equal(result.norms.length, 1);
});

run('Histórico INDECI: identificador sin tipo se fusiona con R.J.', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({
      normId: 'N° 000232-2026-INDECI/JEF',
      title: 'Aprueban el Lineamiento para la formulación de informes de emergencia',
      sector: 'INSTITUTO NACIONAL DE DEFENSA CIVIL',
      publicationDate: '20/08/2026',
      relevanceToWaterSector: Relevance.MEDIA,
      pageNumber: 41,
    })]),
    makeResult([makeNorm({
      normId: 'R.J. N° 000232-2026-INDECI/JEF',
      title: 'Aprueban el Lineamiento para la formulación de informes de emergencia',
      sector: 'INSTITUTO NACIONAL DE DEFENSA CIVIL',
      publicationDate: '20/08/2026',
      relevanceToWaterSector: Relevance.BAJA,
      pageNumber: 41,
    })]),
  ]);

  assert.equal(result.norms.length, 1);
  assert.equal(result.normConflicts?.length, 1);
  assert.ok(result.normConflicts?.[0].conflictingFields.includes('relevanceToWaterSector'));
  assert.equal(result.normConflicts?.[0].occurrenceCount, 2);
});

run('Histórico MPC: identificador sin tipo se fusiona con Ordenanza', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({
      normId: 'Nº 013-2026-MPC',
      title: 'Creación del Registro de Organizaciones Comunales de saneamiento',
      sector: 'MUNICIPALIDAD PROVINCIAL DE CAÑETE',
      publicationDate: '19/08/2026',
      pageNumber: 20,
    })]),
    makeResult([makeNorm({
      normId: 'Ordenanza N° 013-2026-MPC',
      title: 'Creación del Registro de Organizaciones Comunales de saneamiento',
      sector: 'MUNICIPALIDAD PROVINCIAL DE CAÑETE',
      publicationDate: '19/08/2026',
      relevanceToWaterSector: Relevance.ALTA,
      pageNumber: 20,
    })]),
  ]);

  assert.equal(result.norms.length, 1);
  assert.equal(result.normConflicts?.length, 1);
  assert.equal(result.normConflicts?.[0].occurrenceCount, 2);
});

run('C: relevancias distintas producen un registro y un conflicto', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({ relevanceToWaterSector: Relevance.ALTA })]),
    makeResult([makeNorm({ relevanceToWaterSector: Relevance.MEDIA })]),
  ]);

  assert.equal(result.norms.length, 1);
  assert.equal(result.normConflicts?.length, 1);
  assert.ok(result.normConflicts?.[0].conflictingFields.includes('relevanceToWaterSector'));
  // No se aplica una prioridad jurídica: con igual calidad se conserva la primera ocurrencia.
  assert.equal(result.norms[0].relevanceToWaterSector, Relevance.ALTA);
});

run('D: normas realmente distintas permanecen separadas', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({ normId: 'R.J. N° 000001-2026-TEST/ENTIDAD' })]),
    makeResult([makeNorm({ normId: 'R.J. N° 000002-2026-TEST/ENTIDAD' })]),
  ]);

  assert.equal(result.norms.length, 2);
});

run('Caso C: el mismo tipo con distinto formato se mantiene fusionado', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({ normId: 'R.J. N° 000232-2026-INDECI/JEF' })]),
    makeResult([makeNorm({ normId: 'R.J. Nº 000232-2026-INDECI/JEF' })]),
  ]);

  assert.equal(result.norms.length, 1);
});

run('Caso D: ordenanzas con números distintos permanecen separadas', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({ normId: 'Ordenanza N° 013-2026-MPC' })]),
    makeResult([makeNorm({ normId: 'Ordenanza N° 014-2026-MPC' })]),
  ]);

  assert.equal(result.norms.length, 2);
});

run('Caso E: tipos y entidades distintas permanecen separadas', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({ normId: 'Resolución N° 001-2026-ENTIDAD-A' })]),
    makeResult([makeNorm({ normId: 'Ordenanza N° 001-2026-ENTIDAD-B' })]),
  ]);

  assert.equal(result.norms.length, 2);
});

run('Caso F: mismo número y año sin entidad no activa fusión base', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({
      normId: 'N° 001-2026',
      title: 'Norma genérica sobre gestión pública',
      sector: 'Entidad A',
    })]),
    makeResult([makeNorm({
      normId: 'R.J. N° 001-2026',
      title: 'Norma genérica sobre gestión pública',
      sector: 'Entidad A',
    })]),
  ]);

  assert.equal(result.norms.length, 2);
});

run('E: identificador vacío usa fallback completo', () => {
  const common = {
    normId: '',
    title: 'Aprueban lineamientos de gestión institucional aplicables',
    sector: 'Administración Pública',
    publicationDate: '02/01/2026',
  };
  const result = consolidateAnalysisResults([
    makeResult([makeNorm(common)]),
    makeResult([makeNorm({ ...common, summary: 'Otra redacción del resumen' })]),
  ]);

  assert.equal(result.norms.length, 1);
});

run('F: títulos similares con identificadores distintos no se fusionan', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({
      normId: 'R.J. N° 000101-2026-TEST/ENTIDAD',
      title: 'Aprueban lineamientos de gestión institucional',
    })]),
    makeResult([makeNorm({
      normId: 'R.J. N° 000102-2026-TEST/ENTIDAD',
      title: 'Aprueban lineamientos de gestión institucional',
    })]),
  ]);

  assert.equal(result.norms.length, 2);
});

run('Alias de ordenanza regional se compara con ordenanza abreviada', () => {
  assert.equal(
    normalizeNormId('Ordenanza N° 003-2025-CR/GOB.REG.TACNA'),
    normalizeNormId('Ordenanza Regional Nº 003-2025-CR/GOB.REG.TACNA'),
  );
});

run('Alias de resolución de presidencia ejecutiva se compara con resolución abreviada', () => {
  assert.equal(
    normalizeNormId('Res. N° 000155-2026-SERNANP/PE'),
    normalizeNormId('Resolución de Presidencia Ejecutiva N° 000155-2026-SERNANP/PE'),
  );
});

run('Campo vacío frente a valor presente se registra como conflicto', () => {
  const result = consolidateAnalysisResults([
    makeResult([makeNorm({ summary: '' })]),
    makeResult([makeNorm({ summary: 'Resumen completado por otro chunk' })]),
  ]);

  assert.ok(result.normConflicts?.[0].conflictingFields.includes('summary'));
});
