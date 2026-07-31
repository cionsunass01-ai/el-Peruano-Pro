import os
import json
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload
from io import BytesIO

def get_drive_service():
    user_info = {
        "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
        "refresh_token": os.environ.get("GOOGLE_REFRESH_TOKEN"),
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    if not all(user_info.values()):
        raise RuntimeError("Faltan variables GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN")

    creds = Credentials.from_authorized_user_info(user_info)
    creds.refresh(Request())
    return build("drive", "v3", credentials=creds)

def find_or_create_subfolder(folder_name: str) -> Tuple[str, bool]:
    """Busca una carpeta por nombre exacto. Si no existe, la crea. Devuelve (folder_id, was_created)."""
    parent_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    if not parent_id:
        raise RuntimeError("Falta GOOGLE_DRIVE_FOLDER_ID")

    service = get_drive_service()
    query = f"'{parent_id}' in parents and name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    items = results.get('files', [])

    if items:
        return items[0]['id'], False

    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parent_id]
    }
    folder = service.files().create(body=file_metadata, fields='id').execute()
    return folder.get('id'), True

def get_manifest(folder_id: str) -> Optional[dict]:
    service = get_drive_service()
    query = f"'{folder_id}' in parents and name = 'manifest.json' and trashed = false"
    results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    items = results.get('files', [])

    if not items:
        return None

    file_id = items[0]['id']
    try:
        content = service.files().get_media(fileId=file_id).execute()
        manifest_data = json.loads(content.decode('utf-8'))
        manifest_data['_drive_file_id'] = file_id
        return manifest_data
    except Exception:
        return None

def get_manifest_by_file_id(manifest_id: str) -> dict:
    """
    Lee un manifest.json de Google Drive por su file_id exacto.
    OperaciÃ³n estrictamente READ_ONLY: no busca ni crea carpetas, no actualiza ni modifica datos.
    """
    if not manifest_id:
        raise ValueError("manifest_id no puede estar vacÃ­o")

    try:
        service = get_drive_service()
        content = service.files().get_media(fileId=manifest_id).execute()
    except Exception as e:
        raise RuntimeError(f"Error al obtener el archivo manifest '{manifest_id}' de Google Drive: {e}") from e

    try:
        manifest_data = json.loads(content.decode('utf-8'))
        manifest_data['_drive_file_id'] = manifest_id
        return manifest_data
    except Exception as e:
        raise ValueError(f"El archivo manifest '{manifest_id}' no es un JSON vÃ¡lido: {e}") from e

def verify_manifest_processed(manifest_id: str, expected_run_id: str, expected_date: str) -> bool:
    """
    Valida de forma estrictamente READ_ONLY que un manifest exacto exista y cumpla el contrato post-backend:
    - El archivo existe.
    - Su identificador coincide con manifest_id.
    - date coincide con la fecha procesada (expected_date).
    - run_id coincide con el run_id esperado.
    - status es exactamente 'processed'.
    - email_sent es True.
    """
    try:
        manifest = get_manifest_by_file_id(manifest_id)
    except Exception:
        return False

    if not isinstance(manifest, dict):
        return False

    if manifest.get('_drive_file_id') != manifest_id:
        return False

    if str(manifest.get('date')) != str(expected_date):
        return False

    if str(manifest.get('run_id')) != str(expected_run_id):
        return False

    if manifest.get('status') != 'processed':
        return False

    if manifest.get('email_sent') is not True:
        return False

    return True


def upload_file_to_drive(file_path: str | Path, folder_id: str, mimetype: str = "application/pdf") -> Dict[str, Any]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"No existe el archivo: {path}")

    service = get_drive_service()

    # Check if file exists to overwrite
    query = f"'{folder_id}' in parents and name = '{path.name}' and trashed = false"
    results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    items = results.get('files', [])

    media = MediaFileUpload(str(path), mimetype=mimetype, resumable=True)

    if items:
        # Overwrite
        file_id = items[0]['id']
        updated = service.files().update(
            fileId=file_id,
            media_body=media,
            fields="id,name,size"
        ).execute()
        return updated
    else:
        # Create new
        file_metadata = {
            "name": path.name,
            "parents": [folder_id],
        }
        created = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id,name,size"
        ).execute()
        return created

def upload_manifest(manifest_data: dict, folder_id: str) -> str:
    service = get_drive_service()

    # Remove internal tracking id before saving
    drive_file_id = manifest_data.pop('_drive_file_id', None)

    media = MediaIoBaseUpload(
        BytesIO(json.dumps(manifest_data, indent=2).encode('utf-8')),
        mimetype='application/json',
        resumable=False
    )

    if drive_file_id:
        # Update existing
        updated = service.files().update(
            fileId=drive_file_id,
            media_body=media,
            fields='id'
        ).execute()
        # Restore it in memory
        manifest_data['_drive_file_id'] = updated.get('id')
        return updated.get('id')

    # Create new or find existing if drive_file_id was lost
    query = f"'{folder_id}' in parents and name = 'manifest.json' and trashed = false"
    results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    items = results.get('files', [])

    if items:
        updated = service.files().update(
            fileId=items[0]['id'],
            media_body=media,
            fields='id'
        ).execute()
        manifest_data['_drive_file_id'] = updated.get('id')
        return updated.get('id')

    file_metadata = {
        'name': 'manifest.json',
        'parents': [folder_id]
    }

    created = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id'
    ).execute()

    manifest_data['_drive_file_id'] = created.get('id')
    return created.get('id')
