import { promises as fs } from 'fs';
import path from 'path';
import {
  AnalysisResult,
  Norm,
  Relevance,
} from '../types/domainTypes';
import {
  getNormIdIdentity,
  isUsableNormId,
  normalizeNormId,
  normalizeTextForComparison,
} from '../utils/normalizeNormId';
import { isOperationallyReportable } from '../services/reportPolicyService';

export type BenchmarkProvenance =
  | 'WALDO_EXPLICITO'
  | 'INFERENCIA_OPERATIVA_PROVISIONAL';

export type BenchmarkMatchStatus = 'MATCHED' | 'NOT_FOUND' | 'AMBIGUOUS';

export interface RelevanceBenchmarkCase {
  caseId: string;
  reportDate: string;
  normId: string;
  title: string;
  expectedRelevance: Relevance;
  expectedOperationalVisibility: boolean;
  provenance: BenchmarkProvenance;
  waldoFeedback: string;
  notes: string;
}

export interface BenchmarkCaseResult {
  caseId: string;
  reportDate: string;
  normId: string;
  expectedRelevance: Relevance;
  actualRelevance: Relevance | null;
  relevanceMatch: boolean | null;
  expectedOperationalVisibility: boolean;
  actualOperationalVisibility: boolean | null;
  visibilityMatch: boolean | null;
  matchedNormId: string | null;
  matchStatus: BenchmarkMatchStatus;
  provenance: BenchmarkProvenance;
}

export interface BenchmarkMetrics {
  totalCases: number;
  matchedCases: number;
  notFoundCases: number;
  ambiguousCases: number;
  exactRelevanceMatches: number;
  relevanceAccuracy: number | null;
  visibilityMatches: number;
  visibilityAccuracy: number | null;
  overclassificationCount: number;
  underclassificationCount: number;
}

export interface BenchmarkComparison {
  generatedAt: string;
  metrics: BenchmarkMetrics;
  cases: BenchmarkCaseResult[];
}

interface AnalysisFile {
  norms?: unknown;
}

const relevanceOrder: Record<Relevance, number> = {
  [Relevance.NINGUNA]: 0,
  [Relevance.BAJA]: 1,
  [Relevance.MEDIA]: 2,
  [Relevance.ALTA]: 3,
};

const isRelevance = (value: unknown): value is Relevance =>
  Object.values(Relevance).includes(value as Relevance);

const assertBenchmarkCase = (value: unknown, index: number): RelevanceBenchmarkCase => {
  if (!value || typeof value !== 'object') {
    throw new Error(`BENCHMARK_INPUT_ERROR: cases[${index}] debe ser un objeto.`);
  }
  const candidate = value as Partial<RelevanceBenchmarkCase>;
  const requiredStrings: Array<keyof RelevanceBenchmarkCase> = [
    'caseId',
    'reportDate',
    'normId',
    'title',
    'waldoFeedback',
    'notes',
  ];
  for (const field of requiredStrings) {
    if (typeof candidate[field] !== 'string' || candidate[field]!.trim() === '') {
      throw new Error(`BENCHMARK_INPUT_ERROR: cases[${index}].${field} debe ser un string no vacío.`);
    }
  }
  if (!isRelevance(candidate.expectedRelevance)) {
    throw new Error(`BENCHMARK_INPUT_ERROR: cases[${index}].expectedRelevance no es válida.`);
  }
  if (typeof candidate.expectedOperationalVisibility !== 'boolean') {
    throw new Error(`BENCHMARK_INPUT_ERROR: cases[${index}].expectedOperationalVisibility debe ser booleano.`);
  }
  const derivedVisibility = candidate.expectedRelevance === Relevance.ALTA ||
    candidate.expectedRelevance === Relevance.MEDIA;
  if (candidate.expectedOperationalVisibility !== derivedVisibility) {
    throw new Error(`BENCHMARK_INPUT_ERROR: cases[${index}].expectedOperationalVisibility no coincide con expectedRelevance.`);
  }
  if (
    candidate.provenance !== 'WALDO_EXPLICITO' &&
    candidate.provenance !== 'INFERENCIA_OPERATIVA_PROVISIONAL'
  ) {
    throw new Error(`BENCHMARK_INPUT_ERROR: cases[${index}].provenance no es válida.`);
  }
  return candidate as RelevanceBenchmarkCase;
};

const normalizeDate = (value: string | undefined): string => {
  const raw = (value ?? '').trim();
  const iso = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const local = /^(\d{2})[-/]?(\d{2})[-/]?(\d{4})$/.exec(raw);
  if (local) return `${local[3]}${local[2]}${local[1]}`;
  return raw.replace(/[^0-9]/g, '');
};

const titleSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(normalizeTextForComparison(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeTextForComparison(right).split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection);
};

const getNorms = (analysis: AnalysisResult | AnalysisFile): Norm[] => {
  if (!Array.isArray(analysis.norms)) {
    throw new Error('ANALYSIS_INPUT_ERROR: analysis-full.json debe contener norms[].');
  }
  return analysis.norms as Norm[];
};

const findByIdentity = (benchmarkCase: RelevanceBenchmarkCase, norms: Norm[]): Norm[] => {
  const benchmarkId = getNormIdIdentity(benchmarkCase.normId);
  const usableBenchmarkId = isUsableNormId(benchmarkCase.normId);

  if (usableBenchmarkId && benchmarkId.complete) {
    const exactMatches = norms.filter(
      (norm) => isUsableNormId(norm.normId) && normalizeNormId(norm.normId) === benchmarkId.complete,
    );
    if (exactMatches.length > 0) return exactMatches;
  }

  if (!usableBenchmarkId || !benchmarkId.base || !benchmarkId.hasDiscriminatingCode) {
    return [];
  }

  const baseMatches = norms.filter((norm) => {
    if (!isUsableNormId(norm.normId)) return false;
    const identity = getNormIdIdentity(norm.normId);
    if (!identity.hasDiscriminatingCode || identity.base !== benchmarkId.base) return false;
    // Base identity is an additional fallback only when at least one side
    // omitted its formal type. Two different explicit formal types are not
    // merged by the evaluator.
    return !benchmarkId.hasFormalType || !identity.hasFormalType;
  });

  if (baseMatches.length <= 1) return baseMatches;

  const scored = baseMatches
    .map((norm) => ({ norm, score: titleSimilarity(benchmarkCase.title, norm.title) }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const second = scored[1];
  if (best.score >= 0.55 && best.score > second.score + 0.1) return [best.norm];
  return baseMatches;
};

const findBySafeTitleFallback = (
  benchmarkCase: RelevanceBenchmarkCase,
  norms: Norm[],
): Norm[] => {
  const benchmarkDate = normalizeDate(benchmarkCase.reportDate);
  if (!benchmarkDate) return [];
  return norms.filter((norm) => {
    if (isUsableNormId(norm.normId)) return false;
    return normalizeDate(norm.publicationDate) === benchmarkDate &&
      normalizeTextForComparison(norm.title) === normalizeTextForComparison(benchmarkCase.title);
  });
};

const matchCase = (benchmarkCase: RelevanceBenchmarkCase, norms: Norm[]) => {
  let candidates = findByIdentity(benchmarkCase, norms);
  if (candidates.length === 0) candidates = findBySafeTitleFallback(benchmarkCase, norms);

  if (candidates.length !== 1) {
    return {
      matchStatus: candidates.length === 0 ? 'NOT_FOUND' as const : 'AMBIGUOUS' as const,
      norm: null,
    };
  }
  return { matchStatus: 'MATCHED' as const, norm: candidates[0] };
};

export const compareBenchmark = (
  analysis: AnalysisResult | AnalysisFile,
  benchmark: RelevanceBenchmarkCase[],
): BenchmarkComparison => {
  const norms = getNorms(analysis);
  const validatedBenchmark = benchmark.map(assertBenchmarkCase);
  const cases = validatedBenchmark.map((benchmarkCase): BenchmarkCaseResult => {
    const match = matchCase(benchmarkCase, norms);
    const actualRelevance = match.norm && isRelevance(match.norm.relevanceToWaterSector)
      ? match.norm.relevanceToWaterSector
      : null;
    const actualOperationalVisibility = match.norm
      ? isOperationallyReportable(match.norm)
      : null;

    return {
      caseId: benchmarkCase.caseId,
      reportDate: benchmarkCase.reportDate,
      normId: benchmarkCase.normId,
      expectedRelevance: benchmarkCase.expectedRelevance,
      actualRelevance,
      relevanceMatch: match.matchStatus === 'MATCHED' && actualRelevance !== null
        ? actualRelevance === benchmarkCase.expectedRelevance
        : null,
      expectedOperationalVisibility: benchmarkCase.expectedOperationalVisibility,
      actualOperationalVisibility,
      visibilityMatch: match.matchStatus === 'MATCHED'
        ? actualOperationalVisibility === benchmarkCase.expectedOperationalVisibility
        : null,
      matchedNormId: match.norm?.normId ?? null,
      matchStatus: match.matchStatus,
      provenance: benchmarkCase.provenance,
    };
  });

  const matched = cases.filter((item) => item.matchStatus === 'MATCHED');
  const exactRelevanceMatches = matched.filter((item) => item.relevanceMatch === true).length;
  const visibilityMatches = matched.filter((item) => item.visibilityMatch === true).length;
  const overclassificationCount = matched.filter((item) =>
    item.actualRelevance !== null &&
    relevanceOrder[item.actualRelevance] > relevanceOrder[item.expectedRelevance],
  ).length;
  const underclassificationCount = matched.filter((item) =>
    item.actualRelevance !== null &&
    relevanceOrder[item.actualRelevance] < relevanceOrder[item.expectedRelevance],
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      totalCases: cases.length,
      matchedCases: matched.length,
      notFoundCases: cases.filter((item) => item.matchStatus === 'NOT_FOUND').length,
      ambiguousCases: cases.filter((item) => item.matchStatus === 'AMBIGUOUS').length,
      exactRelevanceMatches,
      relevanceAccuracy: matched.length > 0 ? exactRelevanceMatches / matched.length : null,
      visibilityMatches,
      visibilityAccuracy: matched.length > 0 ? visibilityMatches / matched.length : null,
      overclassificationCount,
      underclassificationCount,
    },
    cases,
  };
};

const readJson = async (filePath: string): Promise<unknown> => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error: any) {
    throw new Error(`INPUT_ERROR: no se pudo leer ${filePath}: ${error.message}`);
  }
};

