// analyze.ts
// Lee el último PDF descargado, lo analiza con Gemini
// y genera un informe en PDF con estilo SUNASS.

import fs from "fs";
import path from "path";
import pdf from "pdf-parse";
import PDFDocument from "pdfkit";
import { GoogleGenAI, Type } from "@google/genai";

// -------------------------------
// Tipos de datos
// -------------------------------

enum Relevance {
  ALTA = "Alta",
  MEDIA = "Media",
  BAJA = "Baja",
  NINGUNA = "Ninguna",
}

type Norm = {
  sector: string;
  normId: string;
  title: string;
  publicationDate: string;
  summary: string;
  relevanceToWaterSector: Relevance;
  pageNumber: number;
};

type Appointment = {
  institution: string;
  personName: string;
  position: string;
  summary: string;
};

type AnalysisResult = {
  gazetteDate: string;
  norms: Norm[];
  designatedAppointments: Appointment[];
  concludedAppointments: Appointment[];
};

// -------------------------------
// Utilidades
// -------------------------------

const ROOT_DIR = __dirname;
const DOWNLOADS_DIR = path.join(ROOT_DIR, "downloads");
const REPORTS_DIR = path.join(ROOT_DIR, "reports");

// Colores aproximados institucionales SUNASS
const SUNASS_BLUE = "#0055A4";
const SUNASS_LIGHT_BLUE = "#00A3E0";
const SUNASS_GRAY = "#4D4D4D";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLatestPdf(): { fileName: string; fullPath: string } {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    throw new Error(`No existe la carpeta downloads: ${DOWNLOADS_DIR}`);
  }

  const pdfFiles = fs
    .readdirSync(DOWNLOADS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (pdfFiles.length === 0) {
    throw new Error(
      `No se encontraron PDFs en ${DOWNLOADS_DIR}. Asegúrate de que main.py deje una copia local.`
    );
  }

  const sorted = pdfFiles
    .map((fileName) => {
      const fullPath = path.join(DOWNLOADS_DIR, fileName);
      const stats = fs.statSync(fullPath);
      return { fileName, fullPath, mtime: stats.mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return { fileName: sorted[0].fileName, fullPath: sorted[0].fullPath };
}

async function extractPagesText(pdfPath: string) {
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdf(buffer);

  const rawPages = data.text.split("\f");

  const pagesText = rawPages
    .map((text: string, index: number) => ({
      page: index + 1,
      text: text.trim(),
    }))
    .filter((p) => p.text.length > 0);

  return pagesText;
}
  

// -------------------------------
// Llamada a Gemini
// -------------------------------

async function analyzeWithGemini(
  pagesText: Array<{ page: number; text: string }>
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurado como secret en GitHub.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const model = "gemini-2.5-flash";


  const formattedText = pagesText
    .map(
      (p) => `--- PÁGINA ${p.page} ---\n${p.text}\n--- FIN PÁGINA ${p.page} ---`
    )
    .join("\n\n");

  const systemInstruction = `
    Eres un analista legal experto especializado en la legislación peruana. Tu tarea es analizar el texto del diario oficial "El Peruano" que te proporcionaré. El texto está estructurado por páginas.

    Debes realizar tres tareas principales:
    1.  Identificar la fecha de publicación principal del cuadernillo y ponerla en el campo 'gazetteDate'.
    2.  Extraer todas las normas legales (Resoluciones Ministeriales, Decretos Supremos, Leyes, etc.).
    3.  Identificar todos los movimientos de cargos públicos y clasificarlos en dos listas separadas: designados (nuevos nombramientos) y concluidos (renuncias aceptadas, ceses).

    Para cada norma legal extraída, proporciona la siguiente información:
    -   sector: El ministerio o sector gubernamental que emite la norma.
    -   normId: El identificador único de la norma.
    -   title: El título o sumilla de la norma.
    -   publicationDate: La fecha de publicación de la norma.
    -   summary: Un resumen conciso del propósito de la norma.
    -   relevanceToWaterSector: Clasifica la relevancia de la norma para el sector "Agua y Saneamiento" ('Alta', 'Media', 'Baja', 'Ninguna').
    -   pageNumber: El número de la página del PDF donde se encuentra la norma, basado en los marcadores "--- PÁGINA X ---".

    Para cada movimiento de cargo público, tanto designado como concluido, proporciona:
    -   institution: La institución o entidad gubernamental (ej. Ministerio de Defensa, COFOPRI, PROINVERSION).
    -   personName: El nombre completo de la persona.
    -   position: El cargo o posición afectado.
    -   summary: Un resumen breve de la acción.

    Analiza el siguiente texto y devuelve los resultados en el formato JSON especificado.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: `Aquí está el texto del diario: ${formattedText}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          gazetteDate: { type: Type.STRING },
          norms: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sector: { type: Type.STRING },
                normId: { type: Type.STRING },
                title: { type: Type.STRING },
                publicationDate: { type: Type.STRING },
                summary: { type: Type.STRING },
                relevanceToWaterSector: {
                  type: Type.STRING,
                  enum: [
                    Relevance.ALTA,
                    Relevance.MEDIA,
                    Relevance.BAJA,
                    Relevance.NINGUNA,
                  ],
                },
                pageNumber: { type: Type.NUMBER },
              },
              required: [
                "sector",
                "normId",
                "title",
                "publicationDate",
                "summary",
                "relevanceToWaterSector",
                "pageNumber",
              ],
            },
          },
          designatedAppointments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                institution: { type: Type.STRING },
                personName: { type: Type.STRING },
                position: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
              required: ["institution", "personName", "position", "summary"],
            },
          },
          concludedAppointments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                institution: { type: Type.STRING },
                personName: { type: Type.STRING },
                position: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
              required: ["institution", "personName", "position", "summary"],
            },
          },
        },
        required: [
          "gazetteDate",
          "norms",
          "designatedAppointments",
          "concludedAppointments",
        ],
      },
    },
  });

  const jsonString = response.text;
  const parsed = JSON.parse(jsonString ?? "{}");

  // Aseguramos arrays aunque vengan nulos
  if (!parsed.norms) parsed.norms = [];
  if (!parsed.designatedAppointments)
    parsed.designatedAppointments = [];
  if (!parsed.concludedAppointments)
    parsed.concludedAppointments = [];
  if (!parsed.gazetteDate) parsed.gazetteDate = "Fecha no encontrada";

  return parsed as AnalysisResult;
}

