import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ExternalHyperlink
} from "docx";
import { AnalysisResult, Relevance } from "../types/domainTypes";
import { normalizeNormId } from "../utils/normalizeNormId";
import { IRunOptions, BorderStyle } from "docx";

export const generateAnalysisWordBuffer = async (
  result: AnalysisResult,
  fileName: string,
  indiceNormas: Record<string, string>
): Promise<Buffer> => {
  const { gazetteDate, norms, designatedAppointments, concludedAppointments } = result;

  // --- MISMA lógica que PDF ---
  const waterSectorNorms = norms.filter(
    (n) => n.relevanceToWaterSector !== Relevance.NINGUNA
  );

  const relevanceOrder: Record<Relevance, number> = {
    [Relevance.ALTA]: 1,
    [Relevance.MEDIA]: 2,
    [Relevance.BAJA]: 3,
    [Relevance.NINGUNA]: 4,
  };

  const sortedWaterSectorNorms = [...waterSectorNorms].sort(
    (a, b) =>
      relevanceOrder[a.relevanceToWaterSector] -
      relevanceOrder[b.relevanceToWaterSector]
  );

  const allAppointments = [
    ...designatedAppointments.map((d) => ({ ...d, type: "Designado" })),
    ...concludedAppointments.map((c) => ({ ...c, type: "Concluido" })),
  ];

  const nNorms = sortedWaterSectorNorms.length;
  const nAppointments = allAppointments.length;

  const genDate = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const centerText = (text: string, options?: IRunOptions) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text,
          ...options,
        }),
      ],
  });

  const spacer = (lines = 1) =>
    new Paragraph({
      spacing: { after: 200 * lines },
  });

  const cellText = (text: string, options?: IRunOptions) =>
    new Paragraph({
      children: [new TextRun({ text, ...options })],
  });
