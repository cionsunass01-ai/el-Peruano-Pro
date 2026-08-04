# MANUAL_ONLY
# NO_CI
# Requiere credenciales reales mediante variables de entorno.
# No debe ejecutarse automáticamente en GitLab CI/CD.
# Operación remota: READ_ONLY.

import os
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

def find_emails(subject, date, max_results):
    creds = get_creds()
    gmail = build("gmail", "v1", credentials=creds)
    query_parts = []
    if subject:
        query_parts.append(f'subject:"{subject}"')
    if date:
        query_parts.append(f'after:{date}')
    query_parts.append('is:sent')
    
    q = ' '.join(query_parts)
    print(f"Buscando en Gmail con query: {q}")
    res = gmail.users().messages().list(userId='me', q=q, maxResults=max_results).execute()
    messages = res.get('messages', [])
    if not messages:
        print("No emails found.")
        return
    for message in messages:
        msg_id = message['id']
        msg = gmail.users().messages().get(userId='me', id=msg_id).execute()
        headers = msg['payload']['headers']
        msg_subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
        print(f"\nMessage ID: {msg_id} - {msg_subject}")
        
        parts = msg['payload'].get('parts', [])
        for part in parts:
            if part['filename']:
                print(f"Attachment: {part['filename']}")
            else:
                subparts = part.get('parts', [])
                for sp in subparts:
                    if sp.get('filename'):
                        print(f"Attachment (nested): {sp['filename']}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Busca reportes enviados en Gmail.")
    parser.add_argument("--subject", help="Asunto del correo a buscar")
    parser.add_argument("--date", help="Fecha mínima (YYYY/MM/DD) o formato compatible con Gmail")
    parser.add_argument("--max-results", type=int, default=5, help="Número máximo de resultados")
    args = parser.parse_args()
    
    load_dotenv()
    find_emails(args.subject, args.date, args.max_results)
