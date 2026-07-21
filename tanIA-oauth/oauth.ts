import { Request, Response } from 'express';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Paso 1: redirigir a Google
export const startOAuth = (_req: Request, res: Response) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly'
    ]
  });

  res.redirect(authUrl);
};

// Paso 2: Google regresa aquí
export const oauthCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string;

  if (!code) {
    return res.status(400).send('No se recibió el authorization code');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      // Escribir a .env.generated de forma segura (ignorado por git, solo temporal)
      const outputPath = path.join('/app/output', '.env.generated');
      try {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`, { mode: 0o600 });
      } catch (writeErr) {
        console.error('Error escribiendo archivo:', writeErr);
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8">
          <title>Autorización Completada</title>
      </head>
      <body>
          <h2>Autorización completada</h2>
          <p>Puedes cerrar esta ventana.</p>
          <p>El refresh token se ha guardado de forma segura en <b>./secrets/.env.generated</b>.</p>
          <p>Cópialo a tu archivo .env principal y elimina el generado.</p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error obteniendo tokens');
  }
};
