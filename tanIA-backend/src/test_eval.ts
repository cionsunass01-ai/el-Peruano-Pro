import assert from 'assert';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  runEvaluation,
  type EvaluationAnalyzer,
} from './eval/runEvaluation';
import {
  AnalysisResult,
  ImpactDimension,
  ImpactType,
  Norm,
  Relevance,
} from './types/domainTypes';

const run = async (name: string, test: () => Promise<void>): Promise<void> => {
  await test();
  console.log(`PASS ${name}`);
};

const makeNorm = (overrides: Partial<Norm> = {}): Norm => ({
  sector: 'Sector de prueba',
  normId: 'R.J. N° 000001-2026-TEST/ENTIDAD',
  title: 'Norma de prueba sobre una obligación institucional',
  publicationDate: '20/08/2026',
  summary: 'Resumen objetivo de prueba.',
  object: 'Establecer una obligación de prueba.',
  affectedSubjects: 'SUNASS como entidad pública.',
  applicationScope: 'Entidades públicas comprendidas.',
  sunassRelationship: 'Obligación concreta aplicable a SUNASS.',
  impactDimension: ImpactDimension.INSTITUCIONAL_TRANSVERSAL,
  impactType: ImpactType.DIRECTO,
  relevanceToWaterSector: Relevance.MEDIA,
  classificationReason: 'La norma impone una obligación concreta a SUNASS.',
  pageNumber: 1,
  ...overrides,
});

const makeAnalysis = (): AnalysisResult => ({
  gazetteDate: '20/08/2026',
  norms: [
    makeNorm({
      normId: 'R.J. N° 000001-2026-TEST/ALTA',
      title: 'Tarifa de EPS directamente aplicable',
      object: 'Modificar una tarifa de EPS regulada.',
      affectedSubjects: 'EPS, SUNASS y usuarios.',
      applicationScope: 'EPS bajo el ámbito de SUNASS.',
      sunassRelationship: 'Afecta directamente una tarifa regulada por SUNASS.',
      impactDimension: ImpactDimension.SECTORIAL,
      impactType: ImpactType.DIRECTO,
      relevanceToWaterSector: Relevance.ALTA,
      classificationReason: 'Produce un impacto material en una tarifa de EPS.',
    }),
    makeNorm({
      normId: 'R.J. N° 000002-2026-TEST/MEDIA',
      title: 'Obligación institucional concreta',
      relevanceToWaterSector: Relevance.MEDIA,
    }),
    makeNorm({
      normId: 'R.J. N° 000003-2026-TEST/BAJA',
      title: 'Obligación administrativa menor aplicable',
      relevanceToWaterSector: Relevance.BAJA,
      classificationReason: 'Existe una relación material de baja utilidad operativa.',
    }),
    makeNorm({
      normId: 'R.J. N° 000004-2026-TEST/NINGUNA',
      title: 'Organización interna de otra entidad',
      impactDimension: ImpactDimension.NINGUNA,
      impactType: ImpactType.INEXISTENTE,
      relevanceToWaterSector: Relevance.NINGUNA,
      sunassRelationship: 'No existe relación material con SUNASS.',
      classificationReason: 'La norma regula exclusivamente a otra entidad.',
    }),
    makeNorm({
      normId: 'R.J. N° 000001-2026-TEST/ALTA',
      title: 'Tarifa de EPS directamente aplicable',
      relevanceToWaterSector: Relevance.MEDIA,
      impactType: ImpactType.INDIRECTO,
      sunassRelationship: 'La norma también fue descrita como una obligación indirecta.',
      classificationReason: 'Descripción contradictoria del impacto para probar conflictos.',
    }),
  ],
  designatedAppointments: [],
  concludedAppointments: [],
});

const makeFixture = async (directory: string): Promise<string> => {
  const inputPath = path.join(directory, 'fixture.json');
  await fs.writeFile(inputPath, JSON.stringify({
    totalPages: 1,
    pages: [{ page: 1, text: 'Texto legal de evaluación.' }],
  }));
  return inputPath;
};

const fakeAnalyzer: EvaluationAnalyzer = async () => makeAnalysis();

(async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tania-eval-test-'));
  try {
    const inputPath = await makeFixture(tempDir);
    const outputDir = path.join(tempDir, 'output');

    await run('A/B: runner aislado sin Gmail, Drive, manifests ni scraper', async () => {
      const source = await fs.readFile(path.join(__dirname, 'eval', 'runEvaluation.ts'), 'utf8');
      assert.equal(/from ['"].*gmailService/.test(source), false);
      assert.equal(/from ['"].*driveService/.test(source), false);
      assert.equal(/from ['"].*worker/.test(source), false);
      assert.equal(/from ['"].*scraper/.test(source), false);
    });

    await run('C/D/F: analysis-full conserva las cuatro categorías y salidas operativas', async () => {
      const result = await runEvaluation({ inputPath, outputDir, runId: 'test-run' }, fakeAnalyzer);
      const full = JSON.parse(await fs.readFile(path.join(outputDir, 'analysis-full.json'), 'utf8'));
      const normsCsv = await fs.readFile(path.join(outputDir, 'normas-operativo.csv'), 'utf8');

      assert.equal(full.norms.length, 4);
      assert.equal(full.metadata.chunkCount, 1);
      assert.equal(full.metadata.counts[Relevance.ALTA], 1);
      assert.equal(full.metadata.counts[Relevance.MEDIA], 1);
      assert.equal(full.metadata.counts[Relevance.BAJA], 1);
      assert.equal(full.metadata.counts[Relevance.NINGUNA], 1);
      assert.equal(full.metadata.reportableCount, 2);
      assert.equal(full.metadata.nonReportableCount, 2);
      assert.equal(full.metadata.conflictCount, 1);
      assert.ok(result.analysis.normConflicts?.length === 1);

      assert.ok(normsCsv.includes('000001-2026-TEST/ALTA'));
      assert.ok(normsCsv.includes('000002-2026-TEST/MEDIA'));
      assert.equal(normsCsv.includes('000003-2026-TEST/BAJA'), false);
      assert.equal(normsCsv.includes('000004-2026-TEST/NINGUNA'), false);

      for (const fileName of [
        'analysis-operativo.pdf',
        'analysis-operativo.docx',
        'normas-operativo.csv',
        'cargos-operativo.csv',
      ]) {
        const stat = await fs.stat(path.join(outputDir, fileName));
        assert.ok(stat.size > 0, `${fileName} debe tener contenido.`);
      }
    });

    await run('G: entrada local inválida falla claramente', async () => {
      const invalidPath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(invalidPath, JSON.stringify({ totalPages: 0, pages: [] }));
      await assert.rejects(
        () => runEvaluation({ inputPath: invalidPath, outputDir: path.join(tempDir, 'invalid-output') }, fakeAnalyzer),
        /EVALUATION_INPUT_ERROR/,
      );
    });

    await run('H: ausencia de GEMINI_API_KEY produce error controlado', async () => {
      const previousKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        await assert.rejects(
          () => runEvaluation({ inputPath, outputDir: path.join(tempDir, 'no-key') }),
          /GEMINI_API_KEY no está configurada/,
        );
      } finally {
        if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previousKey;
      }
    });

    console.log('PASS: no se modifican manifests ni se envían correos porque el runner no importa esos servicios.');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
