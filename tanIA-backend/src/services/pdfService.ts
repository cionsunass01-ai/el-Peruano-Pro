const pdf = require("pdf-parse/lib/pdf-parse");

/**
 * Extrae texto de un PDF a partir de un Buffer.
 * Retorna un arreglo con el texto por página.
 */
export async function extractTextFromPdf(
  buffer: Buffer,
  onProgress?: (progress: number) => void
): Promise<{ page: number; text: string }[]> {

  const data = await pdf(buffer);

  if (onProgress) onProgress(100);

  return data.text
    .split("\f")
    .map((text: string, index: number) => ({
      page: index + 1,
      text: text.trim()
    }));
}