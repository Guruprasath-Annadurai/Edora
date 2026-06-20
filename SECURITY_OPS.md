# Edora Security Operations Runbook

This document covers recurring ops tasks that must be performed at each release
or on a scheduled rotation. It is for the engineering team, not for the app.

---

## Play Store Release Checklist (every submission)

### 1. Increment `versionCode` before building the APK/AAB

File: `android/app/build.gradle`

```groovy
defaultConfig {
    versionCode 18        // ← increment by 1 on every Play Store submission
    versionName "2.5.0"   // ← update to match the release tag
}
```

| Release | versionCode | versionName |
|---------|-------------|-------------|
| v2.4.x  | ≤ 17        | 2.4.x       |
| v2.5.0  | 18          | 2.5.0       |
| v2.5.1  | 19          | 2.5.1       |
| v2.6.0  | 20          | 2.6.0       |

Play Store rejects any submission whose `versionCode` is not strictly greater
than the current live build. Forgetting this causes a failed upload that blocks
the release.

### 2. Build the signed AAB

```bash
cd android
./gradlew bundleRelease
# AAB is at: app/build/outputs/bundle/release/app-release.aab
```

The keystore is at `android/app/edora-release.keystore` (gitignored).
Password is stored in the team password manager under **Edora Android Keystore**.

### 3. Test on a real device before uploading

```bash
# Install debug build on connected device
npx cap run android
```

### 4. Upload to Play Console

Internal track → Closed testing → Open testing → Production.
Always hold 24 h in closed testing before promoting to production.

---

## Secret Rotation Schedule

### Firebase Service Account JSON — every 6 months

The `FIREBASE_SERVICE_ACCOUNT_JSON` Supabase secret contains an RSA private key
that authenticates FCM push notifications and Firebase Admin SDK calls.

**Rotation procedure:**

