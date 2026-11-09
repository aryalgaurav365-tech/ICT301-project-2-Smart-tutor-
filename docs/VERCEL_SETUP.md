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

In Vercel **Project → Settings → Environment Variables**, add the connection as `DATABASE_URL` and enable `DB_SSL=true`. Credentials belong in the provider's secure settings, not chat or GitHub. Set `DB_SSL_CA_FILE` only if you have deployed a required provider CA file securely; keep certificate verification enabled.

Also set `APP_URL` to your public HTTPS production origin, for example `https://your-project.vercel.app`. The function can use Vercel's `VERCEL_PROJECT_PRODUCTION_URL` when available, but explicitly setting `APP_URL` removes ambiguity for email links and origin checks. Redeploy after changing environment settings.

The first cold start creates the schema, applies additive upgrades, and inserts subject categories. It does not create demo users, credentials, session records, or fake teaching content. MySQL schema initialization uses an advisory lock to serialize concurrent cold starts.

## 3. Configure email and first administrator

Choose a provider whose current free transactional-email allowance and sender-verification requirements suit the project. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` securely in Vercel. Verify the sender through that provider.

Set `INITIAL_ADMIN_EMAIL` to the intended administrator's email. Before an admin exists, initialization queues an email-bound, single-use invitation expiring in 48 hours. Opening the site triggers a bounded post-response delivery batch. Register using the invitation, verify the email, and sign in with the emailed OTP. Later administrators are invited from **Admin tools**. A trusted operator can alternatively use `npm run admin:invite -- email` with securely configured database access.

Vercel functions do not run a persistent timer. The API schedules bounded mail batches using Vercel's supported `waitUntil` lifecycle helper after successful mutations; login/verification mail is prioritized. The optional scheduled worker below drains outstanding queues and processes reminders while nobody is using the site. Real SMTP delivery must be verified before calling authentication ready.

## 4. CAPTCHA

Create a Cloudflare Turnstile widget if its current free option is suitable. Allow your production frontend hostname and set `CAPTCHA_SITE_KEY` and `CAPTCHA_SECRET` in Vercel. Production registration verifies the response server-side. Local development uses explicit test behaviour; the local email inbox is absent in production.

## 5. Private file storage

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
