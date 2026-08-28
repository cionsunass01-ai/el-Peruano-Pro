import { promises as fs } from 'fs';
import path from 'path';
import {
  AnalysisResult,
  Norm,
  Relevance,
} from '../types/domainTypes';
import { extractTextFromPdf } from '../services/pdfService';
import { validateAnalysisResult } from '../services/classificationValidationService';
import { consolidateAnalysisResults } from '../services/consolidationService';
import { isOperationallyReportable } from '../services/reportPolicyService';
import {
  generateAnalysisPdfBlob,
  generateCsvBlob,
} from '../services/reportGenerator';
import { generateAnalysisWordBuffer } from '../services/wordService';
import { validateManifestPageRanges } from '../services/pageMappingService';
import { analyzeChunksSequentially } from '../services/geminiExecutionService';

const PRODUCTIVE_MODEL = 'gemini-2.5-flash';

export type EvaluationPage = { page: number; text: string };

export type EvaluationAnalyzer = (
  pages: EvaluationPage[],
) => Promise<AnalysisResult>;

export interface EvaluationInput {
  totalPages: number;
  pages: EvaluationPage[];
  chunks: EvaluationPage[][];
  inputType: 'pages' | 'chunks';
}

export interface EvaluationOptions {
  inputPath: string;
  outputDir?: string;
  runId?: string;
}

export interface EvaluationOutput {
  outputDir: string;
  analysis: AnalysisResult;
  metadata: EvaluationMetadata;
}

export interface EvaluationMetadata {
  runId: string;
  evaluatedAt: string;
  inputPath: string;
  inputType: EvaluationInput['inputType'];
  model: string;
  totalPages: number;
  chunkCount: number;
  pagesProvided: number;
  counts: Record<Relevance, number>;
  reportableCount: number;
  nonReportableCount: number;
  conflictCount: number;
  conflicts: NonNullable<AnalysisResult['normConflicts']>;
}

const failInput = (message: string): Error =>
  new Error(`EVALUATION_INPUT_ERROR: ${message}`);

const failEvaluation = (message: string): Error =>
  new Error(`EVALUATION_ERROR: ${message}`);

const asNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw failInput(`${field} debe ser un string no vacío.`);
  }
  return value;
};

const validatePages = (pages: unknown, totalPages: number): EvaluationPage[] => {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw failInput('pages debe ser un arreglo no vacío.');
  }

  const seen = new Set<number>();
  return pages.map((rawPage, index) => {
    if (!rawPage || typeof rawPage !== 'object') {
      throw failInput(`pages[${index}] debe ser un objeto.`);
    }

    const page = (rawPage as { page?: unknown }).page;
    const text = (rawPage as { text?: unknown }).text;
    if (!Number.isInteger(page) || (page as number) < 1 || (page as number) > totalPages) {
      throw failInput(`pages[${index}].page debe ser una página global válida.`);
    }
    if (seen.has(page as number)) {
      throw failInput(`La página global ${page} está repetida.`);
    }
    if (typeof text !== 'string') {
      throw failInput(`pages[${index}].text debe ser un string.`);
    }

    seen.add(page as number);
    return { page: page as number, text };
  });
};

const resolveInputPath = (inputPath: string, baseDir: string): string =>
  path.isAbsolute(inputPath) ? inputPath : path.resolve(baseDir, inputPath);

const readJson = async (filePath: string): Promise<unknown> => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error: any) {
    throw failInput(`No se pudo leer JSON ${filePath}: ${error.message}`);
  }
};

const loadChunkInput = async (
  descriptor: Record<string, unknown>,
  descriptorDir: string,
  totalPages: number,
): Promise<EvaluationPage[]> => {
  const chunkPath = asNonEmptyString(descriptor.path, 'chunks[].path');
  const startPage = descriptor.startPage;
  const endPage = descriptor.endPage;
  if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) {
    throw failInput('chunks[].startPage y chunks[].endPage deben ser enteros.');
  }

  const resolvedPath = resolveInputPath(chunkPath, descriptorDir);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolvedPath);
  } catch (error: any) {
    throw failInput(`No se pudo leer el chunk ${resolvedPath}: ${error.message}`);
  }

  return extractTextFromPdf(buffer, undefined, {
    startPage: startPage as number,
    endPage: endPage as number,
    totalPages,
  });
};

