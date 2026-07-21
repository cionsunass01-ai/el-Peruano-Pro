import os
import json
import PyPDF2
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def get_creds():
    user_info = {
        "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
        "refresh_token": os.environ.get("GOOGLE_REFRESH_TOKEN"),
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    creds = Credentials.from_authorized_user_info(user_info)
    creds.refresh(Request())
    return creds

def audit_drive():
    print("=== AUDIT STEP 1: DRIVE FOLDER 20260720 ===")
    creds = get_creds()
    drive = build("drive", "v3", credentials=creds)
    parent_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    
    res = drive.files().list(q=f"'{parent_id}' in parents and name='20260720' and trashed=false", spaces='drive').execute()
    items = res.get('files', [])
    if not items:
        print("Folder 20260720 not found!")
        return None, None
        
    folder_id = items[0]['id']
    print(f"Drive Folder ID: {folder_id}")
    
    res = drive.files().list(q=f"'{folder_id}' in parents and trashed=false", spaces='drive', fields='files(id,name)').execute()
    files = res.get('files', [])
    
    manifest_id = None
    index_id = None
    for f in files:
        print(f"File found: {f['name']} (ID: {f['id']})")
        if f['name'] == 'manifest.json':
            manifest_id = f['id']
        if f['name'] == 'indice_normas_20260720.json':
            index_id = f['id']
            
    if manifest_id:
        content = drive.files().get_media(fileId=manifest_id).execute()
        manifest = json.loads(content.decode('utf-8'))
        print(f"Manifest date: {manifest.get('date')}")
        print(f"Manifest run_id: {manifest.get('run_id')}")
        print(f"Manifest status: {manifest.get('status')}")
        print(f"References to 20260719: {'20260719' in json.dumps(manifest)}")
        
    return index_id, manifest_id

def audit_index(index_id):
    print("\n=== AUDIT STEP 2: INDICE NORMAS ===")
    creds = get_creds()
    drive = build("drive", "v3", credentials=creds)
    
    content = drive.files().get_media(fileId=index_id).execute()
    index_data = json.loads(content.decode('utf-8'))
    
    print(f"Valor del campo fecha: {index_data.get('fecha')}")
    normas = index_data.get('normas', [])
    print(f"Total de normas: {len(normas)}")
    
    for i, n in enumerate(normas[:5]):
        print(f"Titulo {i+1}: {n.get('titulo')}")
        
    titles = [n.get('titulo', '') for n in normas]
    sunass_found = any('026-2026-SUNASS-CD' in t for t in titles)
    servir_found = any('000105-2026-SERVIR-PE' in t for t in titles)
    print(f"Contiene 026-2026-SUNASS-CD: {sunass_found}")
    print(f"Contiene 000105-2026-SERVIR-PE: {servir_found}")
    
def audit_pdf():
    print("\n=== AUDIT STEP 3: PDF REAL ===")
    pdf_path = '/app/downloads/real/20260720_cuadernillo.pdf'
    if not os.path.exists(pdf_path):
        print(f"PDF local no encontrado en {pdf_path}")
        return
        
    sunass_page = None
    servir_page = None
    igp_page = None
    
    with open(pdf_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if '026-2026-SUNASS-CD' in text and sunass_page is None:
                sunass_page = i + 1
            if '000105-2026-SERVIR-PE' in text and servir_page is None:
                servir_page = i + 1
            if 'Instituto Geofísico del Perú' in text or 'INSTITUTO GEOFISICO DEL PERU' in text:
                if igp_page is None:
                    igp_page = i + 1
                    
    print(f"026-2026-SUNASS-CD: {'Aparece en pagina ' + str(sunass_page) if sunass_page else 'NO APARECE'}")
    print(f"000105-2026-SERVIR-PE: {'Aparece en pagina ' + str(servir_page) if servir_page else 'NO APARECE'}")
    print(f"Instituto Geofísico del Perú: {'Aparece en pagina ' + str(igp_page) if igp_page else 'NO APARECE'}")

if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    idx, mfest = audit_drive()
    if idx:
        audit_index(idx)
    audit_pdf()