// -------------------------------
// Generación del PDF estilo SUNASS
// -------------------------------

function drawHeader(doc: any, gazetteDate: string, fileName: string) {
  const { width } = doc.page;

  // Franja azul
  doc.save();
  doc.rect(0, 0, width, 70).fill(SUNASS_BLUE);
  doc.restore();

  doc
    .fillColor("white")
    .fontSize(18)
    .text('SUNASS - Análisis de Normas Legales', 50, 20);

  doc
    .fontSize(11)
    .text(`Diario Oficial "El Peruano"`, 50, 40);

  doc
    .fontSize(10)
    .text(`Fecha del diario: ${gazetteDate}`, 50, 55);

  doc.moveDown();
  doc.fillColor("black");
  doc.moveDown();
  doc.fontSize(11).text(`Archivo analizado: ${fileName}`);
  doc.moveDown(0.5);
}

function sectionTitle(doc: any, title: string) {
  doc.moveDown(1);
  doc.fillColor(SUNASS_LIGHT_BLUE).fontSize(14).text(title);
  const y = doc.y + 2;
  doc
    .moveTo(50, y)
    .lineTo(doc.page.width - 50, y)
    .lineWidth(2)
    .strokeColor(SUNASS_LIGHT_BLUE)
    .stroke();
  doc.moveDown(0.7);
  doc.fillColor("black").fontSize(10);
}

function renderNorms(doc: any, norms: Norm[]) {
  if (norms.length === 0) {
    doc.text("No se encontraron normas legales relevantes.");
    return;
  }

  norms.forEach((norm, index) => {
    doc
      .fillColor(SUNASS_BLUE)
      .fontSize(11)
      .text(`${index + 1}. ${norm.title}`, { continued: false });

    doc
      .fillColor(SUNASS_GRAY)
      .fontSize(9)
      .text(
        `Sector: ${norm.sector} | Id: ${norm.normId} | Publicación: ${norm.publicationDate} | Página: ${norm.pageNumber}`
      );

    doc.moveDown(0.3);
    doc.fillColor("black").fontSize(9).text(norm.summary);
    doc.moveDown(0.6);
  });
}

function renderAppointments(
  doc: any,
  title: string,
  items: Appointment[]
) {
  sectionTitle(doc, title);

  if (items.length === 0) {
    doc.text("No se encontraron registros.");
    return;
  }

  items.forEach((appt, index) => {
    doc
      .fillColor(SUNASS_BLUE)
      .fontSize(11)
      .text(`${index + 1}. ${appt.personName}`, { continued: false });

    doc
      .fillColor(SUNASS_GRAY)
      .fontSize(9)
      .text(
        `Institución: ${appt.institution} | Cargo: ${appt.position}`
      );

    doc.moveDown(0.3);
    doc.fillColor("black").fontSize(9).text(appt.summary);
    doc.moveDown(0.6);
  });
}

function generateReportPdf(
  analysis: AnalysisResult,
  sourceFileName: string
): string {
  ensureDir(REPORTS_DIR);

  const safeDate = analysis.gazetteDate
    .replace(/[^\wÀ-ÿ]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  const outPath = path.join(
    REPORTS_DIR,
    `analisis-el-peruano-${safeDate || "sin-fecha"}.pdf`
  );

  const doc: any = new PDFDocument({ margin: 50, size: "A4" });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  drawHeader(doc, analysis.gazetteDate, sourceFileName);

  sectionTitle(doc, "Normas legales relevantes");
  renderNorms(doc, analysis.norms);

  renderAppointments(
    doc,
    "Movimientos de cargos públicos - Designados",
    analysis.designatedAppointments
  );

  renderAppointments(
    doc,
    "Movimientos de cargos públicos - Concluidos",
    analysis.concludedAppointments
  );

  doc.end();

  return outPath;
}

// -------------------------------
// Programa principal
// -------------------------------

async function main() {
  console.log("🔎 Buscando último PDF descargado...");
  const latest = getLatestPdf();
  console.log(`   Usando archivo: ${latest.fileName}`);

  console.log("📄 Extrayendo texto por página...");
  const pagesText = await extractPagesText(latest.fullPath);

  console.log("🤖 Llamando a Gemini para análisis estructurado...");
  const analysis = await analyzeWithGemini(pagesText);

  console.log("📊 Generando informe PDF estilo SUNASS...");
  const reportPath = generateReportPdf(analysis, latest.fileName);

  console.log(`✅ Informe generado en: ${reportPath}`);
}

main().catch((err) => {
  console.error("❌ Error en analyze.ts:", err);
  process.exit(1);
});
