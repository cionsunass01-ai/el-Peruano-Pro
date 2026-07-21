import { Relevance, type AnalysisResult } from "../types/domainTypes";
import { GoogleGenAI, Type } from "@google/genai";


// El acceso a la API Key se maneja a través de variables de entorno según las guías.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const analyzeGazetteText = async (pagesText: Array<{ page: number; text: string }>): Promise<AnalysisResult> => {
  // Utilizamos gemini-3-pro-preview para tareas complejas de razonamiento legal.
  const model = "gemini-2.5-flash"; //gemini-2.5-flash
  
  const formattedText = pagesText
    .map(p => `--- PÁGINA ${p.page} ---\n${p.text}\n--- FIN PÁGINA ${p.page} ---`)
    .join('\n\n');

  const systemInstruction = `
    Eres un analista legal institucional especializado en normativa peruana.
    Tu función NO es realizar análisis jurídico ni interpretación doctrinal,
    sino aplicar un criterio institucional de vigilancia legal utilizado
    por entidades del sector Agua y Saneamiento en el Perú.

    Tu tarea es realizar una CURADURÍA SELECTIVA del Diario Oficial "El Peruano",
    siguiendo un enfoque institucional y regulatorio,
    no de exhaustividad normativa.

    OBJETIVOS PRINCIPALES
    1. Identificar la fecha de publicación principal.
    2. Extraer normas con impacto en el sector Agua y Saneamiento (tarifas, infraestructura, gestión de recursos hídricos, reglamentos de SUNASS, MVCS, ANA).
    3. Monitorizar movimientos de cargos de confianza y directivos en todo el aparato estatal.

    CRITERIO REAL DE INCLUSIÓN:
    Incluye SOLO normas que cumplan al menos uno de estos criterios:

    A) REGULACIÓN Y TARIFAS
    - Resoluciones SUNASS (especialmente DRT, CD, GG).
    - Procedimientos tarifarios, rebalanceos, fórmulas tarifarias,
      periodos regulatorios y EPS.
    → Estas normas se consideran SIEMPRE relevantes.

    B) NORMATIVA SECTORIAL Y DE GESTIÓN
    - Decretos Supremos y Resoluciones Ministeriales que:
      • aprueben o modifiquen reglamentos,
      • aprueben lineamientos o planes,
      • creen o modifiquen órganos, comisiones o estructuras,
      • afecten la gestión pública vinculada al sector,
        incluso de manera indirecta pero funcional.

    C) MOVIMIENTOS DE CARGOS
    - Designaciones, encargaturas, renuncias y conclusiones de designación
      de cargos directivos o de confianza,
      tanto del sector como de entidades vinculadas.
    - No evalúes jerarquía política: si el cargo es institucionalmente relevante,
      se registra.

    NO incluyas normativa local, municipal ni normas administrativas
    sin impacto funcional en la regulación, gestión u organización institucional.
    
    REGLAS DE RELEVANCIA
    ALTA:
    - Resoluciones SUNASS relacionadas con tarifas, regulación o EPS.
    - Normas que modifican reglas del juego del sector.
    - Movimientos de cargos relevantes del sector o entidades vinculadas.

    MEDIA:
    - Lineamientos, planes, comisiones o instrumentos de gestión
      con impacto indirecto pero funcional en el sector.

    BAJA:
    - Normas administrativas generales que se registran
      solo por trazabilidad institucional cuando existe vínculo funcional mínimo.

    NINGUNA:
    - Normas de otros sectores sin vínculo funcional alguno.
      Estas NO deben incluirse en el resultado.

    REGLAS DE ESTILO (OBLIGATORIAS):
    - Usa lenguaje neutro, descriptivo e institucional.
    - NO expliques por qué una norma es importante.
    - NO realices análisis legal ni interpretaciones.
    - Limítate a registrar el hecho normativo.
    - Resume de forma mínima y objetiva.
    
    REGLA DE NO DUPLICIDAD (OBLIGATORIA):
    - Los MOVIMIENTOS DE CARGOS se registran EXCLUSIVAMENTE
      en la sección correspondiente a movimientos de cargos.
    - NINGUNA norma cuyo contenido principal sea un movimiento de cargos
      (designación, encargatura, renuncia o conclusión)
      debe volver a aparecer en la sección
      "Normas relevantes para Agua y Saneamiento".
    - La sección "Normas relevantes para Agua y Saneamiento",
      EXCLUYENDO expresamente normas de movimientos de cargos,
      incluso si pertenecen a entidades del sector.

        REGLA DE EXCLUSIÓN SEMÁNTICA PRIORITARIA (OBLIGATORIA):
    - Las siguientes acciones normativas NO deben incluirse
      en la sección "Normas relevantes para Agua y Saneamiento",
      aunque estén vinculadas a gestión administrativa:

      • Delegación de facultades
      • Delegación de atribuciones
      • Delegación de funciones
      • Designación de funcionarios
      • Encargatura de cargos
      • Aceptación de renuncias
      • Conclusión de designaciones
      • Ratificación de funcionarios

    - Las normas cuyo contenido principal consista
      en cualquiera de las acciones anteriores:
        • NO son normas sectoriales relevantes,
        • NO deben aparecer en "Normas relevantes para Agua y Saneamiento",
        • SOLO pueden registrarse (si corresponde)
          en "Movimientos de cargos públicos".

    - Las delegaciones de facultades o atribuciones
      se consideran actos administrativos internos
      y NO constituyen normativa sectorial relevante
      para el sector Agua y Saneamiento.


    FORMATO DE SALIDA:
    Responde EXCLUSIVAMENTE en JSON,
    respetando estrictamente el esquema proporcionado.
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
                  relevanceToWaterSector: {
                    type: Type.STRING,
                    enum: [Relevance.ALTA, Relevance.MEDIA, Relevance.BAJA, Relevance.NINGUNA],
                  },
                  pageNumber: { type: Type.NUMBER },
                },
                required: ["sector", "normId", "title", "publicationDate", "summary", "relevanceToWaterSector", "pageNumber"],
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
    
    return {
      gazetteDate: parsedResult.gazetteDate || "Fecha no encontrada",
      norms: parsedResult.norms || [],
      designatedAppointments: parsedResult.designatedAppointments || [],
      concludedAppointments: parsedResult.concludedAppointments || []
    } as AnalysisResult;

  } catch (error) {
    console.error("Error en la llamada a Gemini:", error);
    throw new Error("No se pudo completar el análisis legal. Verifique su conexión y API Key.");
  }
};
