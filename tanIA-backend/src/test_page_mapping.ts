import assert from 'assert';
import {
  mapLocalPagesToGlobal,
  validateManifestPageRanges,
} from './services/pageMappingService';

const run = (name: string, test: () => void): void => {
  test();
  console.log(`PASS ${name}`);
};

run('A: chunk 1, página local 1 corresponde a global 1', () => {
  assert.equal(
    mapLocalPagesToGlobal(25, { startPage: 1, endPage: 25, totalPages: 63 })[0],
    1,
  );
});

run('B: chunk 2, página local 1 corresponde a global 26', () => {
  assert.equal(
    mapLocalPagesToGlobal(25, { startPage: 26, endPage: 50, totalPages: 63 })[0],
    26,
  );
});

run('C: chunk 2, página local 3 corresponde a global 28', () => {
  assert.equal(
    mapLocalPagesToGlobal(25, { startPage: 26, endPage: 50, totalPages: 63 })[2],
    28,
  );
});

run('D: chunk final parcial 51-63 se mapea completamente', () => {
  const pages = mapLocalPagesToGlobal(13, {
    startPage: 51,
    endPage: 63,
    totalPages: 63,
  });

  assert.equal(pages[0], 51);
  assert.equal(pages[12], 63);
});

run('E: cantidad extraída distinta del rango genera error', () => {
  assert.throws(
    () => mapLocalPagesToGlobal(24, { startPage: 26, endPage: 50, totalPages: 63 }),
    /PAGE_RANGE_VALIDATION_ERROR/,
  );
});

run('F: página global superior a totalPages genera error', () => {
  assert.throws(
    () => mapLocalPagesToGlobal(13, { startPage: 51, endPage: 63, totalPages: 62 }),
    /PAGE_RANGE_VALIDATION_ERROR/,
  );
});

run('G: rangos no continuos generan error', () => {
  assert.throws(
    () => validateManifestPageRanges([
      { start_page: 1, end_page: 25 },
      { start_page: 27, end_page: 50 },
    ], 50),
    /PAGE_RANGE_VALIDATION_ERROR/,
  );
});

run('Validación del manifest exige que el último rango termine en total_pages', () => {
  assert.throws(
    () => validateManifestPageRanges([
      { start_page: 1, end_page: 25 },
      { start_page: 26, end_page: 49 },
    ], 50),
    /PAGE_RANGE_VALIDATION_ERROR/,
  );
});
