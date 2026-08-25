import { Buffer } from 'buffer';
import { getOldestPendingExecution, updateManifestStatus, downloadFileAsBuffer, Manifest } from "./services/driveService"
import { extractTextFromPdf } from "./services/pdfService";
import { analyzeGazetteText } from "./services/geminiService"
import { AnalysisResult } from "./types/domainTypes";
import { generateAnalysisWordBuffer } from "./services/wordService";
import { normalizeNormId } from './utils/normalizeNormId';

import {
  generateAnalysisPdfBlob,
  generateCsvBlob
} from "./services/reportGenerator";
import { sendEmailWithAttachments, checkIfEmailSent } from './services/gmailService';
import { consolidateAnalysisResults } from './services/consolidationService';
import { validateManifestPageRanges } from './services/pageMappingService';
import { isOperationallyReportable } from './services/reportPolicyService';

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeWithRetry(pages: Array<{ page: number; text: string }>, maxRetries = 7): Promise<AnalysisResult> {
  let attempt = 0;
  let delayMs = 5000;
  while (true) {
    try {
      return await analyzeGazetteText(pages);
    } catch (error: any) {
      attempt++;
      const status = error?.status || error?.code;
      const isRetryable = status === 503 || status === 'UNAVAILABLE' || status === 429 || status === 'RESOURCE_EXHAUSTED' || error.message?.includes('overloaded') || error.message?.includes('fetch failed');
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

    const validEmails = new Set<string>();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of emails) {
        if (!emailRegex.test(email)) {
            console.warn(`Formato de correo invalido omitido.`);
            continue;
        }
        validEmails.add(email);
    }

    if (validEmails.size === 0) throw new Error("EMAIL_RECIPIENTS no contiene direcciones vÃ¡lidas");
    return Array.from(validEmails).join(', ');
}

function validateManifest(manifest: Manifest) {
    if (!manifest.index_file || manifest.index_file.size === 0) {
        throw new Error("Manifest invÃ¡lido: Falta index_file o tamaÃ±o es 0.");
    }

    if (manifest.expected_blocks !== manifest.uploaded_files.length) {
        throw new Error(`Manifest invÃ¡lido: expected_blocks (${manifest.expected_blocks}) != uploaded_files (${manifest.uploaded_files.length})`);
    }

    const files = [...manifest.uploaded_files].sort((a, b) => a.start_page - b.start_page);

    for (const f of files) {
        if (f.size === 0) throw new Error(`Archivo ${f.name} tiene tamaÃ±o 0.`);
    }

    validateManifestPageRanges(files, manifest.total_pages);

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
    console.log('TANIA â€“ INICIANDO PIPELINE DE PROCESAMIENTO');

    const emailTo = getValidatedEmails();

    manifestToProcess = await getOldestPendingExecution();
    if (!manifestToProcess) {
        console.log("No hay ejecuciones completas pendientes por procesar.");
        return;
    }

    console.log(`[+] Procesando ejecuciÃ³n: ${manifestToProcess.run_id} del ${manifestToProcess.date}`);

    try {
        validateManifest(manifestToProcess);
    } catch (valErr) {
        console.error(valErr);
        await updateManifestStatus(manifestToProcess, 'failed', { error: valErr.message });
        return;
    }

    // Marcar en procesamiento
    await updateManifestStatus(manifestToProcess, 'processing');

    // 1. Cargar Ã­ndice
    console.log("Cargando indice de normas desde Drive...");
    const indexBuf = await downloadFileAsBuffer(manifestToProcess.index_file!.id);
    const indexContent = JSON.parse(indexBuf.toString('utf-8'));
    const indiceNormas: Record<string, string> = {};
    for (const norma of indexContent.normas ?? []) {
      if (norma.titulo && norma.url) indiceNormas[normalizeNormId(norma.titulo)] = norma.url;
    }
    console.log(`Indice cargado (${Object.keys(indiceNormas).length} normas)`);

    // 2. Cargar PDFs (ordenados por pÃ¡gina inicial)
    const sortedFiles = [...manifestToProcess.uploaded_files].sort((a, b) => a.start_page - b.start_page);
    const analysisResults: AnalysisResult[] = [];

    for (let i = 0; i < sortedFiles.length; i++) {
      const f = sortedFiles[i];
      console.log(`\n[${i + 1}/${sortedFiles.length}] Procesando: ${f.name}`);

      const buffer = await downloadFileAsBuffer(f.id);

      console.log(`Extrayendo texto del PDF (páginas globales ${f.start_page}-${f.end_page})...`);
      const pages = await extractTextFromPdf(
        buffer,
        (p) => console.log(`  Progreso: ${p}%`),
        {
          startPage: f.start_page,
          endPage: f.end_page,
          totalPages: manifestToProcess.total_pages,
        },
      );

      console.log("Analizando con Gemini...");
      const analysis = await analyzeWithRetry(pages);
      analysisResults.push(analysis);

      await delay(5000);
    }

    console.log("\nConsolidando resultados...");
    const consolidatedAnalysis = consolidateAnalysisResults(analysisResults);

    if (consolidatedAnalysis.normConflicts?.length) {
      for (const conflict of consolidatedAnalysis.normConflicts) {
        console.warn(
          `[NORM CONFLICT] ${conflict.normalizedKey}: ` +
          `campos=${conflict.conflictingFields.join(',')} ` +
          `ocurrencias=${conflict.occurrenceCount} ` +
          `seleccionado=${conflict.selectedNormId}`
        );
      }
    }

    // Override de fecha gazette a partir del manifest en lugar del PDF, es mÃ¡s seguro
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
      consolidatedAnalysis.norms.filter(isOperationallyReportable),
      { sector: 'Sector', normId: 'Norma', title: 'TÃ­tulo', publicationDate: 'Fecha', summary: 'Resumen', relevanceToWaterSector: 'Relevancia', pageNumber: 'PÃ¡gina' }
    );
    const normsCsvBuffer = Buffer.from(await normsCsvBlob.arrayBuffer());

    const appointmentsCsvBlob = generateCsvBlob(
      [...consolidatedAnalysis.designatedAppointments, ...consolidatedAnalysis.concludedAppointments],
      { institution: 'InstituciÃ³n', personName: 'Nombre', position: 'Cargo', summary: 'Resumen' }
    );
    const appointmentsCsvBuffer = Buffer.from(await appointmentsCsvBlob.arrayBuffer());

    // 4. VerificaciÃ³n Idempotente de Email
    console.log('Verificando si ya se enviÃ³ el correo para este run_id...');
    let existingMsgId = await checkIfEmailSent(manifestToProcess.run_id);

    if (existingMsgId) {
        console.log(`El correo ya fue enviado previamente. Message ID: ${existingMsgId}`);
    } else {
        console.log('Enviando correo...');
        existingMsgId = await sendEmailWithAttachments(
          emailTo,
          `TanIA, Analisis El Peruano (${consolidatedAnalysis.gazetteDate}) - RUN ID: ${manifestToProcess.run_id}`,
          `Hola,\n\nSe adjunta el anÃ¡lisis automÃ¡tico del Diario Oficial El Peruano.\n\nSaludos,\nTanIA â€“ El Peruano 2.0`,
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

    console.log("\nTANIA â€“ PIPELINE COMPLETADO EXITOSAMENTE");

  } catch (error: any) {
    console.error("Error en el pipeline TanIA:", error);
    if (manifestToProcess) {
        try {
            await updateManifestStatus(manifestToProcess, 'failed', { error: error.message || error.toString() });
        } catch (e) {
            console.error("No se pudo actualizar el estado de fallo:", e);
        }
    }
    process.exit(1);
  }
})();
