import { google } from 'googleapis';
import * as dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

const getAuthClient = () => {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
  return oauth2Client;
};

type EmailAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export const checkIfEmailSent = async (runId: string): Promise<string | null> => {
    const auth = getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    
    const res = await gmail.users.messages.list({
        userId: 'me',
        q: `in:sent subject:"${runId}"`
    });
    
    if (res.data.messages && res.data.messages.length > 0) {
        return res.data.messages[0].id!;
    }
    
    return null;
}

export const sendEmailWithAttachments = async (
  to: string,
  subject: string,
  bodyText: string,
  attachments: EmailAttachment[]
): Promise<string> => {

  const auth = getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const boundary = 'tanIA_boundary';
  const parts: string[] = [];

  parts.push(
    `To: ${to}`,
    `From: me`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    bodyText,
    ``
  );

  for (const file of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${file.mimeType}; name="${file.filename}"`,
      `Content-Disposition: attachment; filename="${file.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      file.content.toString('base64'),
      ``
    );
  }

  parts.push(`--${boundary}--`);

  const rawMessage = Buffer.from(parts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rawMessage },
  });

  console.log('Correo enviado correctamente con adjuntos. ID:', res.data.id);
  return res.data.id!;
};