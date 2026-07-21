import { jsPDF } from 'jspdf';
import { AnalysisResult, Relevance } from '../types/domainTypes';
import { normalizeNormId } from '../utils/normalizeNormId';


/**
 * CSV
 */
export const generateCsvBlob = (data: any[], headers: Record<string, string>): Blob => {
  const headerKeys = Object.keys(headers);
  const headerValues = Object.values(headers);

  const csvRows = [headerValues.join(',')];

  for (const item of data) {
    const values = headerKeys.map((key) => {
      const val = item[key] ?? '';
      const escaped = ('' + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\n');
  return new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
};

/**
 * PDF
 */
export const generateAnalysisPdfBlob = (result: AnalysisResult, fileName: string, indiceNormas: Record<string, string>): Blob => {
  const normalizeTitle = (t: string) =>
    t.toUpperCase().replace(/\s+/g, ' ').trim();
  
  const { gazetteDate, norms, designatedAppointments, concludedAppointments } = result;

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  // --- Layout tokens ---
  const marginX = 15;
  const marginTop = 16;
  const marginBottom = 14;
  const headerHeight = 12;
  const contentWidth = pdfWidth - marginX * 2;

  const sectionGap = 10;

  // Start Y for content in pages with header
  const contentStartY = marginTop + headerHeight + 6;

  // Cursor
  let cursorY = marginTop;

  // --- Palette ---
  const primary = '#0B3A82';
  const linkBlue = '#1D4ED8';
  const text = '#0F172A';
  const muted = '#475569';
  const light = '#64748B';

  // OJO: arrays usados SIN spread (por TS)
  const line = [226, 232, 240];      // slate-200
  const headerFill = [241, 245, 249]; // slate-100
  const blockFill = [248, 250, 252];  // slate-50

  // --- Font helpers (1 fuente) ---
  const setH1 = () => pdf.setFont('helvetica', 'bold').setFontSize(20).setTextColor('#FFFFFF');
  const setH2 = () => pdf.setFont('helvetica', 'bold').setFontSize(15).setTextColor(primary);
  const setBody = () => pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(text);
  const setSmall = () => pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(muted);
  const setTiny = () => pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(light);

  const safeText = (v: any) => String(v ?? '').trim();

  // --- Data prep ---
  const waterSectorNorms = norms.filter((n) => n.relevanceToWaterSector !== Relevance.NINGUNA);

  const relevanceOrder: Record<Relevance, number> = {
    [Relevance.ALTA]: 1,
    [Relevance.MEDIA]: 2,
    [Relevance.BAJA]: 3,
    [Relevance.NINGUNA]: 4,
  };

  const sortedWaterSectorNorms = [...waterSectorNorms].sort(
    (a, b) => relevanceOrder[a.relevanceToWaterSector] - relevanceOrder[b.relevanceToWaterSector]
  );

  const allAppointments = [
    ...designatedAppointments.map((d) => ({ ...d, type: 'Designado' as const })),
    ...concludedAppointments.map((c) => ({ ...c, type: 'Concluido' as const })),
  ];

  // --- Utilities ---
  const drawHeader = () => {
    pdf.setDrawColor(line[0], line[1], line[2]);
    pdf.setLineWidth(0.3);

    setTiny();
    pdf.text('Análisis de Normas Legales - El Peruano', marginX, marginTop + 7);

    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(primary);
    pdf.text('CION - Sunass', pdfWidth - marginX, marginTop + 7, { align: 'right' });

    pdf.line(marginX, marginTop + headerHeight, pdfWidth - marginX, marginTop + headerHeight);
  };

  const addPageWithHeader = () => {
    pdf.addPage();
    cursorY = contentStartY;
    drawHeader();
  };

  const ensureContentPage = (() => {
    let started = false;
    return () => {
      if (!started) {
        addPageWithHeader();
        started = true;
      }
    };
  })();

  const checkPageBreak = (neededHeight: number) => {
    if (cursorY + neededHeight > pdfHeight - marginBottom) {
      addPageWithHeader();
    }
  };

  const roundedRectFill = (x: number, y: number, w: number, h: number, r = 2) => {
    // @ts-ignore
    if (typeof pdf.roundedRect === 'function') {
      // @ts-ignore
      pdf.roundedRect(x, y, w, h, r, r, 'F');
    } else {
      pdf.rect(x, y, w, h, 'F');
    }
  };

  const drawBlock = (height: number) => {
    pdf.setFillColor(blockFill[0], blockFill[1], blockFill[2]);
    roundedRectFill(marginX, cursorY, contentWidth, height, 2);
  };

  const addSectionTitle = (title: string, subtitle?: string) => {
    checkPageBreak(18);
    setH2();
    pdf.text(title, marginX, cursorY);
    cursorY += 7;

    if (subtitle) {
      setSmall();
      const lines = pdf.splitTextToSize(subtitle, contentWidth);
      pdf.text(lines, marginX, cursorY);
      cursorY += lines.length * 4 + 2;
    } else {
      cursorY += 2;
    }
  };

  // --- COVER ---
  pdf.setFillColor(primary);
  pdf.rect(0, 0, pdfWidth, 62, 'F');

  setH1();
  pdf.text('Análisis de Normas Legales', pdfWidth / 2, 26, { align: 'center' });

  pdf.setFont('helvetica', 'normal').setFontSize(14).setTextColor('#EAF2FF');
  pdf.text('Diario Oficial "El Peruano"', pdfWidth / 2, 38, { align: 'center' });

  cursorY = 85;
  setBody();
  pdf.setTextColor(text);
  pdf.text(`Fecha del diario: ${safeText(gazetteDate)}`, pdfWidth / 2, cursorY, { align: 'center' });
  cursorY += 8;

  setSmall();
  pdf.text(`Archivo analizado: ${safeText(fileName)}`, pdfWidth / 2, cursorY, { align: 'center' });
  cursorY += 6;

  const genDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  pdf.text(`Generado el: ${genDate}`, pdfWidth / 2, cursorY, { align: 'center' });

  cursorY += 18;

  const nNorms = sortedWaterSectorNorms.length;
  const nAppointments = allAppointments.length;

  const summaryText =
    `Se identificaron ${nNorms} norma(s) relevante(s) (ALTA/MEDIA/BAJA) y ` +
    `${nAppointments} movimiento(s) de cargos públicos (designaciones y conclusiones). ` +
    `Las normas se listan priorizadas por nivel de relevancia.`;

  const coverSummaryHeight = 26;
  pdf.setFillColor(blockFill[0], blockFill[1], blockFill[2]);
  roundedRectFill(marginX, cursorY, contentWidth, coverSummaryHeight, 3);

  setBody();
  const summaryLines = pdf.splitTextToSize(summaryText, contentWidth - 10);
  pdf.text(summaryLines, marginX + 5, cursorY + 10);
  cursorY += coverSummaryHeight;

  // --- CONTENT ---
  ensureContentPage();

  // Resumen ejecutivo
  addSectionTitle('Resumen ejecutivo');

  const execLines = pdf.splitTextToSize(summaryText, contentWidth - 10);
  const execBlockHeight = Math.max(18, execLines.length * 4 + 10);
  checkPageBreak(execBlockHeight + 8);
  drawBlock(execBlockHeight);
  setBody();
  pdf.text(execLines, marginX + 5, cursorY + 9);
  cursorY += execBlockHeight + sectionGap;

  // Movimientos
  if (allAppointments.length > 0) {
    addSectionTitle('Movimientos de cargos públicos');

    const headers = ['Institución', 'Tipo', 'Cargo', 'Nombre'];
    const colW = [contentWidth * 0.30, contentWidth * 0.14, contentWidth * 0.32, contentWidth * 0.24];
    const headerH = 9;
    const padX = 2.2;
    const padY = 4.2;
    const lineHRow = 4.1;

    checkPageBreak(headerH + 6);

    pdf.setFillColor(headerFill[0], headerFill[1], headerFill[2]);
    pdf.rect(marginX, cursorY, contentWidth, headerH, 'F');

    pdf.setDrawColor(line[0], line[1], line[2]);
    pdf.setLineWidth(0.3);
    pdf.rect(marginX, cursorY, contentWidth, headerH);

    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(muted);
    let x = marginX;
    headers.forEach((h, i) => {
      pdf.text(h, x + padX, cursorY + 6);
      x += colW[i];
    });
    cursorY += headerH;

    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(text);

    for (const appt of allAppointments) {
      const row = [
        safeText(appt.institution),
        safeText(appt.type),
        safeText(appt.position),
        safeText(appt.personName),
      ];

      const wrapped = row.map((t, i) => pdf.splitTextToSize(t, colW[i] - padX * 2));
      const maxLines = Math.max(...wrapped.map((l) => l.length));
      const rowH = Math.max(10, maxLines * lineHRow + 4);

      checkPageBreak(rowH + 2);

      pdf.setDrawColor(line[0], line[1], line[2]);
      pdf.setLineWidth(0.3);
      pdf.rect(marginX, cursorY, contentWidth, rowH);

      x = marginX;
      for (let i = 0; i < row.length; i++) {
        pdf.text(wrapped[i], x + padX, cursorY + padY, { maxWidth: colW[i] - padX * 2 });
        x += colW[i];
      }

      cursorY += rowH;
    }

    cursorY += sectionGap;
  }

  // Normas
  if (sortedWaterSectorNorms.length > 0) {
    addSectionTitle(
      'Normas relevantes para Agua y Saneamiento',
      'Ordenadas por relevancia (ALTA → MEDIA → BAJA).'
    );

    const headers = ['Relevancia', 'Sector', 'Norma', 'Pág.'];
    const colW = [
      contentWidth * 0.15,
      contentWidth * 0.20,
      contentWidth * 0.55,
      contentWidth * 0.10
    ];

    const headerH = 9;
    const pad = 2.4;
    const lineH = 4.2;
    const smallH = 3.8;

    const calcRowHeight = (norm: any) => {
      const relLines = pdf.splitTextToSize(
        safeText(norm.relevanceToWaterSector),
        colW[0] - pad * 2
      );
      const secLines = pdf.splitTextToSize(
        safeText(norm.sector),
        colW[1] - pad * 2
      );
      const pageLines = pdf.splitTextToSize(
        safeText(norm.pageNumber),
        colW[3] - pad * 2
      );

      const detailW = colW[2] - pad * 2;

      pdf.setFont('helvetica', 'bold').setFontSize(9);
      const titleLines = pdf.splitTextToSize(safeText(norm.title), detailW);

      pdf.setFont('helvetica', 'normal').setFontSize(8);
      const idLines = pdf.splitTextToSize(safeText(norm.normId), detailW);

      const summaryLines = pdf.splitTextToSize(
        safeText(norm.summary),
        detailW
      );

      const h1 = relLines.length * lineH;
      const h2 = secLines.length * lineH;
      const h3 =
        titleLines.length * lineH +
        idLines.length * smallH +
        summaryLines.length * smallH +
        4;
      const h4 = pageLines.length * lineH;

      return Math.max(h1, h2, h3, h4) + pad * 2 + 2;
    };

    checkPageBreak(headerH + 6);

    pdf.setFillColor(headerFill[0], headerFill[1], headerFill[2]);
    pdf.rect(marginX, cursorY, contentWidth, headerH, 'F');

    pdf.setDrawColor(line[0], line[1], line[2]);
    pdf.setLineWidth(0.3);
    pdf.rect(marginX, cursorY, contentWidth, headerH);

    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(muted);
    let x = marginX;
    headers.forEach((h, i) => {
      pdf.text(h, x + pad, cursorY + 6);
      x += colW[i];
    });
    cursorY += headerH;

    for (const norm of sortedWaterSectorNorms) {
      const rowH = calcRowHeight(norm);
      checkPageBreak(rowH + 2);

      pdf.setDrawColor(line[0], line[1], line[2]);
      pdf.setLineWidth(0.3);
      pdf.rect(marginX, cursorY, contentWidth, rowH);

      const rowTop = cursorY;

      // Badge relevancia
      const rel = safeText(norm.relevanceToWaterSector);
      const badgeH = 7;
      const badgeW = colW[0] - pad * 2;

      const relFill =
        rel === Relevance.ALTA
          ? [220, 38, 38]
          : rel === Relevance.MEDIA
          ? [234, 179, 8]
          : [37, 99, 235];

      pdf.setFillColor(relFill[0], relFill[1], relFill[2]);
      // @ts-ignore
      if (typeof pdf.roundedRect === 'function') {
        // @ts-ignore
        pdf.roundedRect(
          marginX + pad,
          rowTop + pad,
          badgeW,
          badgeH,
          2,
          2,
          'F'
        );
      } else {
        pdf.rect(marginX + pad, rowTop + pad, badgeW, badgeH, 'F');
      }

      pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor('#FFFFFF');
      pdf.text(
        rel,
        marginX + pad + badgeW / 2,
        rowTop + pad + 5.1,
        { align: 'center' }
      );

      // Sector
      pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(text);
      const secLines = pdf.splitTextToSize(
        safeText(norm.sector),
        colW[1] - pad * 2
      );
      pdf.text(secLines, marginX + colW[0] + pad, rowTop + pad + 4.2);

      // Norma (detalle)
      const detailX = marginX + colW[0] + colW[1] + pad;
      const detailW = colW[2] - pad * 2;
      let y = rowTop + pad + 4.2;

      // TÍTULO → NO clickeable
      pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(text);
      const titleLines = pdf.splitTextToSize(
        safeText(norm.title),
        detailW
      );
      pdf.text(titleLines, detailX, y);
      y += titleLines.length * lineH;

      // ID → ÚNICO clickeable
      /*const link = norm.normId
        ? indiceNormas[normalizeNormId(norm.normId)]
        : undefined;*/
      
      const normalizedId = normalizeNormId(norm.normId);
      const link = norm.normId
        ? indiceNormas[normalizedId]
        : undefined;
      // 🔍 DEBUG CLAVE (TEMPORAL)
      console.log('[MATCH DEBUG]', {
        originalNormId: norm.normId,
        normalizedNormId: normalizedId,
        linkFound: !!link,
        link,
      });

      pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(primary);
      const idLines = pdf.splitTextToSize(
        safeText(norm.normId),
        detailW
      );
      /*
      if (link) {
        // Solo la primera línea será clickeable (normalmente el ID no se parte)
        pdf.textWithLink(String(idLines[0]), detailX, y, link);

        // Si por algún motivo se partió en varias líneas, dibuja las demás sin link
        if (idLines.length > 1) {
          pdf.text(idLines.slice(1), detailX, y + smallH);
        }
      } else {
        // Si no hay URL en el índice, se imprime normal (sin link)
        pdf.text(idLines, detailX, y);
      }*/


      if (link) {
        const text = String(idLines[0]);

        // Dibuja el texto normal
        pdf.text(text, detailX, y);

        // Calcula el tamaño real del texto
        const textWidth = pdf.getTextWidth(text);
        const linkHeight = 4; // altura aproximada de línea

        // Crea la anotación de link (ESTO ES LO CLAVE)
        (pdf as any).link(
          detailX,
          y - 3,           // ajusta verticalmente
          textWidth,
          linkHeight,
          { url: link }
        );

        // Resto de líneas sin link
        if (idLines.length > 1) {
          pdf.text(idLines.slice(1), detailX, y + smallH);
        }
      } else {
        pdf.text(idLines, detailX, y);
      }


      y += idLines.length * smallH + 1;

      // Resumen → NO clickeable
      pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(muted);
      const summaryLines = pdf.splitTextToSize(
        safeText(norm.summary),
        detailW
      );
      pdf.text(summaryLines, detailX, y);

      // Página
      pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(text);
      pdf.text(
        safeText(norm.pageNumber),
        marginX +
          colW[0] +
          colW[1] +
          colW[2] +
          colW[3] / 2,
        rowTop + pad + 5.2,
        { align: 'center' }
      );

      cursorY += rowH;
    }

    cursorY += sectionGap;
  }


  // --- Page numbering ---
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    setTiny();
    pdf.text(`Página ${i} de ${pageCount}`, pdfWidth - marginX, pdfHeight - 8, { align: 'right' });
  }

  return pdf.output('blob');
};
