const pdf = require("pdf-parse/lib/pdf-parse");
import { mapLocalPagesToGlobal } from './pageMappingService';

export interface PdfExtractionOptions {
  startPage?: number;
  endPage?: number;
  totalPages?: number;
}

/**
 * Extrae texto de un PDF a partir de un Buffer.
 * Retorna un arreglo con el texto por página.
 */
export async function extractTextFromPdf(
  buffer: Buffer,
  onProgress?: (progress: number) => void,
  options: PdfExtractionOptions = {},
): Promise<{ page: number; text: string }[]> {

  const data = await pdf(buffer);

  const pageCount = Number(data.numpages);
  const rawText = typeof data.text === 'string' ? data.text : '';
  const segments = rawText.split("\f");

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error(`PDF_PAGE_MAPPING_ERROR: pdf-parse devolvió numpages inválido: ${data.numpages}`);
  }

  if (segments.length !== pageCount) {
    throw new Error(
      `PDF_PAGE_MAPPING_ERROR: pdf-parse declara ${pageCount} páginas, ` +
      `pero data.text.split("\\f") produjo ${segments.length} segmentos.`,
    );
  }

  const startPage = options.startPage ?? 1;
  const endPage = options.endPage ?? startPage + pageCount - 1;
  const totalPages = options.totalPages ?? endPage;
  const globalPages = mapLocalPagesToGlobal(pageCount, {
    startPage,
    endPage,
    totalPages,
  });

  if (onProgress) onProgress(100);

  return segments.map((text: string, index: number) => ({
    page: globalPages[index],
    text: text.trim(),
  }));
}
