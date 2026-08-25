export interface ManifestPageRange {
  start_page: number;
  end_page: number;
}

export interface GlobalPageRange {
  startPage: number;
  endPage: number;
  totalPages: number;
}

const pageRangeError = (message: string): Error =>
  new Error(`PAGE_RANGE_VALIDATION_ERROR: ${message}`);

export const validateGlobalPageRange = (range: GlobalPageRange): void => {
  if (!Number.isInteger(range.startPage) || !Number.isInteger(range.endPage)) {
    throw pageRangeError('El inicio y fin del rango deben ser enteros.');
  }

  if (!Number.isInteger(range.totalPages) || range.totalPages < 1) {
    throw pageRangeError(`totalPages inválido: ${range.totalPages}.`);
  }

  if (range.startPage < 1 || range.endPage < range.startPage) {
    throw pageRangeError(
      `Rango inválido: ${range.startPage}-${range.endPage}.`,
    );
  }

  if (range.endPage > range.totalPages) {
    throw pageRangeError(
      `El rango ${range.startPage}-${range.endPage} supera totalPages=${range.totalPages}.`,
    );
  }
};

/**
 * Validates the complete manifest topology: starts at page 1, has no gaps or
 * overlaps, stays within total_pages and ends exactly at total_pages.
 */
export const validateManifestPageRanges = (
  files: ManifestPageRange[],
  totalPages: number,
): void => {
  if (files.length === 0) {
    throw pageRangeError('El manifest no contiene chunks.');
  }

  const sortedFiles = [...files].sort((a, b) => a.start_page - b.start_page);
  let expectedNextPage = 1;

  for (const file of sortedFiles) {
    validateGlobalPageRange({
      startPage: file.start_page,
      endPage: file.end_page,
      totalPages,
    });

    if (file.start_page !== expectedNextPage) {
      throw pageRangeError(
        `Rango discontinuo: se esperaba ${expectedNextPage}, ` +
        `pero ${file.start_page}-${file.end_page} comienza en ${file.start_page}.`,
      );
    }

    expectedNextPage = file.end_page + 1;
  }

  if (expectedNextPage !== totalPages + 1) {
    throw pageRangeError(
      `El último chunk termina en ${expectedNextPage - 1}, ` +
      `pero totalPages=${totalPages}.`,
    );
  }
};

/**
 * Maps the 1-based local pages extracted from one chunk to global pages.
 * The count must exactly match the manifest range before any mapping occurs.
 */
export const mapLocalPagesToGlobal = (
  localPageCount: number,
  range: GlobalPageRange,
): number[] => {
  validateGlobalPageRange(range);

  const expectedPageCount = range.endPage - range.startPage + 1;
  if (localPageCount !== expectedPageCount) {
    throw pageRangeError(
      `El chunk ${range.startPage}-${range.endPage} declara ${expectedPageCount} páginas, ` +
      `pero se extrajeron ${localPageCount}.`,
    );
  }

  return Array.from(
    { length: localPageCount },
    (_, localIndex) => range.startPage + localIndex,
  );
};
