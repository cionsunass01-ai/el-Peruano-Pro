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

def test_gmail_attachments():
    creds = get_creds()
    gmail = build("gmail", "v1", credentials=creds)
    try:
        res = gmail.users().messages().list(userId='me', q='is:sent', maxResults=1).execute()
        msg_id = res['messages'][0]['id']
        msg = gmail.users().messages().get(userId='me', id=msg_id).execute()
        
        print(f"Message ID: {msg_id}")
        
        # Parse payload parts
        parts = msg['payload'].get('parts', [])
        print(f"Total parts: {len(parts)}")
        for part in parts:
            if part['filename']:
                print(f"Attachment: {part['filename']}, Size: {part['body'].get('size', 0)} bytes")
                
    except Exception as e:
        print(f"FAIL: Error Gmail: {e}")

if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    test_gmail_attachments()