1. Go to [Firebase Console](https://console.firebase.google.com) →
   Project Settings → Service Accounts.
2. Click **Generate new private key** → Download the JSON.
3. Update the Supabase secret:
   ```bash
   supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat new-firebase-sa.json)"
   ```
4. Deploy the affected functions to pick up the new secret:
   ```bash
   supabase functions deploy novo-push
   ```
5. Verify push notifications still work with a test device.
6. Delete the old key from the Firebase Console (revoke it).
7. Shred the downloaded JSON file (`rm -P new-firebase-sa.json`).

Next rotation due: **December 2026**

---

### OAuth Token Encryption Key — every 12 months or on suspected breach

`OAUTH_TOKEN_ENCRYPTION_KEY` is the AES-256 key encrypting teacher Google OAuth
tokens at rest in `classroom_connections`. Rotating it requires a migration window.

**Rotation procedure:**

1. Generate a new key:
   ```bash
   NEW_KEY=$(openssl rand -base64 32)
   echo $NEW_KEY   # keep this safe until step 3
   ```
2. Write a one-off migration script that:
   - Reads every row in `classroom_connections`
   - Decrypts `access_token` and `refresh_token` with the OLD key
   - Re-encrypts both with the NEW key
   - Writes them back
3. Run the migration against the Supabase DB (can be a Deno script or SQL function).
4. Update the secret **after** the migration completes:
   ```bash
   supabase secrets set OAUTH_TOKEN_ENCRYPTION_KEY="$NEW_KEY"
   ```
5. Deploy all Google service functions:
   ```bash
   supabase functions deploy classroom-auth google-calendar google-gmail google-drive
   ```
6. Verify a teacher can still connect and use Google Classroom.

The graceful plaintext fallback in `_shared/token-crypto.ts` means existing
tokens still work even if decryption fails — teachers will just be asked to
reconnect on the next OAuth refresh.

---

### Razorpay API Keys — on key compromise or annually

1. Log into the [Razorpay Dashboard](https://dashboard.razorpay.com) → Settings → API Keys.
2. Regenerate the key pair.
3. Update both secrets:
   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx
   supabase secrets set RAZORPAY_KEY_SECRET=yyy
   ```
4. Deploy `novo-subscription`:
   ```bash
   supabase functions deploy novo-subscription
   ```
5. Test a payment in test mode before switching live keys.

Also rotate `RAZORPAY_WEBHOOK_SECRET` in the Razorpay Dashboard → Webhooks →
regenerate, then:
```bash
supabase secrets set RAZORPAY_WEBHOOK_SECRET=zzz
supabase functions deploy novo-subscription
```

---

### Google OAuth Client Secret — on key compromise or annually

1. Go to [GCP Console](https://console.cloud.google.com) → APIs & Services →
   Credentials → your OAuth 2.0 Client ID.
2. Reset the client secret.
3. Update the Supabase secret:
   ```bash
   supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxx
   ```
4. Deploy all classroom functions:
   ```bash
   supabase functions deploy classroom-auth google-calendar google-gmail google-drive
   ```
5. Note: existing connected teachers will need to re-authorise once their
   refresh token expires (up to 1 hour), because the stored refresh token
   is tied to the old client secret. The app will prompt them to reconnect.

---

### GCP Service Account JSON (Vertex AI / BigQuery) — every 6 months

Same procedure as Firebase service account above, using:
```bash
supabase secrets set GCP_SERVICE_ACCOUNT_JSON="$(cat new-gcp-sa.json)"
supabase functions deploy vertex-jobs vertex-export analytics
```

---

## Secrets Inventory

| Secret | Used by | Rotation cycle |
|--------|---------|----------------|
| `GEMINI_API_KEY` | gemini-chat, gemini-vision | On compromise |
| `ELEVENLABS_API_KEY` | elevenlabs-tts | On compromise |
| `GOOGLE_CLOUD_API_KEY` | novo-language, novo-stt | On compromise |
| `GOOGLE_OAUTH_CLIENT_ID` | classroom-auth, google-* | On compromise |
| `GOOGLE_OAUTH_CLIENT_SECRET` | classroom-auth, google-* | Annually |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | novo-push | Every 6 months |
| `FIREBASE_PROJECT_ID` | novo-push | Static |
| `RAZORPAY_KEY_ID` | novo-subscription | On compromise |
| `RAZORPAY_KEY_SECRET` | novo-subscription | On compromise |
| `RAZORPAY_WEBHOOK_SECRET` | novo-subscription | Annually |
| `GCP_SERVICE_ACCOUNT_JSON` | vertex-jobs, vertex-export, gemini-chat | Every 6 months |
| `GCS_TRAINING_BUCKET` | vertex-jobs | Static |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | classroom-auth, google-* | Annually |
| `CRON_SECRET` | novo-push, vertex-jobs | Annually |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions | On compromise |

All secrets are set via `supabase secrets set` and never committed to git.
`.env` is gitignored and used for local development only.

---

## New Secret Setup (first-time or new environment)

```bash
# Required secrets — must be set before deploying any edge function
supabase secrets set OAUTH_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
supabase secrets set CRON_SECRET=$(openssl rand -base64 32)
supabase secrets set RAZORPAY_WEBHOOK_SECRET=<from Razorpay Dashboard>
supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx
supabase secrets set RAZORPAY_KEY_SECRET=xxx
supabase secrets set GEMINI_API_KEY=xxx
supabase secrets set ELEVENLABS_API_KEY=xxx
supabase secrets set GOOGLE_CLOUD_API_KEY=xxx
supabase secrets set GOOGLE_OAUTH_CLIENT_ID=xxx
supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxx
supabase secrets set FIREBASE_PROJECT_ID=edora-bb02e
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat firebase-sa.json)"
supabase secrets set GCP_SERVICE_ACCOUNT_JSON="$(cat gcp-sa.json)"
supabase secrets set GCS_TRAINING_BUCKET=edora-vertex-training

# Verify all secrets are present
supabase secrets list
```
