import { Buffer } from 'buffer';
import { getOldestPendingExecution, updateManifestStatus, downloadFileAsBuffer, Manifest } from "./services/driveService"
import { extractTextFromPdf } from "./services/pdfService";
import { analyzeGazetteText } from "./services/geminiService"
import { AnalysisResult, Norm, Appointment } from "./types/domainTypes";
import { generateAnalysisWordBuffer } from "./services/wordService";
import { normalizeNormId } from './utils/normalizeNormId';

import {
  generateAnalysisPdfBlob,
  generateCsvBlob
} from "./services/reportGenerator";
import { sendEmailWithAttachments, checkIfEmailSent } from './services/gmailService';

function consolidateAnalysisResults(results: AnalysisResult[]): AnalysisResult {
  if (results.length === 0) {
    return {
      gazetteDate: "Fecha no encontrada",
      norms: [],
      designatedAppointments: [],
      concludedAppointments: []
    };
  }

  const gazetteDate = results[results.length - 1].gazetteDate;

  const normsMap = new Map<string, Norm>();
  for (const result of results) {
    for (const norm of result.norms) {
      const key = norm.normId;
      if (!normsMap.has(key)) normsMap.set(key, norm);
    }
  }

  const appointmentKey = (a: Appointment): string => `${a.institution}|${a.personName}|${a.position}`;

  const designatedMap = new Map<string, Appointment>();
  for (const result of results) {
    for (const appt of result.designatedAppointments) {
      const key = appointmentKey(appt);
      if (!designatedMap.has(key)) designatedMap.set(key, appt);
    }
  }

  const concludedMap = new Map<string, Appointment>();
  for (const result of results) {
    for (const appt of result.concludedAppointments) {
      const key = appointmentKey(appt);
      if (!concludedMap.has(key)) concludedMap.set(key, appt);
    }
  }

  return {
    gazetteDate,
    norms: Array.from(normsMap.values()),
    designatedAppointments: Array.from(designatedMap.values()),
    concludedAppointments: Array.from(concludedMap.values())
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeWithRetry(pages: Array<{ page: number; text: string }>, maxRetries = 3): Promise<AnalysisResult> {
  let attempt = 0;
  let delayMs = 5000;
  while (true) {
    try {
      return await analyzeGazetteText(pages);
    } catch (error: any) {
      attempt++;
      const status = error?.status || error?.code;
      const isRetryable = status === 503 || status === 'UNAVAILABLE' || error.message?.includes('overloaded') || error.message?.includes('fetch failed');
      if (!isRetryable || attempt > maxRetries) throw error;
      console.warn(`Gemini saturado (intento ${attempt}/${maxRetries}). Reintentando en ${delayMs / 1000}s...`);
      await delay(delayMs);
      delayMs *= 2;
    }
  }
}

function getValidatedEmails(): string {
    const raw = process.env.EMAIL_RECIPIENTS;
    if (!raw) throw new Error("Falta la variable de entorno EMAIL_RECIPIENTS");
    const emails = raw.split(',').map(e => e.trim()).filter(e => e !== '');
    if (emails.length === 0) throw new Error("EMAIL_RECIPIENTS no contiene direcciones válidas");
    return emails.join(', ');
}

function validateManifest(manifest: Manifest) {
    if (!manifest.index_file || manifest.index_file.size === 0) {
        throw new Error("Manifest inválido: Falta index_file o tamaño es 0.");
    }
    
    if (manifest.expected_blocks !== manifest.uploaded_files.length) {
        throw new Error(`Manifest inválido: expected_blocks (${manifest.expected_blocks}) != uploaded_files (${manifest.uploaded_files.length})`);
    }
    
    // Ordenar por página de inicio para verificar continuidad
    const files = [...manifest.uploaded_files].sort((a, b) => a.start_page - b.start_page);
    let expectedNextPage = 1;
    
    for (const f of files) {
        if (f.size === 0) throw new Error(`Archivo ${f.name} tiene tamaño 0.`);
        if (f.start_page !== expectedNextPage) {
            throw new Error(`Rango discontinuo en ${f.name}: se esperaba empezar en ${expectedNextPage} pero empieza en ${f.start_page}`);
        }
        expectedNextPage = f.end_page + 1;
    }
    
    // Verificar duplicados
    const ids = new Set();
    for (const f of manifest.uploaded_files) {
        if (ids.has(f.id)) throw new Error(`Archivo duplicado detectado: ${f.id}`);
        ids.add(f.id);
    }
}

(async () => {
  let manifestToProcess: Manifest | null = null;
  try {
    console.log('TANIA – INICIANDO PIPELINE DE PROCESAMIENTO');
    
    const emailTo = getValidatedEmails();
    
    manifestToProcess = await getOldestPendingExecution();
    if (!manifestToProcess) {
        console.log("No hay ejecuciones completas pendientes por procesar.");
        return;
    }
    
    console.log(`[+] Procesando ejecución: ${manifestToProcess.run_id} del ${manifestToProcess.date}`);
    
    try {
        validateManifest(manifestToProcess);
    } catch (valErr) {
        console.error(valErr);
        await updateManifestStatus(manifestToProcess, 'failed', { error: valErr.message });
        return;
    }
    
    // Marcar en procesamiento
    await updateManifestStatus(manifestToProcess, 'processing');
    
    // 1. Cargar índice
    console.log("Cargando indice de normas desde Drive...");
    const indexBuf = await downloadFileAsBuffer(manifestToProcess.index_file!.id);
    const indexContent = JSON.parse(indexBuf.toString('utf-8'));
    const indiceNormas: Record<string, string> = {};
    for (const norma of indexContent.normas ?? []) {
      if (norma.titulo && norma.url) indiceNormas[normalizeNormId(norma.titulo)] = norma.url;
    }
    console.log(`Indice cargado (${Object.keys(indiceNormas).length} normas)`);

    // 2. Cargar PDFs (ordenados por página inicial)
    const sortedFiles = [...manifestToProcess.uploaded_files].sort((a, b) => a.start_page - b.start_page);
    const analysisResults: AnalysisResult[] = [];

    for (let i = 0; i < sortedFiles.length; i++) {
      const f = sortedFiles[i];
      console.log(`\n[${i + 1}/${sortedFiles.length}] Procesando: ${f.name}`);

      const buffer = await downloadFileAsBuffer(f.id);
      
      console.log("Extrayendo texto del PDF...");
      const pages = await extractTextFromPdf(buffer, (p) => console.log(`  Progreso: ${p}%`));
      
      console.log("Analizando con Gemini...");
      const analysis = await analyzeWithRetry(pages);
      analysisResults.push(analysis);
      
      await delay(5000);
    }

    console.log("\nConsolidando resultados...");
    const consolidatedAnalysis = consolidateAnalysisResults(analysisResults);
    
    // Override de fecha gazette a partir del manifest en lugar del PDF, es más seguro
    const day = manifestToProcess.date.substring(6,8);
    const month = manifestToProcess.date.substring(4,6);
    const year = manifestToProcess.date.substring(0,4);
    consolidatedAnalysis.gazetteDate = `${day}/${month}/${year}`;

    // 3. Generar adjuntos
    console.log("Generando PDF...");
    const pdfBlob = generateAnalysisPdfBlob(consolidatedAnalysis, `cuadernillo-${sortedFiles.length}-bloques`, indiceNormas);
    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

    console.log("Generando Word...");
    const wordBuffer = await generateAnalysisWordBuffer(consolidatedAnalysis, `cuadernillo-${sortedFiles.length}-bloques`, indiceNormas);

    console.log('Generando CSVs...');
    const normsCsvBlob = generateCsvBlob(
      consolidatedAnalysis.norms.filter(n => n.relevanceToWaterSector !== 'Ninguna'),
      { sector: 'Sector', normId: 'Norma', title: 'Título', publicationDate: 'Fecha', summary: 'Resumen', relevanceToWaterSector: 'Relevancia', pageNumber: 'Página' }
    );
    const normsCsvBuffer = Buffer.from(await normsCsvBlob.arrayBuffer());

    const appointmentsCsvBlob = generateCsvBlob(
      [...consolidatedAnalysis.designatedAppointments, ...consolidatedAnalysis.concludedAppointments],
      { institution: 'Institución', personName: 'Nombre', position: 'Cargo', summary: 'Resumen' }
    );
    const appointmentsCsvBuffer = Buffer.from(await appointmentsCsvBlob.arrayBuffer());

    // 4. Verificación Idempotente de Email
    console.log('Verificando si ya se envió el correo para este run_id...');
    let existingMsgId = await checkIfEmailSent(manifestToProcess.run_id);
    
    if (existingMsgId) {
        console.log(`El correo ya fue enviado previamente. Message ID: ${existingMsgId}`);
    } else {
        console.log('Enviando correo...');
        existingMsgId = await sendEmailWithAttachments(
          emailTo,
          `TanIA, Analisis El Peruano (${consolidatedAnalysis.gazetteDate}) - RUN ID: ${manifestToProcess.run_id}`,
          `Hola,\n\nSe adjunta el análisis automático del Diario Oficial El Peruano.\n\nSaludos,\nTanIA – El Peruano 2.0`,
          [
            { filename: `analisis-${manifestToProcess.date}.pdf`, mimeType: 'application/pdf', content: pdfBuffer },
            { filename: `analisis-${manifestToProcess.date}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content: wordBuffer },
            { filename: `normas-${manifestToProcess.date}.csv`, mimeType: 'text/csv', content: normsCsvBuffer },
            { filename: `cargos-${manifestToProcess.date}.csv`, mimeType: 'text/csv', content: appointmentsCsvBuffer },
          ]
        );
    }

    // 5. Marcar como completado
    await updateManifestStatus(manifestToProcess, 'processed', {
        email_sent: true,
        gmail_message_id: existingMsgId,
        email_sent_at: new Date().toISOString()
    });

    console.log("\nTANIA – PIPELINE COMPLETADO EXITOSAMENTE");
    
  } catch (error: any) {
    console.error("Error en el pipeline TanIA:", error);
    if (manifestToProcess) {
        try {
            await updateManifestStatus(manifestToProcess, 'failed', { error: error.message || error.toString() });
        } catch (e) {
            console.error("No se pudo actualizar el estado de fallo:", e);
        }
    }
  }
})();
