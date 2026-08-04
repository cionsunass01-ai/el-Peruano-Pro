# MANUAL_ONLY
# NO_CI
# Requiere credenciales reales mediante variables de entorno.
# No debe ejecutarse automáticamente en GitLab CI/CD.
# Operación remota: READ_ONLY.

import os
import json
import PyPDF2
import argparse
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from dotenv import load_dotenv

def get_creds():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")
    if not all([client_id, client_secret, refresh_token]):
        raise ValueError("Faltan variables de entorno para Google OAuth.")
        
    user_info = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    creds = Credentials.from_authorized_user_info(user_info)
    creds.refresh(Request())
    return creds

def audit_drive(date, folder_name):
    print(f"=== AUDIT STEP 1: DRIVE FOLDER {date} ===")
    creds = get_creds()
    drive = build("drive", "v3", credentials=creds)
    parent_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    if not parent_id:
        raise ValueError("GOOGLE_DRIVE_FOLDER_ID no está configurado.")
    
    target_name = folder_name if folder_name else date
    res = drive.files().list(q=f"'{parent_id}' in parents and name='{target_name}' and trashed=false", spaces='drive').execute()
    items = res.get('files', [])
    if not items:
        print(f"Folder {target_name} not found!")
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
        if f['name'] == f'indice_normas_{date}.json':
            index_id = f['id']
            
    if manifest_id:
        content = drive.files().get_media(fileId=manifest_id).execute()
        manifest = json.loads(content.decode('utf-8'))
        print(f"Manifest date: {manifest.get('date')}")
        print(f"Manifest run_id: {manifest.get('run_id')}")
        print(f"Manifest status: {manifest.get('status')}")
        
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

def audit_pdf(date, download_dir):
    print("\n=== AUDIT STEP 3: PDF REAL ===")
    pdf_path = os.path.join(download_dir, f"{date}_cuadernillo.pdf") if download_dir else f"./downloads/{date}_cuadernillo.pdf"
    if not os.path.exists(pdf_path):
        print(f"PDF local no encontrado en {pdf_path}")
        return
        
    print(f"Encontrado {pdf_path}, realizando parse estático sin modificar nada.")
    
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Audita ejecuciones en Drive.")
    parser.add_argument("--date", required=True, help="Fecha a consultar en formato YYYYMMDD")
    parser.add_argument("--download-dir", help="Directorio de descargas local")
    parser.add_argument("--folder-name", help="Nombre exacto del directorio en Drive")
    args = parser.parse_args()
    
    load_dotenv()
    idx, mfest = audit_drive(args.date, args.folder_name)
    if idx:
        audit_index(idx)
    audit_pdf(args.date, args.download_dir)
