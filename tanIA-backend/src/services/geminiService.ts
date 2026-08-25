import {
  ImpactDimension,
  ImpactType,
  Relevance,
  type AnalysisResult,
} from "../types/domainTypes";
import { GoogleGenAI, Type } from "@google/genai";
import { validateAnalysisResult } from './classificationValidationService';


// El acceso a la API Key se maneja a través de variables de entorno según las guías.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const analyzeGazetteText = async (pagesText: Array<{ page: number; text: string }>): Promise<AnalysisResult> => {
  // Utilizamos gemini-3-pro-preview para tareas complejas de razonamiento legal.
  const model = "gemini-2.5-flash"; //gemini-2.5-flash
  
  const formattedText = pagesText
    .map(p => `--- PÁGINA GLOBAL ${p.page} ---\n${p.text}\n--- FIN PÁGINA GLOBAL ${p.page} ---`)
    .join('\n\n');

  const systemInstruction = `
    Eres un analista legal institucional especializado en normativa peruana para SUNASS.

    Debes identificar, resumir y clasificar normas del Diario Oficial El Peruano según
    su relación material con SUNASS. No realices interpretación doctrinal ni emitas
    opiniones jurídicas. Basa la clasificación en el objeto, sujetos afectados,
    ámbito de aplicación y efecto funcional de cada norma.

    PRINCIPIO FUNDAMENTAL
    La presencia de keywords nunca determina por sí sola la relevancia. Las palabras
    "agua", "saneamiento", "SUNASS", "EPS", "Vivienda", "emergencia", "ministerio",
    "gobierno regional" o "municipalidad" solo son evidencia auxiliar.

    EXTRACCIÓN
    Devuelve todas las normas legales identificables que puedan ser evaluadas
    razonablemente, incluidas las clasificadas como Alta, Media, Baja o Ninguna.
    No filtres normas por relevancia antes de devolverlas. No incluyas publicidad,
    avisos ni contenido no normativo.

    Los movimientos de cargos deben aparecer únicamente en designatedAppointments o
    concludedAppointments y no deben duplicarse dentro de norms.

    MODELO DE ANÁLISIS
    Para cada norma identifica internamente:
    1. objeto real;
    2. sujetos afectados;
    3. ámbito de aplicación;
    4. relación material con SUNASS;
    5. dimensión;
    6. tipo de impacto;
    7. relevancia.

    DIMENSIÓN SECTORIAL
    Usa SECTORIAL cuando exista relación material con servicios de saneamiento, EPS,
    organizaciones comunales, regulación tarifaria, calidad o continuidad del servicio,
    inversiones o infraestructura de saneamiento, competencias regulatorias de SUNASS,
    o prestadores y usuarios bajo su ámbito.
    La pertenencia al sector Vivienda, Construcción y Saneamiento no es suficiente.

    DIMENSIÓN INSTITUCIONAL_TRANSVERSAL
    Usa INSTITUCIONAL_TRANSVERSAL únicamente cuando la norma sea aplicable concretamente
    a SUNASS como entidad pública y produzca un efecto real en recursos humanos,
    presupuesto, organización, contratación o gestión institucional.
    La aplicación genérica a entidades públicas no es suficiente.

    DIMENSIÓN AMBAS
    Usa AMBAS cuando exista simultáneamente impacto material en el sector o funciones
    regulatorias de SUNASS y un impacto institucional concreto en SUNASS.

    DIMENSIÓN NINGUNA
    Usa NINGUNA cuando no exista relación material con SUNASS. La relación temática,
    contextual, territorial, institucional o basada en keywords no constituye relevancia.

    RELEVANCIA ALTA
    Asigna Alta cuando el objeto produzca un impacto material, importante y verificable
    en funciones regulatorias, supervisoras o fiscalizadoras de SUNASS, tarifas,
    condiciones económicas, calidad, continuidad, prestación de saneamiento, EPS,
    prestadores regulados u obligaciones institucionales transversales de alta importancia.
    La justificación debe describir el impacto material verificable.

    RELEVANCIA MEDIA
    Asigna Media cuando exista relación concreta y verificable, pero el impacto sea
    indirecto, secundario, institucional moderado o corresponda a una obligación
    concreta no crítica de gestión pública o recursos humanos.

    RELEVANCIA BAJA
    Asigna Baja únicamente cuando exista una relación material, real y verificable con
    SUNASS, pero el impacto sea pequeño, periférico o de baja utilidad operativa.
    La Baja no puede justificarse por mera proximidad temática, contexto, trazabilidad
    o keywords. Si solo existe contexto sin aplicabilidad real, asigna Ninguna.

    RELEVANCIA NINGUNA
    Asigna Ninguna cuando no exista relación material con SUNASS. Incluye normas que
    solo contienen keywords, regulan exclusivamente a otra entidad, modifican el ROF
    o manual de cargos de otra institución, o se refieren genéricamente a servicios
    públicos sin afectar a SUNASS.

    TIPO DE IMPACTO
    Usa únicamente DIRECTO, INDIRECTO o INEXISTENTE.
    DIRECTO significa que la norma vincula o afecta directamente a SUNASS, sus funciones,
    prestadores regulados o servicios bajo su competencia.
    INDIRECTO significa que existe relación material verificable, pero el efecto es
    secundario o no inmediato.
    INEXISTENTE significa que no existe relación material con SUNASS.

    REGLAS NEGATIVAS
    - No clasifiques por keywords aisladas.
    - No clasifiques como Alta una norma solo porque mencione agua, saneamiento, EPS,
      SUNASS o emergencias.
    - No clasifiques como relevante una norma solo por su entidad emisora.
    - No clasifiques como relevante un ROF o manual de otra entidad.
    - No clasifiques como relevante una norma municipal o regional sin afectación material.
    - No clasifiques cualquier norma general del Estado como institucional transversal.
    - No clasifiques cualquier norma de SERVIR como Media o Alta.
    - SERVIR solo será relevante si impone una obligación concreta aplicable a SUNASS.
    - Designaciones, encargaturas, renuncias y conclusiones de designación solo se
      registran como movimientos de cargos.
    - Delegaciones de facultades, atribuciones o funciones no son sectorialmente
      relevantes por sí mismas.
    - No inventes sujetos, obligaciones ni impactos.
    - No confundas la entidad emisora con los sujetos afectados.
    - No confundas relación temática con relación funcional material.

    FEW-SHOT CONCEPTUALES
    Estos ejemplos enseñan reglas generales y no corresponden al benchmark de evaluación:

    1. Una norma de otra entidad menciona agua o saneamiento, pero regula únicamente
       su organización interna: dimensión NINGUNA, impacto INEXISTENTE, relevancia Ninguna.
    2. Una norma aprueba o modifica la tarifa de una EPS regulada por SUNASS:
       dimensión SECTORIAL, impacto DIRECTO, relevancia Alta.
    3. Una norma de SERVIR establece un procedimiento obligatorio aplicable a SUNASS:
       dimensión INSTITUCIONAL_TRANSVERSAL, impacto DIRECTO, relevancia Media.
    4. Una norma de SERVIR regula exclusivamente su propia organización o personal:
       dimensión NINGUNA, impacto INEXISTENTE, relevancia Ninguna.
    5. Un ROF o Manual de Cargos de otra entidad no afecta a SUNASS:
       dimensión NINGUNA, impacto INEXISTENTE, relevancia Ninguna.
    6. Una obligación administrativa menor, concreta y aplicable a SUNASS:
       dimensión INSTITUCIONAL_TRANSVERSAL, impacto DIRECTO, relevancia Baja.

    MOVIMIENTOS DE CARGOS
    Regístralos exclusivamente en designatedAppointments o concludedAppointments.
    No los dupliques dentro de norms.

    PÁGINAS
    pageNumber debe coincidir exactamente con el número del marcador "PÁGINA GLOBAL X".
    No reinicies ni recalcules la numeración.

    FORMATO
    Responde exclusivamente en JSON válido conforme al esquema proporcionado.
    Devuelve las cuatro categorías de relevancia. No incluyas confidence numérico.
    La inclusión en el reporte se determina fuera de Gemini: Alta y Media son reportables;
    Baja y Ninguna no son reportables.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Analiza el siguiente texto legal y extrae la información relevante:\n\n${formattedText}`,
      config: {
        systemInstruction,
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
