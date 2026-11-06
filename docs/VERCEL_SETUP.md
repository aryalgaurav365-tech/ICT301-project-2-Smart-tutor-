# Put SmartTutor online: start with Vercel

This guide deliberately separates account setup from deployment. Vercel serves the browser application; the app also needs an API server, persistent MySQL, outbound email, CAPTCHA and private object storage. A frontend deployment by itself will not provide working login/bookings.

No accounts or paid services have been created for you. Current free-plan availability must be checked during signup. Do not enable paid upgrades, automatic paid overages, or a trial that charges later. Use provider subdomains to avoid buying a domain.

## 1. Create your Vercel account

1. Visit https://vercel.com and choose **Sign up**.
2. Choose **Continue with GitHub** and connect your GitHub account.
3. Select the free **Hobby** plan if it is currently offered and you are eligible. Stop if payment is required.
4. Choose **Add New → Project**, then import `aryalgaurav365-tech/ICT301-project-2-Smart-tutor-`. If it is missing, use Vercel's GitHub access controls to grant access to that repository only.
5. Use the branch containing the application (`main` once the tested implementation is integrated; development is also on `phase2-webapp`). Keep the **Root Directory** at the repository root.
6. Configure **Build Command**: `npm run build`; **Output Directory**: `apps/web/dist`; **Install Command**: `npm ci`. If framework detection is unclear, select **Other** and use those commands.
7. Do not treat a static frontend preview as the finished app. Complete API setup and the reverse proxy below before validating a release.

UI labels may change. If a screen differs, describe its fields; no passwords or secret keys are needed in chat.

## 2. Prepare a free API and database

- Create a Render account connected to GitHub. Choose **New → Web Service**, select the repository/application branch, Node runtime and the free instance if available. Build: `npm ci && npm run build`; start: `npm start`; health check: `/api/health`. The included `render.yaml` describes this setup.
- Obtain a persistent MySQL database from a provider with a genuinely free current plan. Aiven free MySQL is a candidate, subject to availability. Vercel's frontend does not supply MySQL automatically. Do not choose a paid database or assume historical PlanetScale plans still exist.
- Enter `DATABASE_URL` in Render's **Environment** settings, not GitHub source or chat. Set `DB_SSL=true`. If the provider requires its own CA certificate, upload it through the host's secure-file mechanism and set `DB_SSL_CA_FILE` to that path. Keep certificate verification enabled.
- Set `NODE_ENV=production`, `APP_URL` to the intended Vercel HTTPS URL, and `TRUST_PROXY=1` only for the documented hosting topology.
- Configure the email and CAPTCHA settings in steps 4 and 5. Render free hosts can sleep: waking the API can delay first requests and outgoing email.

## 3. Connect Vercel to the API

Once the API hostname exists, run from a trusted checkout:

```sh
DEPLOY_API_ORIGIN=https://YOUR-API.onrender.com node scripts/configure-vercel.mjs
```

The generated `vercel.json` contains a public hostname, not a secret. Commit it and redeploy Vercel. `/api/*` must be rewritten to the API **before** the SPA fallback. This keeps login cookies on the frontend's origin. Set Render's `APP_URL` to that same Vercel URL. Custom domains are optional; changing the frontend URL requires updating `APP_URL` and CAPTCHA allowed domains.

Share only the public Render/Vercel URLs with the development session when ready, so the actual configuration can be generated and reviewed.

## 4. Configure real email

Choose an email service whose current free allowance and sender-verification requirements you have checked. A transactional SMTP provider is supported; no particular provider's pricing is guaranteed. Verify your sender address and add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` securely on Render. Use the provider's exact settings.

Until real SMTP is configured, production email verification, OTP login, resets and reminders cannot be considered working. The local development inbox is intentionally absent in production.

## 5. CAPTCHA and private storage

- Create a Cloudflare Turnstile widget if its free option meets your requirements. Register the Vercel hostname and add `CAPTCHA_SITE_KEY` and `CAPTCHA_SECRET` securely on Render. Production registration verifies CAPTCHA server-side.
- Use a private S3-compatible bucket for PDFs/profile photos. Set `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and, if required, `S3_FORCE_PATH_STYLE=true`. Restrict the storage key to the application's bucket and required object operations.
- Only accept a storage service if its current free allowance is suitable and paid overages are disabled or understood. Cloudflare R2 and other S3-compatible services are candidates, not a guarantee of no-card signup. If every option requires billing you do not want, stop and choose a different service with assistance.
- Do not enable `PERSISTENT_DISK` on ephemeral Render free disk. Authenticated API checks precede short-lived signed PDF download links. Buckets must remain private.

## 6. Provision your first administrator

From a trusted machine/workspace with the production database connection set securely:

```sh
npm run admin:invite -- your-email@example.com
```

This queues an email-bound, single-use invitation that expires in 48 hours. The command does not print the invitation token or create a demo admin. The configured mail worker sends it. Register as an invited admin, verify the email, then sign in using the emailed OTP. Existing admins can invite more admins through **Admin tools** after confirming their password. Never run `db:seed` against production.

## 7. Reminders while the API sleeps

An optional GitHub Actions workflow, `Scheduled email and session reminders`, runs hourly when you explicitly enable the repository variable `ENABLE_SMARTTUTOR_REMINDERS=true` and securely configure the matching Actions secrets listed in that workflow. This is separate from Render settings. Check your GitHub Actions free-minute allowance before enabling it.

Hourly runs are not exact-time delivery, and scheduled Actions can be delayed or disabled by GitHub. Provider CA requirements also apply on this runner. For a contractual timing guarantee, choose a suitable always-running worker/scheduler; no uptime guarantee is claimed for free hosting.

## 8. Verify the complete deployed application

Through the final Vercel URL: register a student and tutor, receive real verification/OTP messages, approve the tutor as admin, set availability, request and assign a session, exchange messages, upload/download a private PDF, test a reschedule/cancellation, publish a draft, export all three report formats and check analytics. Restart/redeploy the API and confirm records and files remain. Rehearse database and storage restore before real student use.

The app is live only after these checks succeed. User acceptance, actual branding/contact details, privacy/age policy and tutor credential verification still need the operator's input.
