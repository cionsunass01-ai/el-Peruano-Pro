import os
import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from io import BytesIO

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

def skip_old_folders():
    creds = get_creds()
    drive = build("drive", "v3", credentials=creds)
    parent_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    
    # 1. Buscar todas las carpetas
    res = drive.files().list(q=f"'{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false", spaces='drive').execute()
    folders = res.get('files', [])
    
    for folder in folders:
        if '20260719' in folder['name']:
            folder_id = folder['id']
            # 2. Listar archivos manifest
            res_m = drive.files().list(q=f"'{folder_id}' in parents and name='manifest.json' and trashed=false", spaces='drive').execute()
            files = res_m.get('files', [])
            if not files:
                continue
            
            manifest_id = files[0]['id']
            try:
                content = drive.files().get_media(fileId=manifest_id).execute()
                manifest = json.loads(content.decode('utf-8'))
                
                manifest['status'] = 'processed'
                manifest['email_sent'] = True
                
                media = MediaIoBaseUpload(
                    BytesIO(json.dumps(manifest, indent=2).encode('utf-8')),
                    mimetype='application/json',
                    resumable=False
                )
                
                drive.files().update(fileId=manifest_id, media_body=media).execute()
                print(f"Manifest in folder {folder['name']} skipped.")
            except Exception as e:
                print(f"Error skipping {folder['name']}: {e}")

if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    skip_old_folders()
