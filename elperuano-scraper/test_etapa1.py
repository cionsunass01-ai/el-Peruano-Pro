import os
import json
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

def test_drive():
    creds = get_creds()
    drive = build("drive", "v3", credentials=creds)
    parent_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    
    # 1. Buscar carpeta
    res = drive.files().list(q=f"'{parent_id}' in parents and name='20260720' and trashed=false", spaces='drive').execute()
    items = res.get('files', [])
    if not items:
        print("FAIL: No se encontro la carpeta 20260720")
        return False
        
    folder_id = items[0]['id']
    
    # 2. Listar archivos
    res = drive.files().list(q=f"'{folder_id}' in parents and trashed=false", spaces='drive', fields='files(id,name,size)').execute()
    files = res.get('files', [])
    print(f"Archivos en carpeta: {[f['name'] for f in files]}")
    
    if len(files) != 3:
        print(f"FAIL: Se esperaban 3 archivos, hay {len(files)}")
        return False
        
    # 3. Leer manifest
    manifest_file = next((f for f in files if f['name'] == 'manifest.json'), None)
    if not manifest_file:
        print("FAIL: Falta manifest.json")
        return False
        
    content = drive.files().get_media(fileId=manifest_file['id']).execute()
    manifest = json.loads(content.decode('utf-8'))
    
    print("Manifest:")
    print(json.dumps(manifest, indent=2))
    
    if manifest.get('status') != 'complete':
        print("FAIL: status no es complete")
        return False
    if manifest.get('total_pages') != 24:
        print("FAIL: total_pages no es 24")
        return False
    if manifest.get('expected_blocks') != 1:
        print("FAIL: expected_blocks no es 1")
        return False
        
    pdf_info = manifest['uploaded_files'][0]
    if pdf_info['size'] <= 0:
        print("FAIL: PDF size <= 0")
        return False
    if pdf_info['start_page'] != 1 or pdf_info['end_page'] != 24:
        print("FAIL: Rango de paginas no es 1-24")
        return False
        
    print("PASS: Drive check")
    return True

def test_gmail():
    creds = get_creds()
    gmail = build("gmail", "v1", credentials=creds)
    try:
        res = gmail.users().messages().list(userId='me', q='is:sent', maxResults=1).execute()
        print("PASS: Gmail scope gmail.readonly verificado")
        return True
    except Exception as e:
        print(f"FAIL: Error Gmail: {e}")
        return False

if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    d = test_drive()
    g = test_gmail()
    if d and g:
        print("ETAPA 1 PASS")
    else:
        print("ETAPA 1 FAIL")
