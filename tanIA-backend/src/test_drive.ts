import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
async function test() {
    try {
        console.log("Testing Drive...");
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        const res = await drive.files.create({
            requestBody: { name: 'docker_smoke_test.txt', parents: [folderId!] },
            media: { mimeType: 'text/plain', body: 'OK' }
        });
        console.log(`PASS - Created: ${res.data.id}`);
        await drive.files.delete({ fileId: res.data.id! });
        console.log("PASS - Deleted");
    } catch(e: any) {
        console.error("FAIL", e.message);
        process.exit(1);
    }
}
test();