const loadBenchmark = (value: unknown): RelevanceBenchmarkCase[] => {
  if (!Array.isArray(value)) {
    throw new Error('BENCHMARK_INPUT_ERROR: el benchmark debe ser un arreglo.');
  }
  return value.map(assertBenchmarkCase);
};

const parseArgs = (argv: string[]): { analysisPath: string; benchmarkPath: string; outputPath?: string } => {
  const readArg = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const analysisPath = readArg('--analysis');
  const benchmarkPath = readArg('--benchmark');
  if (!analysisPath || !benchmarkPath) {
    throw new Error('Uso: npm run benchmark:compare -- --analysis <analysis-full.json> --benchmark <relevanceBenchmark.json> [--output <benchmark-result.json>]');
  }
  return { analysisPath, benchmarkPath, outputPath: readArg('--output') };
};

const printSummary = (comparison: BenchmarkComparison): void => {
  const { metrics } = comparison;
  console.log(`${metrics.exactRelevanceMatches} de ${metrics.totalCases} casos provisionales coincidieron`);
  console.log(`MATCHED: ${metrics.matchedCases} | NOT_FOUND: ${metrics.notFoundCases} | AMBIGUOUS: ${metrics.ambiguousCases}`);
  console.log(`Exactitud de relevancia (MATCHED): ${metrics.relevanceAccuracy === null ? 'N/A' : `${(metrics.relevanceAccuracy * 100).toFixed(1)}%`}`);
  console.log(`Coincidencias de visibilidad (MATCHED): ${metrics.visibilityMatches} | Exactitud: ${metrics.visibilityAccuracy === null ? 'N/A' : `${(metrics.visibilityAccuracy * 100).toFixed(1)}%`}`);
  console.log(`Sobreclasificaciones: ${metrics.overclassificationCount} | Subclasificaciones: ${metrics.underclassificationCount}`);
  for (const item of comparison.cases) {
    console.log(`${item.caseId}: ${item.matchStatus} | esperado=${item.expectedRelevance} | actual=${item.actualRelevance ?? 'N/A'} | normId=${item.matchedNormId ?? 'N/A'}`);
  }
};

const main = async (): Promise<void> => {
  try {
    const args = parseArgs(process.argv.slice(2));
    const analysisPath = path.resolve(args.analysisPath);
    const benchmarkPath = path.resolve(args.benchmarkPath);
    const analysis = await readJson(analysisPath) as AnalysisFile;
    const benchmark = loadBenchmark(await readJson(benchmarkPath));
    const comparison = compareBenchmark(analysis, benchmark);
    const outputPath = path.resolve(args.outputPath || path.join(path.dirname(analysisPath), 'benchmark-result.json'));
    await fs.writeFile(outputPath, JSON.stringify(comparison, null, 2), 'utf8');
    printSummary(comparison);
    console.log(`Resultado guardado en: ${outputPath}`);
  } catch (error: any) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  void main();
}
