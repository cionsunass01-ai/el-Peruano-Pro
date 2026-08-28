import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import {
  analyzeChunksSequentially,
  analyzeWithRetry,
  GEMINI_INTER_CALL_DELAY_MS,
  GEMINI_MAX_RETRIES,
  GEMINI_RETRY_INITIAL_DELAY_MS,
  isTransientGeminiError,
} from './services/geminiExecutionService';
import type { AnalysisResult } from './types/domainTypes';

const emptyResult = (): AnalysisResult => ({
  gazetteDate: '20/08/2026',
  norms: [],
  designatedAppointments: [],
  concludedAppointments: [],
});

const run = async (name: string, test: () => Promise<void> | void): Promise<void> => {
  await test();
  console.log(`PASS ${name}`);
};

(async () => {
  await run('usa el modelo, chunking y límites esperados', async () => {
    const geminiSource = await fs.readFile(path.join(__dirname, 'services', 'geminiService.ts'), 'utf8');
    const workerSource = await fs.readFile(path.join(__dirname, 'worker.ts'), 'utf8');
    const scraperSource = await fs.readFile(path.resolve(__dirname, '../../elperuano-scraper/split_pdf.py'), 'utf8');

    assert.match(geminiSource, /gemini-2\.5-flash/);
    assert.match(scraperSource, /PAGES_PER_CHUNK\s*=\s*25/);
    assert.match(workerSource, /for \(let i = 0; i < sortedFiles\.length; i\+\+\)/);
    assert.match(workerSource, /const analysis = await analyzeWithRetry\(pages\)/);
    assert.match(workerSource, /if \(i < sortedFiles\.length - 1\)/);
    assert.equal(GEMINI_INTER_CALL_DELAY_MS, 62_000);
  });

  await run('solo reintenta saturación/rate limit con backoff exponencial', async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await analyzeWithRetry([], {
      analyzer: async () => {
        calls += 1;
        if (calls < 3) throw { status: 429 };
        return emptyResult();
      },
      sleep: async (milliseconds) => { waits.push(milliseconds); },
    });

    assert.deepEqual(result, emptyResult());
    assert.equal(calls, 3);
    assert.deepEqual(waits, [GEMINI_RETRY_INITIAL_DELAY_MS, GEMINI_RETRY_INITIAL_DELAY_MS * 2]);
    assert.equal(GEMINI_MAX_RETRIES, 2);
    assert.equal(isTransientGeminiError({ status: 503 }), true);
    assert.equal(isTransientGeminiError({ status: 'RESOURCE_EXHAUSTED' }), true);
  });

  await run('no reintenta errores deterministas de JSON o validación', async () => {
    let calls = 0;
    let waits = 0;
    await assert.rejects(
      () => analyzeWithRetry([], {
        analyzer: async () => {
          calls += 1;
          throw new SyntaxError('JSON inválido');
        },
        sleep: async () => { waits += 1; },
      }),
      /JSON inválido/,
    );
    assert.equal(calls, 1);
    assert.equal(waits, 0);
    assert.equal(isTransientGeminiError(new SyntaxError('JSON inválido')), false);
  });

  await run('procesa chunks en orden y espera solo entre llamadas', async () => {
    const events: string[] = [];
    const waits: number[] = [];
    const chunks = [[{ page: 1, text: 'uno' }], [{ page: 26, text: 'dos' }], [{ page: 51, text: 'tres' }]];

    const results = await analyzeChunksSequentially(chunks, {
      analyzer: async (pages) => {
        events.push(`start-${pages[0].page}`);
        await Promise.resolve();
        events.push(`end-${pages[0].page}`);
        return emptyResult();
      },
      interCallDelayMs: 62_000,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        events.push('wait');
      },
    });

    assert.equal(results.length, 3);
    assert.deepEqual(events, [
      'start-1', 'end-1', 'wait',
      'start-26', 'end-26', 'wait',
      'start-51', 'end-51',
    ]);
    assert.deepEqual(waits, [62_000, 62_000]);
  });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
