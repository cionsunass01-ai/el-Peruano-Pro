import assert from 'assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { compareBenchmark, RelevanceBenchmarkCase } from './eval/compareBenchmark';
import { ImpactDimension, ImpactType, Norm, Relevance } from './types/domainTypes';

const makeNorm = (overrides: Partial<Norm> = {}): Norm => ({
  sector: 'Pruebas',
  normId: 'R.J. N° 000001-2026-TEST/JEF',
  title: 'Norma de prueba',
  publicationDate: '2026-08-20',
  summary: 'Resumen',
  object: 'Objeto',
  affectedSubjects: 'Sujetos',
  applicationScope: 'Ámbito',
  sunassRelationship: 'Relación',
  impactDimension: ImpactDimension.INSTITUCIONAL_TRANSVERSAL,
  impactType: ImpactType.DIRECTO,
  relevanceToWaterSector: Relevance.ALTA,
  classificationReason: 'Razón',
  pageNumber: 1,
  ...overrides,
});

const makeCase = (overrides: Partial<RelevanceBenchmarkCase> = {}): RelevanceBenchmarkCase => ({
  caseId: 'TEST-001',
  reportDate: '2026-08-20',
  normId: 'R.J. Nº 000001-2026-TEST/JEF',
  title: 'Norma de prueba',
  expectedRelevance: Relevance.ALTA,
  expectedOperationalVisibility: true,
  provenance: 'INFERENCIA_OPERATIVA_PROVISIONAL',
  waldoFeedback: 'Caso de prueba',
  notes: 'Caso de prueba',
  ...overrides,
});

const compareOne = (norm: Norm | Norm[], benchmarkCase: RelevanceBenchmarkCase) =>
  compareBenchmark({ norms: Array.isArray(norm) ? norm : [norm] }, [benchmarkCase]).cases[0];

const run = (name: string, test: () => void): void => {
  test();
  console.log(`PASS ${name}`);
};

run('coincidencia por normId normalizado', () => {
  const result = compareOne(makeNorm(), makeCase());
  assert.equal(result.matchStatus, 'MATCHED');
  assert.equal(result.relevanceMatch, true);
});

run('clasificación correcta y visibilidad correcta', () => {
  const result = compareOne(makeNorm({ relevanceToWaterSector: Relevance.MEDIA }), makeCase({
    expectedRelevance: Relevance.MEDIA,
    expectedOperationalVisibility: true,
  }));
  assert.equal(result.relevanceMatch, true);
  assert.equal(result.visibilityMatch, true);
});

run('sobreclasificación', () => {
  const result = compareOne(makeNorm({ relevanceToWaterSector: Relevance.ALTA }), makeCase({
    expectedRelevance: Relevance.NINGUNA,
    expectedOperationalVisibility: false,
  }));
  assert.equal(result.relevanceMatch, false);
  const comparison = compareBenchmark({ norms: [makeNorm()] }, [makeCase({
    expectedRelevance: Relevance.NINGUNA,
    expectedOperationalVisibility: false,
  })]);
  assert.equal(comparison.metrics.overclassificationCount, 1);
});

run('subclasificación', () => {
  const result = compareOne(makeNorm({ relevanceToWaterSector: Relevance.BAJA }), makeCase({
    expectedRelevance: Relevance.ALTA,
    expectedOperationalVisibility: true,
  }));
  assert.equal(result.relevanceMatch, false);
  const comparison = compareBenchmark({ norms: [makeNorm({ relevanceToWaterSector: Relevance.BAJA })] }, [makeCase()]);
  assert.equal(comparison.metrics.underclassificationCount, 1);
});

run('NOT_FOUND no se interpreta como Ninguna', () => {
  const result = compareOne(makeNorm({ normId: 'R.J. N° 000999-2026-OTHER/JEF' }), makeCase());
  assert.equal(result.matchStatus, 'NOT_FOUND');
  assert.equal(result.actualRelevance, null);
  assert.equal(result.relevanceMatch, null);
});

run('AMBIGUOUS para candidatos base no resolubles', () => {
  const first = makeNorm({ normId: 'R.J. N° 000001-2026-TEST/JEF', title: 'Norma candidata' });
  const second = makeNorm({ normId: 'Ordenanza N° 000001-2026-TEST/JEF', title: 'Norma candidata' });
  const result = compareOne([first, second], makeCase({ normId: 'N° 000001-2026-TEST/JEF', title: 'Norma candidata' }));
  assert.equal(result.matchStatus, 'AMBIGUOUS');
});

run('benchmark provisional contiene nueve casos y provenance', () => {
  const benchmarkPath = path.resolve(__dirname, '../evals/relevanceBenchmark.json');
  const benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8')) as RelevanceBenchmarkCase[];
  assert.equal(benchmark.length, 9);

  const explicitCases = benchmark.filter((item) => item.provenance === 'WALDO_EXPLICITO');
  const provisionalCases = benchmark.filter(
    (item) => item.provenance === 'INFERENCIA_OPERATIVA_PROVISIONAL',
  );
  assert.equal(explicitCases.length, 1);
  assert.deepEqual(
    explicitCases.map((item) => item.caseId),
    ['WALDO-003-SMP-RESIDUOS'],
  );
  assert.equal(provisionalCases.length, 8);
  assert.deepEqual(
    provisionalCases.map((item) => item.caseId).sort(),
    [
      'WALDO-001-ANIN-EXPROPIACION',
      'WALDO-002-MEF-TRANSFERENCIA',
      'WALDO-004-INEI-REAJUSTE',
      'WALDO-005-UCAYALI-ROF',
      'WALDO-006-INDECI-EMERGENCIAS',
      'WALDO-007-SERVIR-126',
      'WALDO-008-SERVIR-127',
      'WALDO-009-SENCICO-CARGOS',
    ].sort(),
  );

  const smp = benchmark.find((item) => item.caseId === 'WALDO-003-SMP-RESIDUOS');
  assert.ok(smp);
  assert.equal(smp.expectedRelevance, Relevance.BAJA);
  assert.equal(smp.expectedOperationalVisibility, false);

  for (const item of benchmark) {
    assert.equal(item.expectedOperationalVisibility, item.expectedRelevance === Relevance.ALTA || item.expectedRelevance === Relevance.MEDIA);
  }
});

run('benchmark no es importado por clasificación ni Gemini', () => {
  const geminiSource = readFileSync(path.resolve(__dirname, 'services/geminiService.ts'), 'utf8');
  const validationSource = readFileSync(path.resolve(__dirname, 'services/classificationValidationService.ts'), 'utf8');
  assert.equal(geminiSource.includes('relevanceBenchmark'), false);
  assert.equal(validationSource.includes('relevanceBenchmark'), false);
  assert.equal(geminiSource.includes('compareBenchmark'), false);
  assert.equal(validationSource.includes('compareBenchmark'), false);
});

console.log('Benchmark tests passed.');
