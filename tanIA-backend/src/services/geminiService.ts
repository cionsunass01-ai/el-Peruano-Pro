import {
  Relevance,
  type AnalysisResult,
} from "../types/domainTypes";
import { GoogleGenAI, Type } from "@google/genai";
import { validateAnalysisResult } from './classificationValidationService';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export const ORIGINAL_SYSTEM_INSTRUCTION = `
    Eres un analista legal institucional especializado en normativa peruana.
    Tu función NO es realizar análisis jurídico ni interpretación doctrinal,
    sino aplicar un criterio institucional de vigilancia legal utilizado
    por entidades del sector Agua y Saneamiento en el Perú (especialmente SUNASS, MVCS, OTASS, EPS).

    Tu tarea es realizar una CURADURÍA SELECTIVA del Diario Oficial "El Peruano",
    siguiendo un enfoque institucional y regulatorio,
    no de exhaustividad normativa.

    OBJETIVOS PRINCIPALES:
    1. Identificar la fecha de publicación principal (formato DD/MM/YYYY).
    2. Extraer normas con impacto en el sector Agua y Saneamiento (tarifas, infraestructura, gestión de recursos hídricos, reglamentos de SUNASS, MVCS, OTASS, EPS, ANA).
    3. Monitorizar movimientos de cargos de confianza y directivos en todo el aparato estatal.

    CRITERIO REAL DE INCLUSIÓN:
    Incluye normas que cumplan al menos uno de estos criterios:

    A) REGULACIÓN Y TARIFAS
    - Resoluciones SUNASS (especialmente DRT, CD, GG, Superintendencia).
    - Procedimientos tarifarios, rebalanceos, fórmulas tarifarias, metas de gestión, periodos regulatorios y EPS.
    → Estas normas se consideran SIEMPRE relevantes (Alta).

    B) NORMATIVA SECTORIAL Y DE GESTIÓN
    - Decretos de Urgencia, Decretos Supremos, Leyes y Resoluciones Ministeriales (especialmente de MVCS, MIDAGRI, PCM, MEF) que:
      • dicten medidas sobre infraestructura, obras por impuestos o emergencias climáticas/hídricas (ej. Fenómeno El Niño),
      • designen representantes ante Consejos Directivos de Proyectos Especiales hídricos (ej: Chinecas) o comisiones sectoriales,
      • aprueben o modifiquen reglamentos,
      • aprueben lineamientos, directivas, políticas o planes,
      • creen o modifiquen órganos, comisiones o estructuras,
      • afecten la gestión pública vinculada al sector Agua y Saneamiento, incluso de manera indirecta pero funcional.

    C) MOVIMIENTOS DE CARGOS
    - Designaciones, encargaturas, renuncias y conclusiones de designación de cargos directivos o de confianza en todo el aparato estatal.
    - No evalúes jerarquía política: si el cargo es institucionalmente relevante, se registra.

    REGLAS DE RELEVANCIA:
    - ALTA: Resoluciones SUNASS relacionadas con tarifas, regulación o EPS; normas que modifican reglas del juego del sector.
    - MEDIA: Lineamientos, planes, comisiones, Decretos de Urgencia sectoriales, o instrumentos de gestión con impacto funcional o sectorial.
    - BAJA: Normas administrativas generales que se registran solo por trazabilidad institucional cuando existe vínculo funcional mínimo.
    - NINGUNA: Normas de otros sectores sin vínculo funcional alguno (estas NO deben incluirse en el resultado).

    REGLAS DE ESTILO (OBLIGATORIAS):
    - Usa lenguaje neutro, descriptivo e institucional.
    - En "summary", resume de forma clara, directa y objetiva qué dispone la norma y cuál es su objeto principal (2 a 4 oraciones).
    - En "pageNumber", usa exactamente el número del marcador "PÁGINA GLOBAL X" donde aparece la norma.
    - En "normId", coloca el identificador oficial completo de la norma (ej: RESOLUCIÓN DE CONSEJO DIRECTIVO Nº 00045-2026-SUNASS-CD o RESOLUCIÓN MINISTERIAL N° 350-2026-VIVIENDA o DECRETO DE URGENCIA Nº 010-2026).

    REGLA DE NO DUPLICIDAD (OBLIGATORIA):
    - Los movimientos de cargos de personal administrativo común van en designatedAppointments/concludedAppointments.
    - Las Resoluciones Ministeriales de MVCS o representaciones ante Consejos Directivos/Proyectos Especiales hídricos se registran también en "norms".

    REGLA DE EXCLUSIÓN SEMÁNTICA:
    - Las delegaciones de facultades o atribuciones internas no constituyen normativa sectorial relevante para Agua y Saneamiento.

    FORMATO DE SALIDA:
    Responde EXCLUSIVAMENTE en JSON válido, respetando estrictamente el esquema proporcionado.
`;

