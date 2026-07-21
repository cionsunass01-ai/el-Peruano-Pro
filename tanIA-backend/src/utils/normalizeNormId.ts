/*export const normalizeNormId = (id: string): string => { 
  return id 
    .toUpperCase() .normalize('NFD')  // separa letras y acentos 
    .replace(/[\u0300-\u036f]/g, '')  // elimina acentos 
    .replace(/\s+/g, ' ')  // colapsa espacios 
    .replace('D.S.', 'DECRETO SUPREMO') 
    .replace('DS', 'DECRETO SUPREMO') 
    .replace('R.S.', 'RESOLUCION SUPREMA') 
    .replace('RS', 'RESOLUCION SUPREMA') 
    .replace('R.M.', 'RESOLUCION MINISTERIAL') 
    .replace('RM', 'RESOLUCION MINISTERIAL') 
    .replace('R.J.', 'RESOLUCION JEFATURAL') 
    .replace('RJ', 'RESOLUCION JEFATURAL') 
    .replace('R.D.', 'RESOLUCION DIRECTORAL') 
    .replace('RD', 'RESOLUCION DIRECTORAL') 
    .replace('Res.', 'RESOLUCION') 
    .replace('R.A.', 'RESOLUCION ADMINISTRATIVA') 
    .replace('RA', 'RESOLUCION ADMINISTRATIVA')
    .trim();
};*/

export const normalizeNormId = (id: string): string => {
  return id
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

    .replace(/\bD\.?S\.?\b/g, 'DECRETO SUPREMO')
    .replace(/\bR\.?S\.?\b/g, 'RESOLUCION SUPREMA')
    .replace(/\bR\.?M\.?\b/g, 'RESOLUCION MINISTERIAL')
    .replace(/\bR\.?J\.?\b/g, 'RESOLUCION JEFATURAL')
    .replace(/\bR\.?D\.?\b/g, 'RESOLUCION DIRECTORAL')
    .replace(/\bR\.?A\.?\b/g, 'RESOLUCION ADMINISTRATIVA')
    .replace(/\bRES\.\s*/g, 'RESOLUCION ')
    .replace(/\bRESOLUCION DE [A-Z\s]+?\b(?=\s*N°)/g, 'RESOLUCION ')
    .replace(/N[°ºO]/g, 'N°')
    .trim();
};
