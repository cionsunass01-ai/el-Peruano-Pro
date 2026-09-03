import { analyzeGazetteText } from './geminiService';
import type { AnalysisResult } from '../types/domainTypes';

export const GEMINI_INTER_CALL_DELAY_MS = 62_000;
export const GEMINI_MAX_RETRIES = 5;
export const GEMINI_RETRY_INITIAL_DELAY_MS = 30_000;

type Page = { page: number; text: string };
export type GeminiChunkAnalyzer = (pages: Page[]) => Promise<AnalysisResult>;
export type Sleep = (milliseconds: number) => Promise<void>;

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const errorStatusValues = (error: any): string[] => [
  error?.status,
  error?.code,
  error?.error?.status,
  error?.error?.code,
  error?.response?.status,
].filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
  .map((value) => String(value).toUpperCase());

/** Only transient Gemini capacity/rate-limit failures are retryable. */
export const isTransientGeminiError = (error: any): boolean => {
  const statuses = errorStatusValues(error);
  if (statuses.some((status) => ['8', '429', '503', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'OVERLOADED', 'TOO_MANY_REQUESTS'].includes(status))) {
    return true;
  }

  const message = String(error?.message ?? '').toUpperCase();
  return [
    'RESOURCE_EXHAUSTED',
    'SERVICE UNAVAILABLE',
    'TOO MANY REQUESTS',
    'RATE LIMIT',
    'RATE_LIMIT',
    'OVERLOADED',
  ].some((marker) => message.includes(marker));
};

export interface RetryOptions {
  analyzer?: GeminiChunkAnalyzer;
  sleep?: Sleep;
  maxRetries?: number;
  initialBackoffMs?: number;
}

export interface SequentialAnalysisOptions extends RetryOptions {
  interCallDelayMs?: number;
  onResult?: (result: AnalysisResult, index: number) => void | Promise<void>;
}

export const analyzeWithRetry = async (
  pages: Page[],
  options: RetryOptions = {},
): Promise<AnalysisResult> => {
  const analyzer = options.analyzer ?? analyzeGazetteText;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? GEMINI_MAX_RETRIES;
  const initialBackoffMs = options.initialBackoffMs ?? GEMINI_RETRY_INITIAL_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await analyzer(pages);
    } catch (error: any) {
      const retryNumber = attempt + 1;
      if (!isTransientGeminiError(error) || retryNumber > maxRetries) {
        throw error;
      }

      const waitMs = initialBackoffMs * (2 ** attempt);
      console.warn(
        `Gemini transitoriamente no disponible (retry ${retryNumber}/${maxRetries}). ` +
        `Reintentando en ${waitMs / 1000}s...`,
      );
      await sleep(waitMs);
    }
  }
};

/** Runs independent chunks in order, waiting only between normal calls. */
export const analyzeChunksSequentially = async (
  chunks: Page[][],
  options: SequentialAnalysisOptions = {},
): Promise<AnalysisResult[]> => {
  const results: AnalysisResult[] = [];
  const interCallDelayMs = options.interCallDelayMs ?? GEMINI_INTER_CALL_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let index = 0; index < chunks.length; index += 1) {
    const result = await analyzeWithRetry(chunks[index], options);
    results.push(result);
    await options.onResult?.(result, index);
    if (index < chunks.length - 1) {
      await sleep(interCallDelayMs);
    }
  }

  return results;
};
