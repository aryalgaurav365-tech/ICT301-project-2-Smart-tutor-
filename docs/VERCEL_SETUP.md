# Deploy SmartTutor on Vercel

The repository now includes a Vercel Node function for the API and a static React build for the frontend. Render is optional. No Vercel account credentials, live database or other service credentials are stored in the repository.

## 1. Import this repository

1. In Vercel choose **Add New → Project** and import `aryalgaurav365-tech/ICT301-project-2-Smart-tutor-`, branch `main`.
2. If Vercel detects **Services**, change **Application Preset** to **Other**. Do not import the API or web folder as standalone services for this topology.
3. Keep **Root Directory** at `./` (repository root).
4. Choose a project name such as `smarttutor` if available, and retain an eligible free Hobby plan.
5. Use **Build Command** `npm run build`, **Output Directory** `apps/web/dist`, **Install Command** `npm ci`, and Node.js **24.x**. The committed `vercel.json` provides the build settings, API routing and SPA fallback.

A first deployment can establish your project URL and show the frontend before the external services are configured. API routes will return a clear temporary-unavailability response while the database is missing. That initial frontend deployment is not a fully working release.

Vercel UI labels may change. Never accept a paid upgrade or trial that charges later merely to complete these steps.

## 2. Add persistent MySQL

Use **TiDB Cloud Starter with a $0 monthly spending limit** as the recommended MySQL-compatible free candidate. Aiven stopped accepting new free MySQL services on 6 November 2026. See [verified provider evidence and setup](DATABASE_OPTIONS.md). TiDB compatibility must still be validated on the actual instance. Vercel does not create the database automatically.

In Vercel **Project → Settings → Environment Variables**, enter separate connection fields: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_SSL=true`. Copy the host/port/username from TiDB; paste the password literally, without URL encoding or surrounding quotes. For a fresh TiDB instance, `test` is an acceptable application database; do not use `sys`. Alternatively, existing `DATABASE_URL` configurations remain supported and take precedence. Do not set both methods with conflicting values.

Credentials belong in Vercel's secure settings, not chat or GitHub. The app uses Node's trusted CA roots and keeps certificate verification enabled. The CA-path instructions in TiDB's MySQL CLI example refer to a local CLI, not Vercel. If your provider needs an additional CA, supply the PEM as `DB_SSL_CA` or use `DB_SSL_CA_FILE` when a securely deployed CA file is available. Production connections always require verified TLS.

Also set `APP_URL` to your public HTTPS production origin, for example `https://your-project.vercel.app`. The function can use Vercel's `VERCEL_PROJECT_PRODUCTION_URL` when available, but explicitly setting `APP_URL` removes ambiguity for email links and origin checks. Redeploy after changing environment settings.

The first cold start creates the schema, applies additive upgrades, and inserts subject categories. It does not create demo users, credentials, session records, or fake teaching content. MySQL schema initialization uses an advisory lock to serialize concurrent cold starts.

On Vercel the API defaults to trusting one upstream proxy hop so Express identifies clients from the platform's forwarded address rather than rate-limiting all users together. Direct local/Node hosting defaults to trusting no proxy. `TRUST_PROXY` can explicitly set a nonnegative hop count for a different deployment topology; never use unrestricted proxy trust.

## 3. Configure email and first administrator

For Brevo's HTTPS API, create an **API key** in Brevo's SMTP & API settings and save it in Vercel as the Production **Secret** `BREVO_API_KEY`. This is different from an SMTP key. Set `MAIL_FROM` to your verified sender, for example `SmartTutor <sender@example.com>`. Redeploy after saving. When `BREVO_API_KEY` is present, the server uses Brevo's transactional email API; otherwise it uses the SMTP settings below. The key stays on the server and must never use a `VITE_` prefix or be committed to Git. API errors are logged as safe codes and HTTP statuses; queue retries honor the provider's retry delay, bounded to one day. Provider acceptance must still be checked against delivery logs and the inbox.

