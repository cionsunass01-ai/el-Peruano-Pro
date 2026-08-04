# MANUAL_ONLY
# NO_CI
# Requiere credenciales reales mediante variables de entorno.
# No debe ejecutarse automáticamente en GitLab CI/CD.
# Operación remota: READ_ONLY.

import os
import base64
import csv
import argparse
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from io import StringIO
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

def read_csvs(message_id, subject, output_dir):
    creds = get_creds()
    gmail = build("gmail", "v1", credentials=creds)
    try:
        msg_id_to_fetch = message_id
        if not msg_id_to_fetch:
            q = f'subject:"{subject}" is:sent' if subject else 'is:sent'
            print(f"Buscando último correo con query: {q}")
            res = gmail.users().messages().list(userId='me', q=q, maxResults=1).execute()
            if not res.get('messages'):
                print("No se encontraron correos.")
                return
            msg_id_to_fetch = res['messages'][0]['id']
            
        print(f"Inspeccionando mensaje ID: {msg_id_to_fetch}")
        msg = gmail.users().messages().get(userId='me', id=msg_id_to_fetch).execute()
        
        parts = msg['payload'].get('parts', [])
        for part in parts:
            if part['filename'] and part['filename'].endswith('.csv'):
                attach_id = part['body']['attachmentId']
                attachment = gmail.users().messages().attachments().get(userId='me', messageId=msg_id_to_fetch, id=attach_id).execute()
                data = base64.urlsafe_b64decode(attachment['data']).decode('utf-8')
                
                print(f"--- {part['filename']} ---")
                if output_dir:
                    os.makedirs(output_dir, exist_ok=True)
                    out_path = os.path.join(output_dir, part['filename'])
                    with open(out_path, 'w', encoding='utf-8') as f:
                        f.write(data)
                    print(f"Guardado en {out_path}")
                else:
                    reader = csv.reader(StringIO(data))
                    for row in reader:
                        print(row)
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Inspecciona adjuntos CSV de reportes enviados.")
    parser.add_argument("--message-id", help="ID explícito del mensaje en Gmail")
    parser.add_argument("--subject", help="Asunto para buscar el último correo")
    parser.add_argument("--output-dir", help="Directorio opcional para guardar los CSV extraídos")
    args = parser.parse_args()
    
    load_dotenv()
    read_csvs(args.message_id, args.subject, args.output_dir)
