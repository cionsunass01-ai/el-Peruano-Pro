import os
import base64
import csv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from io import StringIO

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

def read_csvs():
    creds = get_creds()
    gmail = build("gmail", "v1", credentials=creds)
    try:
        res = gmail.users().messages().list(userId='me', q='is:sent', maxResults=1).execute()
        msg_id = res['messages'][0]['id']
        msg = gmail.users().messages().get(userId='me', id=msg_id).execute()
        
        parts = msg['payload'].get('parts', [])
        for part in parts:
            if part['filename'] and part['filename'].endswith('.csv'):
                attach_id = part['body']['attachmentId']
                attachment = gmail.users().messages().attachments().get(userId='me', messageId=msg_id, id=attach_id).execute()
                data = base64.urlsafe_b64decode(attachment['data']).decode('utf-8')
                
                print(f"--- {part['filename']} ---")
                reader = csv.reader(StringIO(data))
                for row in reader:
                    print(row)
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    read_csvs()