export const loadEvaluationInput = async (inputPath: string): Promise<EvaluationInput> => {
  const resolvedInputPath = path.resolve(inputPath);
  const descriptor = await readJson(resolvedInputPath);
  if (!descriptor || typeof descriptor !== 'object') {
    throw failInput('La entrada debe ser un objeto JSON.');
  }

  const totalPages = (descriptor as { totalPages?: unknown }).totalPages;
  if (!Number.isInteger(totalPages) || (totalPages as number) < 1) {
    throw failInput('totalPages debe ser un entero positivo.');
  }

  const descriptorDir = path.dirname(resolvedInputPath);
  const pages = (descriptor as { pages?: unknown }).pages;
  if (pages !== undefined) {
    return {
      totalPages: totalPages as number,
      pages: validatePages(pages, totalPages as number),
      chunks: [validatePages(pages, totalPages as number)],
      inputType: 'pages',
    };
  }

  const chunks = (descriptor as { chunks?: unknown }).chunks;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw failInput('La entrada debe definir pages o chunks.');
  }

  const ranges = chunks.map((chunk, index) => {
    if (!chunk || typeof chunk !== 'object') {
      throw failInput(`chunks[${index}] debe ser un objeto.`);
    }
    const startPage = (chunk as { startPage?: unknown }).startPage;
    const endPage = (chunk as { endPage?: unknown }).endPage;
    if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) {
      throw failInput(`chunks[${index}] requiere startPage y endPage enteros.`);
    }
    return { start_page: startPage as number, end_page: endPage as number };
  });

  try {
    validateManifestPageRanges(ranges, totalPages as number);
  } catch (error: any) {
    throw failInput(error.message);
  }

  const extractedChunks = await Promise.all(
    chunks.map((chunk) => loadChunkInput(chunk as Record<string, unknown>, descriptorDir, totalPages as number)),
  );
  const extractedPages = extractedChunks.flat();

  return {
    totalPages: totalPages as number,
    pages: validatePages(extractedPages, totalPages as number),
    chunks: extractedChunks,
    inputType: 'chunks',
  };
};

const makeRunId = (): string =>
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

const countRelevance = (norms: Norm[]): Record<Relevance, number> => ({
  [Relevance.ALTA]: norms.filter((norm) => norm.relevanceToWaterSector === Relevance.ALTA).length,
  [Relevance.MEDIA]: norms.filter((norm) => norm.relevanceToWaterSector === Relevance.MEDIA).length,
  [Relevance.BAJA]: norms.filter((norm) => norm.relevanceToWaterSector === Relevance.BAJA).length,
  [Relevance.NINGUNA]: norms.filter((norm) => norm.relevanceToWaterSector === Relevance.NINGUNA).length,
});

const buildMetadata = (
  options: EvaluationOptions,
  input: EvaluationInput,
  analysis: AnalysisResult,
  runId: string,
  evaluatedAt: string,
): EvaluationMetadata => {
  const conflicts = analysis.normConflicts ?? [];
  const reportableCount = analysis.norms.filter(isOperationallyReportable).length;

  return {
    runId,
    evaluatedAt,
    inputPath: path.resolve(options.inputPath),
    inputType: input.inputType,
    model: PRODUCTIVE_MODEL,
    totalPages: input.totalPages,
    chunkCount: input.chunks.length,
    pagesProvided: input.pages.length,
    counts: countRelevance(analysis.norms),
    reportableCount,
    nonReportableCount: analysis.norms.length - reportableCount,
    conflictCount: conflicts.length,
    conflicts,
  };
};

const blobToBuffer = async (blob: Blob): Promise<Buffer> =>
  Buffer.from(await blob.arrayBuffer());

