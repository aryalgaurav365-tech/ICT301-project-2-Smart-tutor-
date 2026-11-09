# SmartTutor

A responsive tutoring application built with React/Vite, Express and Knex. Students request sessions; administrators assign them after checking tutor availability and scheduling conflicts. Tutors share learning resources and privately message assigned students.

## Run locally

Node.js 24.x is required. From the repository root:

```sh
npm ci
cp .env.example .env
npm run db:seed
npm run dev
```

The frontend is available at the address Vite prints. SQLite stores local data; no database account is needed for development. Login codes, verification and reset links are captured in the **local email inbox** linked from the sign-in page. No real messages are sent without SMTP configuration. Never expose development mode publicly.

Synthetic demo accounts use password `LearnTogether!26`:

| Role    | Email                  |
| ------- | ---------------------- |
| Student | alex@smarttutor.test   |
| Tutor   | elena@smarttutor.test  |
| Tutor   | marcus@smarttutor.test |
| Tutor   | sophie@smarttutor.test |
| Admin   | admin@smarttutor.test  |

Each login requires the six-digit code from the local inbox. Demo seeding is disabled in production and is non-destructive locally. Never copy this development database into production.

## Validation

```sh
npm run build
npm test
# With the seeded dev server running and Chromium installed:
npm run test:browser
```

Browser tests use `/usr/bin/chromium`; set `CHROMIUM_PATH` for another location. They add synthetic records to the development database. API tests use an isolated in-memory SQLite database. These do not establish MySQL behaviour under concurrent production traffic.

## Hosting

The app runs on Vercel or any suitable Node host with `npm ci && npm run build` followed by `npm start`. The API serves both its routes and the React build, so a single-host deployment needs no frontend changes. Production requires either `DATABASE_URL` or the separate `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` fields for persistent MySQL and `APP_URL` for the public HTTPS origin. Configuration is loaded from repository-root `.env` locally; use provider secret settings in production.

For Vercel frontend + Render API, see [deployment instructions](docs/DEPLOYMENT.md). Relative `/api` requests go through a same-origin reverse proxy. There is no Vercel SDK dependency in application logic.

## Application capabilities and release status

Implemented: responsive public pages, role-based portals, tutor discovery/profiles/photos, resource filters, verification/welcome emails, OTP authentication/reset, one-time admin invitations and re-authentication, tutor approval, availability, conflict-checked assignment, cancellation/rescheduling requests, private messaging, notifications, draft/content management, reviews, date-filtered analytics, three report formats, admin enrollment, audit/delivery views and contact enquiries.

Local email capture, storage and SQLite make the app usable without service accounts. Production supports MySQL with verified TLS and private S3-compatible object storage. The committed Vercel configuration runs the API and frontend in one project; Render is optional. These provider paths need live account verification. Messaging refreshes every five seconds. Email workers use bounded retries and leases; reminders still depend on an awake worker or scheduled workflow and cannot promise exact timing on free hosts.

Start deployment with [the Vercel account/setup guide](docs/VERCEL_SETUP.md), then follow [hosting details](docs/DEPLOYMENT.md). The app has not been deployed to a public URL. The complete local test/build evidence and remaining live prerequisites are separated in [STATUS.md](docs/STATUS.md).

To provision the first production admin, securely configure the production database connection on a trusted machine and run `npm run admin:invite -- your-email@example.com`. The invitation is delivered by the configured email worker. Existing administrators invite others from Admin tools. Never seed demo credentials in production.

The app uses JavaScript modules; the original proposed TypeScript conversion is deferred. Human acceptance, real branding/contact content, privacy/age policy and tutor qualification checks remain with the project owner. No accreditation or legal-compliance certification is claimed.
