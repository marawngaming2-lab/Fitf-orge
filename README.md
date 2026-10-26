# FitForge — Local project

## Run the site
1. Install Node.js 18 or newer.
2. Open this folder in VS Code.
3. Copy `.env.example` and name the copy `.env`.
4. Edit `.env` and add your own Gemini API key if you use the AI features.
5. In VS Code Terminal run:
   ```bash
   npm install
   npm start
   ```
6. Open `http://localhost:3000` in your browser. Do not open `index.html` directly.

## Enable real email codes (one-time setup by the site owner)
Email verification and forgot-password codes are sent from the server. They will not be delivered until SMTP is configured in `.env`.

For Gmail:
1. Turn on Google 2-Step Verification.
2. Create an App Password at https://myaccount.google.com/apppasswords.
3. In `.env`, set `SMTP_USER` and `SMTP_FROM` to the Gmail address that sends the messages, and set `SMTP_PASS` to the App Password. Do not use your normal Gmail password.
4. Keep `.env` private; never share it or upload it. Restart `npm start` after changing it.

Example `.env` values (replace the placeholders locally):
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM=your-email@gmail.com
```

The registration flow is: name/email → email code → password + confirmation → account created → sign in. Codes expire after 10 minutes and invalid/expired codes are rejected. Forgot password also uses an email code. If email settings are missing or wrong, the app reports an email setup/delivery error; it does not pretend a message was sent.

Accounts are stored in `users.json` on the local server. Keep that file private too. This is a local-development setup; it is not yet hardened for public production hosting.

## Account data sync
When a user signs in, FitForge syncs their profile, food log, weight history, workout log, custom foods, custom weekly workout schedule, body measurements/photos, and generated weekly meal plans to that account in `users.json` on the server. Existing browser-only data is copied into the account the first time an account with no saved data signs in. Keep `users.json` private and back it up. On a public host, use a persistent database/storage volume; a temporary server filesystem can lose account data when redeployed. For true multi-device access, the site must be deployed to one shared server/database.