export const writeEvaluationOutputs = async (
  outputDir: string,
  analysis: AnalysisResult,
  metadata: EvaluationMetadata,
): Promise<void> => {
  await fs.mkdir(outputDir, { recursive: true });

  const fullAnalysis = {
    metadata,
    gazetteDate: analysis.gazetteDate,
    norms: analysis.norms,
    designatedAppointments: analysis.designatedAppointments,
    concludedAppointments: analysis.concludedAppointments,
    normConflicts: analysis.normConflicts ?? [],
  };
  await fs.writeFile(
    path.join(outputDir, 'analysis-full.json'),
    JSON.stringify(fullAnalysis, null, 2),
    'utf8',
  );

  const reportableNorms = analysis.norms.filter(isOperationallyReportable);
  const indiceNormas: Record<string, string> = {};
  const pdfBlob = generateAnalysisPdfBlob(analysis, `evaluation-${metadata.runId}`, indiceNormas);
  const wordBuffer = await generateAnalysisWordBuffer(analysis, `evaluation-${metadata.runId}`, indiceNormas);
  const normsCsvBlob = generateCsvBlob(
    reportableNorms,
    {
      sector: 'Sector',
      normId: 'Norma',
      title: 'Título',
      publicationDate: 'Fecha',
      summary: 'Resumen',
      relevanceToWaterSector: 'Relevancia',
      pageNumber: 'Página',
    },
  );
  const appointmentsCsvBlob = generateCsvBlob(
    [...analysis.designatedAppointments, ...analysis.concludedAppointments],
    {
      institution: 'Institución',
      personName: 'Nombre',
      position: 'Cargo',
      summary: 'Resumen',
    },
  );

  await Promise.all([
    fs.writeFile(path.join(outputDir, 'analysis-operativo.pdf'), await blobToBuffer(pdfBlob)),
    fs.writeFile(path.join(outputDir, 'analysis-operativo.docx'), wordBuffer),
    fs.writeFile(path.join(outputDir, 'normas-operativo.csv'), await blobToBuffer(normsCsvBlob)),
    fs.writeFile(path.join(outputDir, 'cargos-operativo.csv'), await blobToBuffer(appointmentsCsvBlob)),
  ]);
};

export const runEvaluation = async (
  options: EvaluationOptions,
  analyzer?: EvaluationAnalyzer,
): Promise<EvaluationOutput> => {
  const input = await loadEvaluationInput(options.inputPath);
  const selectedAnalyzer = analyzer ?? await getProductionAnalyzer();
  const chunkAnalyses = await analyzeChunksSequentially(input.chunks, {
    analyzer: selectedAnalyzer,
    onResult: (chunkAnalysis, index) => {
      // Keep the same deterministic validation boundary for injected test analyzers.
      validateAnalysisResult(chunkAnalysis, input.chunks[index]);
    },
  });

  const analysis = consolidateAnalysisResults(chunkAnalyses);
  const runId = options.runId || makeRunId();
  const evaluatedAt = new Date().toISOString();
  const outputDir = path.resolve(options.outputDir || path.join('eval-output', runId));
  const metadata = buildMetadata(options, input, analysis, runId, evaluatedAt);

  await writeEvaluationOutputs(outputDir, analysis, metadata);
  return { outputDir, analysis, metadata };
};

const getProductionAnalyzer = async (): Promise<EvaluationAnalyzer> => {
  if (!process.env.GEMINI_API_KEY) {
    throw failEvaluation(
      'GEMINI_API_KEY no está configurada; no puede realizarse una evaluación semántica real.',
    );
  }

  // Dynamic import keeps the evaluation module independent of Gemini until
  // real evaluation is explicitly requested, and never imports Gmail/Drive.
  const { analyzeGazetteText } = await import('../services/geminiService');
  return analyzeGazetteText;
};

const parseArgs = (argv: string[]): EvaluationOptions => {
  const inputIndex = argv.indexOf('--input');
  if (inputIndex < 0 || !argv[inputIndex + 1]) {
    throw failEvaluation('Uso: npm run eval -- --input <archivo.json> [--output-dir <directorio>] [--run-id <id>]');
  }

  const outputIndex = argv.indexOf('--output-dir');
  const runIndex = argv.indexOf('--run-id');
  return {
    inputPath: argv[inputIndex + 1],
    outputDir: outputIndex >= 0 ? argv[outputIndex + 1] : undefined,
    runId: runIndex >= 0 ? argv[runIndex + 1] : undefined,
  };
};

const main = async (): Promise<void> => {
  try {
    const result = await runEvaluation(parseArgs(process.argv.slice(2)));
    console.log(`Evaluación completada. Resultados locales: ${result.outputDir}`);
  } catch (error: any) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  void main();
}