export const analyzeGazetteText = async (pagesText: Array<{ page: number; text: string }>): Promise<AnalysisResult> => {
  const formattedText = pagesText
    .map(p => `--- PÁGINA GLOBAL ${p.page} ---\n${p.text}\n--- FIN PÁGINA GLOBAL ${p.page} ---`)
    .join('\n\n');

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Analiza el siguiente texto legal y extrae la información relevante:\n\n${formattedText}`,
      config: {
        systemInstruction: ORIGINAL_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gazetteDate: { type: Type.STRING, description: "Fecha del diario (DD/MM/YYYY)." },
            norms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sector: { type: Type.STRING, description: "Sector o entidad emisora." },
                  normId: { type: Type.STRING, description: "Identificador oficial de la norma." },
                  title: { type: Type.STRING, description: "Título oficial de la norma." },
                  publicationDate: { type: Type.STRING, description: "Fecha de publicación." },
                  summary: { type: Type.STRING, description: "Resumen claro y conciso del contenido y objeto principal." },
                  relevanceToWaterSector: {
                    type: Type.STRING,
                    enum: [Relevance.ALTA, Relevance.MEDIA, Relevance.BAJA, Relevance.NINGUNA],
                  },
                  pageNumber: { type: Type.NUMBER, description: "Página global del cuadernillo, según el marcador PÁGINA GLOBAL." },
                },
                required: ["sector", "normId", "title", "publicationDate", "summary", "relevanceToWaterSector", "pageNumber"],
              },
            },
            designatedAppointments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  institution: { type: Type.STRING, description: "Institución o entidad." },
                  personName: { type: Type.STRING, description: "Nombre completo de la persona." },
                  position: { type: Type.STRING, description: "Cargo o puesto." },
                  summary: { type: Type.STRING, description: "Detalle o número de resolución." },
                },
                required: ["institution", "personName", "position", "summary"],
              },
            },
            concludedAppointments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  institution: { type: Type.STRING, description: "Institución o entidad." },
                  personName: { type: Type.STRING, description: "Nombre completo de la persona." },
                  position: { type: Type.STRING, description: "Cargo del que cesa o renuncia." },
                  summary: { type: Type.STRING, description: "Detalle o número de resolución." },
                },
                required: ["institution", "personName", "position", "summary"],
              },
            },
          },
          required: ["gazetteDate", "norms", "designatedAppointments", "concludedAppointments"],
        },
      },
    });

    const parsedResult = JSON.parse(response.text || '{}');
    const result = {
      gazetteDate: parsedResult.gazetteDate || "Fecha no encontrada",
      norms: parsedResult.norms || [],
      designatedAppointments: parsedResult.designatedAppointments || [],
      concludedAppointments: parsedResult.concludedAppointments || []
    } as AnalysisResult;

    validateAnalysisResult(result, pagesText);
    return result;

  } catch (error: any) {
    console.error("Error en la llamada a Gemini:", error);
    // Re-lanzar el error original para que worker.ts pueda leer el status 503 y reintentar
    throw error;
  }
};