Choose a provider whose current free transactional-email allowance and sender-verification requirements suit the project. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` securely in Vercel. Verify the sender through that provider.

Set `INITIAL_ADMIN_EMAIL` to the intended administrator's email. Before an admin exists, initialization queues an email-bound, single-use invitation expiring in 48 hours. Opening the site triggers a bounded post-response delivery batch. Register using the invitation, verify the email, and sign in with the emailed OTP. Later administrators are invited from **Admin tools**. A trusted operator can alternatively use `npm run admin:invite -- email` with securely configured database access.

Vercel functions do not run a persistent timer. The API schedules bounded mail batches using Vercel's supported `waitUntil` lifecycle helper after successful mutations; login/verification mail is prioritized. The optional scheduled worker below drains outstanding queues and processes reminders while nobody is using the site. Real SMTP delivery must be verified before calling authentication ready.

If the initial invitation is missing, first confirm `/api/health` reports a connected database. Redeploy with the Production email settings, open that endpoint, and inspect **Vercel → Logs** for administrator bootstrap and mail-delivery messages. Logs identify missing bootstrap/SMTP configuration, existing invitations, successful SMTP acceptance, or a sanitized failure code/status (for example `EAUTH`/535). They never include raw SMTP errors, credentials, invitation codes or message bodies. SMTP acceptance does not guarantee inbox delivery; also inspect the provider's transactional logs and the recipient's spam folder. A warm function only schedules bootstrap mail on its first successful response; refreshing the health endpoint repeatedly does not force retries. Queued failures retain their backoff and terminal failures require an administrator retry or trusted operator intervention.

For a dashboard/runtime configuration mismatch, compare the `Deployment configuration (build, values redacted)` build-log entry with the corresponding `runtime` entry after opening `/api/health`. They report only whether the named email settings are missing, empty or present. Similar administrator-email key names are shown with invisible characters escaped; they are not accepted as aliases. No setting values are recorded. A setting present only during build suggests a runtime binding issue; a setting missing from both requires checking the saved key, environment scope and deployment settings. Never paste a full environment dump into chat.

## 4. CAPTCHA

Create a Cloudflare Turnstile widget if its current free option is suitable. Allow your production frontend hostname and set `CAPTCHA_SITE_KEY` and `CAPTCHA_SECRET` in Vercel. Production registration verifies the response server-side, including the exact `APP_URL` hostname and the `register` action. The widget resets after a failed submission and clears expired tokens. Local development uses explicit test behaviour; the local email inbox is absent in production.

## 5. Private file storage

Without an S3 bucket or a persistent disk, production stores PDFs and sanitized images in the existing application database (`stored_files`). This requires no additional service account. Files are limited to **3 MB each**, remain behind authenticated resource downloads, and survive redeployments. The additive schema initialization creates the table. Base64 storage uses approximately one third more database space; monitor your TiDB quota and include this table in backups. Tutors can upload PDF, JPEG, PNG and WebP; images are decoded and rewritten as still WebP files with metadata removed. Videos, SVGs, animated images and new external-link uploads are rejected. Existing legacy link resources remain readable.

For PDFs up to **20 MB**, configure object storage as below. On Vercel, image uploads remain limited to 3 MB because they pass through the function for image processing.

Use a private S3-compatible bucket with a currently suitable free allowance. Set `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and, if needed, `S3_FORCE_PATH_STYLE=true` in Vercel. Restrict credentials to the application's bucket and required object operations. Provider account, billing and free allowances must be checked before signup; no zero-cost guarantee is implied.

For PDF uploads, the authenticated API creates a five-minute signed upload ticket. The browser PUTs the PDF directly to private storage. The API then checks ownership, size/type, the PDF signature and the object's integrity tag before copying the validated object to a different final key. A reused staging URL cannot overwrite the published resource. Downloads require API authorization before a 60-second signed URL is issued.

This direct path supports the project's 20 MB PDF requirement without passing a 20 MB request through a Vercel function. Set bucket CORS to allow `PUT` from your exact frontend origin and the `Content-Type` header. Add a bucket lifecycle rule to expire the `staging/` prefix after one day so abandoned uploads do not accumulate. Keep all bucket objects private; do not enable public listing or public reads.

Profile images are processed in the function and limited to 3 MB on Vercel (5 MB on a standalone Node host). Never use local SQLite or local uploaded files as persistent Vercel storage.

## 6. Scheduled reminders

An optional GitHub Actions workflow, `Scheduled email and session reminders`, runs hourly after you explicitly enable the repository variable `ENABLE_SMARTTUTOR_REMINDERS=true` and configure the matching Actions secrets. Check free-minute allowances before enabling it. Its database TLS/CA requirements apply independently of Vercel.

Hourly schedules are not exact-time delivery, and GitHub may delay them. For an uptime or timing guarantee, choose a suitable worker/scheduler. No free-host SLA is claimed.

## 7. Verify the live release

Through the final Vercel URL: register a student and tutor, receive real verification/OTP mail, approve the tutor, set availability, assign a request, exchange messages, publish a draft, upload/download a private PDF, process a session change and export reports. Redeploy and confirm database/file persistence. Rehearse database and bucket restore before using real student data.

Only share public project/deployment URLs with this chat. Do not send passwords, invitation tokens, database URLs or API keys. Local automated tests validate the implementation; a real provider-backed release remains unverified until the above checks succeed.

## Alternative: Vercel frontend and a separate Node API

The app still runs on any compatible Node host with `npm run build` then `npm start`. `render.yaml` remains available for that alternative. If choosing it, `DEPLOY_API_ORIGIN=https://your-api.example node scripts/configure-vercel.mjs` replaces the Vercel configuration with an external API proxy. Do not run that generator for the all-on-Vercel setup.

The current Vercel function region is `hnd1` (Tokyo), matching the TiDB endpoint selected for this project (`ap-northeast-1`). Change the function region if the database moves. TiDB's public-endpoint allowlist must permit the Vercel function's outgoing connection; allowing only your laptop IP does not permit Vercel. Configure network access through the provider's supported controls while retaining TLS and a strong application credential.
