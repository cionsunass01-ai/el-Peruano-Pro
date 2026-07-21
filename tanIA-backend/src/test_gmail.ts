import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
async function test() {
    try {
        console.log("Testing Gmail...");
        const profile = await gmail.users.getProfile({ userId: 'me' });
        console.log("PASS - Gmail profile:", profile.data.emailAddress);
    } catch(e: any) {
        console.error("FAIL", e.message);
        process.exit(1);
    }
}
test();
