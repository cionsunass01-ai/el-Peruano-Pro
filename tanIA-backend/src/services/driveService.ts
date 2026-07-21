import { google, drive_v3 } from 'googleapis';
import * as dotenv from 'dotenv';
import { Buffer } from 'buffer';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !REFRESH_TOKEN || !FOLDER_ID) {
    console.error("ERROR: Faltan variables de entorno requeridas.");
}

const getAuthClient = () => {
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    return oauth2Client;
};

export interface Manifest {
    schema_version: string;
    run_id: string;
    date: string;
    created_at: string;
    expected_blocks: number;
    total_pages: number;
    status: string;
    email_sent?: boolean;
    index_file: {
        id: string;
        name: string;
        size: number;
    } | null;
    uploaded_files: Array<{
        id: string;
        name: string;
        size: number;
        start_page: number;
        end_page: number;
    }>;
    _file_id?: string; 
    _folder_id?: string;
}

export async function getOldestPendingExecution(): Promise<Manifest | null> {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    // 1. Listar subcarpetas en FOLDER_ID
    const resFolders = await drive.files.list({
        q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, createdTime)'
    });
    
    const folders = resFolders.data.files ?? [];
    if (folders.length === 0) return null;

    const pendingManifests: Manifest[] = [];

    // 2. Buscar manifest.json en cada carpeta
    for (const folder of folders) {
        if (!folder.id) continue;
        
        const resManifest = await drive.files.list({
            q: `'${folder.id}' in parents and name='manifest.json' and trashed=false`,
            fields: 'files(id)'
        });
        
        const files = resManifest.data.files ?? [];
        if (files.length === 0) continue;
        
        const manifestFileId = files[0].id!;
        
        const fileRes = await drive.files.get({
            fileId: manifestFileId,
            alt: 'media'
        }, { responseType: 'arraybuffer' });
        
        try {
            const manifest: Manifest = JSON.parse(Buffer.from(fileRes.data as ArrayBuffer).toString('utf-8'));
            manifest._file_id = manifestFileId;
            manifest._folder_id = folder.id;
            
            // Verificar si es candidato a ser procesado
            if (!manifest.email_sent) {
                if (manifest.status === 'complete') {
                    pendingManifests.push(manifest);
                } else if (manifest.status === 'processing') {
                    // Recuperar processing abandonado (ej. más de 1 hora)
                    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                    const lastUpdated = new Date(manifest.created_at); // Simplificación: ideal usar updatedTime
                    if (lastUpdated < oneHourAgo) {
                        console.log(`Recuperando ejecución 'processing' abandonada: ${manifest.run_id}`);
                        pendingManifests.push(manifest);
                    }
                } else if (manifest.status === 'failed') {
                    // Recuperar failed para reintento (idealmente limitar con un contador)
                    console.log(`Reintentando ejecución 'failed': ${manifest.run_id}`);
                    pendingManifests.push(manifest);
                }
            }
        } catch (err) {
            console.error(`Error parseando manifest.json en carpeta ${folder.name}`, err);
        }
    }
    
    if (pendingManifests.length === 0) return null;
    
    // 3. Ordenar por created_at (más antiguo primero)
    pendingManifests.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    return pendingManifests[0];
}

export async function updateManifestStatus(manifest: Manifest, newStatus: string, extraFields: any = {}) {
    if (!manifest._file_id) throw new Error("Manifest no tiene _file_id");
    
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    
    manifest.status = newStatus;
    Object.assign(manifest, extraFields);
    
    // Limpiar fields internos antes de guardar
    const toSave = { ...manifest };
    delete toSave._file_id;
    delete toSave._folder_id;
    
    await drive.files.update({
        fileId: manifest._file_id,
        media: {
            mimeType: 'application/json',
            body: JSON.stringify(toSave, null, 2)
        }
    });
}

export async function downloadFileAsBuffer(fileId: string): Promise<Buffer> {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    
    const fileRes = await drive.files.get({
        fileId: fileId,
        alt: 'media'
    }, { responseType: 'arraybuffer' });
    
    return Buffer.from(fileRes.data as ArrayBuffer);
}

// Mantenemos compatibilidad de importación
export { };

