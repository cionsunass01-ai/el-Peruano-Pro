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

def verify_sent_report(date, run_id, subject):
    creds = get_creds()
    gmail = build("gmail", "v1", credentials=creds)
    try:
        query_parts = ['is:sent']
        if subject:
            query_parts.append(f'subject:"{subject}"')
        if date:
            query_parts.append(f'"{date}"')
        if run_id:
            query_parts.append(f'"{run_id}"')
            
        q = ' '.join(query_parts)
        print(f"Buscando verificación con query: {q}")
        res = gmail.users().messages().list(userId='me', q=q, maxResults=5).execute()
        messages = res.get('messages', [])
        if not messages:
            print("No se encontraron reportes que coincidan.")
            return
            
        for message in messages:
            msg_id = message['id']
            msg = gmail.users().messages().get(userId='me', id=msg_id).execute()
            print(f"\nMessage ID verificable: {msg_id}")
            parts = msg['payload'].get('parts', [])
            print(f"Total parts encontradas: {len(parts)}")
            for part in parts:
                if part['filename']:
                    print(f"Attachment validado: {part['filename']}, Size: {part['body'].get('size', 0)} bytes")
                
    except Exception as e:
        print(f"FAIL: Error Gmail: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Verifica los reportes enviados (Etapa 2).")
    parser.add_argument("--date", required=True, help="Fecha en formato YYYYMMDD")
    parser.add_argument("--run-id", help="ID de ejecución para filtro adicional")
    parser.add_argument("--subject", help="Filtro opcional por asunto")
    args = parser.parse_args()
    
    load_dotenv()
    verify_sent_report(args.date, args.run_id, args.subject)