/*
  const headerCell = (text: string) =>
    new TableCell({
      shading: { fill: "F1F5F9" }, // gris institucional
      margins: { top: 200, bottom: 200, left: 200, right: 200 },
      children: [
        cellText(text, { bold: true, size: 22 }),
      ],
  });*/
  const headerCell = (text: string, width?: number) =>
  new TableCell({
    width: width
      ? { size: width, type: WidthType.PERCENTAGE }
      : undefined,
    shading: { fill: "F1F5F9" },
    margins: { top: 200, bottom: 200, left: 200, right: 200 },
    children: [cellText(text, { bold: true, size: 22 })],
  });


  const bodyCell = (text: string) =>
    new TableCell({
      margins: { top: 180, bottom: 180, left: 200, right: 200 },
      children: [
        cellText(text, { size: 20 }),
      ],
  });

  const summaryText =
    `Se identificaron ${nNorms} norma(s) relevante(s) (ALTA/MEDIA/BAJA) y ` +
    `${nAppointments} movimiento(s) de cargos públicos (designaciones y conclusiones). ` +
    `Las normas se listan priorizadas por nivel de relevancia.`;

  const p = (text: string, bold = false) =>
    new Paragraph({
      children: [new TextRun({ text, bold })],
    });

  const h1 = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    });

  const h2 = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
    });
  
  const relevanceColor: Record<Relevance, string> = {
    [Relevance.ALTA]: "FF0000", // red
    [Relevance.MEDIA]: "FFA500", // orange
    [Relevance.BAJA]: "0000FF", // blue
    [Relevance.NINGUNA]: "000000", // black, though not used
  };

  const doc = new Document({
    sections: [
      {
        children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      shading: {
                        fill: "0B3A75", // azul institucional
                      },
                      margins: {
                        top: 600,
                        bottom: 600,
                      },
                      children: [
                        centerText("ANÁLISIS DE NORMAS LEGALES", {
                          bold: true,
                          size: 36,
                          color: "FFFFFF",
                        }),
                        spacer(),
                        centerText('Diario Oficial "El Peruano"', {
                          size: 22,
                          color: "E6E6E6",
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),

            spacer(2),

            centerText(`Fecha del diario: ${gazetteDate}`, { size: 20 }),
            spacer(),
            centerText(`Archivo analizado: ${fileName}`, { size: 20 }),
            spacer(),
            centerText(`Generado el: ${genDate}`, { size: 20 }),

            spacer(3),
            new Table({
              width: { size: 85, type: WidthType.PERCENTAGE },
              alignment: AlignmentType.CENTER,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: {
                      fill: "F4F7FB",
                    },
                    margins: {
                      top: 400,
                      bottom: 400,
                      left: 400,
                      right: 400,
                    },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: summaryText,
                            size: 22,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ pageBreakBefore: true }),

          // RESUMEN
          h2("Resumen ejecutivo"),
          p(summaryText),
          new Paragraph(""),

          // MOVIMIENTOS
          ...(allAppointments.length > 0
            ? [
                h2("Movimientos de cargos públicos"),

                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },

                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    insideHorizontal: {
                      style: BorderStyle.SINGLE,
                      size: 4,
                      color: "E2E8F0",
                    },
                    insideVertical: {
                      style: BorderStyle.SINGLE,
                      size: 4,
                      color: "E2E8F0",
                    },
                  },

                  rows: [
                    new TableRow({
                      children: [
                        headerCell("Institución"),
                        headerCell("Tipo"),
                        headerCell("Cargo"),
                        headerCell("Nombre"),
                      ],
                    }),

                    ...allAppointments.map(
                      (a) =>
                        new TableRow({
                          children: [
                            bodyCell(a.institution),
                            bodyCell(a.type),
                            bodyCell(a.position),
                            bodyCell(a.personName || "No especificado"),
                          ],
                        })
                    ),
                  ],
                }),

                new Paragraph(""),
              ]
            : []),

          // NORMAS
          ...(sortedWaterSectorNorms.length > 0
            ? [
                new Paragraph(""),
                h2("Normas relevantes para Agua y Saneamiento"),
                new Paragraph(""),
                p("Ordenadas por relevancia (ALTA → MEDIA → BAJA)."),
                new Paragraph(""),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    insideHorizontal: {
                      style: BorderStyle.SINGLE,
                      size: 4,
                      color: "E2E8F0",
                    },
                    insideVertical: {
                      style: BorderStyle.SINGLE,
                      size: 4,
                      color: "E2E8F0",
                    },
                  },rows: [
                    /*new TableRow({
                      children: [headerCell("Relevancia"), headerCell("Sector"), headerCell("Norma"), headerCell("Pág.")].map(
                        (h, i) => {
                          const widths = [15, 20, 55, 10];
                          return new TableCell({
                            width: { size: widths[i], type: WidthType.PERCENTAGE },
                            margins: { top: 180, bottom: 180, left: 200, right: 200 },
                            children: [p(h, true)],
                          });
                        }
                      ),
                    }),*/
                    new TableRow({
                      children: [
                        headerCell("Relevancia", 15),
                        headerCell("Sector", 20),
                        headerCell("Norma", 55),
                        headerCell("Pág.", 10),
                      ],
                    }),
                    ...sortedWaterSectorNorms.map((n) => {
                      const normalizedId = normalizeNormId(n.normId);
                      const link = n.normId ? indiceNormas[normalizedId] : undefined;
                      const normaChildren = [
                        new Paragraph({
                          children: [new TextRun({ text: n.title, bold: true, size: 22 })],
                          spacing: { after: 120}
                        }),
                        link
                          ? new Paragraph({
                              children: [
                                new ExternalHyperlink({
                                  children: [
                                    new TextRun({ text: n.normId, color: "1155CC", size: 20 }),
                                  ],
                                  link,
                                }),
                              ],
                              spacing: { after: 120}
                            })
                          : new Paragraph({
                              children: [new TextRun({ text: n.normId, size: 20 })],
                              spacing: { after: 120}
                            }),
                        new Paragraph({
                          children: [new TextRun({ text: n.summary, size: 20, color: "475569" })],
                        }),
                      ];
                      const widths = [15, 20, 55, 10];
                      return new TableRow({
                        children: [
                          new TableCell({
                            width: { size: widths[0], type: WidthType.PERCENTAGE },
                            children: [new Paragraph({
                              children: [new TextRun({
                                text: n.relevanceToWaterSector,
                                bold: true,
                                color: relevanceColor[n.relevanceToWaterSector]
                              })]
                            })],
                          }),
                          new TableCell({
                            width: { size: widths[1], type: WidthType.PERCENTAGE },
                            children: [p(n.sector)],
                          }),
                          new TableCell({
                            width: { size: widths[2], type: WidthType.PERCENTAGE },
                            children: normaChildren,
                          }),
                          new TableCell({
                            width: { size: widths[3], type: WidthType.PERCENTAGE },
                            children: [p(String(n.pageNumber))],
                          }),
                        ],
                      });
                    }),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
};
