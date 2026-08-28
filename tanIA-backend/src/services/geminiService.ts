import {
  ImpactDimension,
  ImpactType,
  Relevance,
  type AnalysisResult,
} from "../types/domainTypes";
import { GoogleGenAI, Type } from "@google/genai";
import { validateAnalysisResult } from './classificationValidationService';
import { LEGAL_ANALYSIS_SYSTEM_PROMPT } from './legalAnalysisPrompt';


// El acceso a la API Key se maneja a través de variables de entorno según las guías.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
export const GEMINI_MODEL = "gemini-2.5-flash";

export const analyzeGazetteText = async (pagesText: Array<{ page: number; text: string }>): Promise<AnalysisResult> => {
  const formattedText = pagesText
    .map(p => `--- PÁGINA GLOBAL ${p.page} ---\n${p.text}\n--- FIN PÁGINA GLOBAL ${p.page} ---`)
    .join('\n\n');

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Analiza el siguiente texto legal y extrae la información relevante:\n\n${formattedText}`,
      config: {
        systemInstruction: LEGAL_ANALYSIS_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gazetteDate: { type: Type.STRING, description: "Fecha del diario." },
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
                  object: { type: Type.STRING },
                  affectedSubjects: { type: Type.STRING },
                  applicationScope: { type: Type.STRING },
                  sunassRelationship: { type: Type.STRING },
                  impactDimension: {
                    type: Type.STRING,
                    enum: [
                      ImpactDimension.SECTORIAL,
                      ImpactDimension.INSTITUCIONAL_TRANSVERSAL,
                      ImpactDimension.AMBAS,
                      ImpactDimension.NINGUNA,
                    ],
                  },
                  impactType: {
                    type: Type.STRING,
                    enum: [ImpactType.DIRECTO, ImpactType.INDIRECTO, ImpactType.INEXISTENTE],
                  },
                  relevanceToWaterSector: {
                    type: Type.STRING,
                    enum: [Relevance.ALTA, Relevance.MEDIA, Relevance.BAJA, Relevance.NINGUNA],
                  },
                  classificationReason: { type: Type.STRING },
                  pageNumber: { type: Type.NUMBER, description: "Página global del cuadernillo, según el marcador PÁGINA GLOBAL." },
                },
                required: [
                  "sector",
                  "normId",
                  "title",
                  "publicationDate",
                  "summary",
                  "object",
                  "affectedSubjects",
                  "applicationScope",
                  "sunassRelationship",
                  "impactDimension",
                  "impactType",
                  "relevanceToWaterSector",
                  "classificationReason",
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
