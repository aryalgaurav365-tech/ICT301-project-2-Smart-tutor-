# Portable deployment

## Single Node host

Build `npm ci && npm run build`, start `npm start`. The API serves `/api` and the built React application. Set `NODE_ENV=production`, `APP_URL` to the public HTTPS origin and `DATABASE_URL` to a persistent MySQL connection URL. Use provider-supported TLS options; never disable certificate verification. SQLite is development-only. Dockerfile is supplied but has not been built here.

## Vercel frontend + Render API

1. Choose a persistent MySQL provider whose current free-plan eligibility and limits you have checked. Historical PlanetScale/SendGrid pricing in Phase 1 is not a current price guarantee. Keep credentials out of chat and GitHub.
2. Import this repository into Render using `render.yaml` as a starting blueprint. Confirm it creates a free service with no paid add-ons. Set `DATABASE_URL`, `APP_URL`, email, CAPTCHA and required environment variables in secure settings. `APP_URL` must match the public Vercel origin. `TRUST_PROXY=1` assumes exactly one trusted upstream proxy; validate your provider topology.
3. Once the API hostname exists, generate the frontend reverse-proxy configuration:

   ```sh
   DEPLOY_API_ORIGIN=https://YOUR-API.onrender.com node scripts/configure-vercel.mjs
   ```

   Review and commit the generated `vercel.json`. It contains the public API hostname, not secrets. Regenerate when moving API hosts. Rewrites preserve same-origin session cookies and route frontend refreshes to the SPA.

4. Import the repository root into Vercel. Build: `npm run build`; output: `apps/web/dist`. Use an eligible free plan only.
5. Configure a verified email sender, SMTP settings, Cloudflare Turnstile site/secret keys, and a bootstrap admin invitation on the API. Queue the first invitation with `npm run admin:invite -- your-email@example.com` on a trusted machine with securely configured production database access. The first real admin registers with that email-bound invitation, verifies email and signs in with OTP. Invitations expire and are single-use. Do not run demo seed commands in production.
6. Test sign-in, refreshes on nested frontend routes, tutor approval, student requests, assignment, messages, reports, email delivery and provider persistence through the final public origin.

The current messaging client uses five-second polling, so no WebSocket proxy is required. The API is a long-running service: do not place it on ordinary serverless functions without adapting database connections, jobs, uploads and runtime constraints.

## Persistent files and reminders

Free hosts can sleep and discard local disk. Never enable `PERSISTENT_DISK` without a real durable disk mounted at `DATA_DIR`. Private S3-compatible storage is implemented. Configure the S3 variables listed in `.env.example`; verify the actual provider account before release. Link resources work without cloud storage; PDF upload returns an explicit unavailable error when production storage is not configured.

A 30-second worker tick queues reminders for future sessions within 24 hours and delivers pending SMTP mail with bounded retries. Sleeping hosts cannot promise timely reminders. Worker leases prevent simultaneous workers claiming the same pending message. After a crash following SMTP acceptance, duplicate delivery is still possible. An optional hourly Actions worker supports sleeping hosts; see VERCEL_SETUP.md. SMTP is not an exactly-once transport.

## Configuration and recovery

See `.env.example`. `DATABASE_URL` chooses MySQL; otherwise local SQLite lives under `DATA_DIR` or `apps/api/data` for workspace scripts. `APP_URL` supplies email links and strict browser origin checks. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` enable email. `CAPTCHA_SITE_KEY` and `CAPTCHA_SECRET` configure Turnstile; production registration is unavailable without it. Admin invitations are stored hashed, email-bound and single-use. Local inbox routes are absent in production.

The bootstrap creates missing base tables; additive numbered upgrades are tracked in `schema_versions`. Future live schema changes need new explicit upgrades rather than editing applied migrations. Run one migration process at a time. Back up MySQL and uploaded files separately, then rehearse restore into a separate environment before real-user launch. No live deployment, paid service, provider account or database was provisioned by this change.
