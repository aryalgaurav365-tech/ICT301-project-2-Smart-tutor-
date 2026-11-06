# SmartTutor

A responsive tutoring application built with React/Vite, Express and Knex. Students request sessions; administrators assign them after checking tutor availability and scheduling conflicts. Tutors share learning resources and privately message assigned students.

## Run locally

Node.js 22.13+ required; Node 24 recommended. From the repository root:

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

The app runs on any suitable Node host with `npm ci && npm run build` followed by `npm start`. The API serves both its routes and the React build, so a single-host deployment needs no frontend changes. Production requires `DATABASE_URL` for persistent MySQL and `APP_URL` for the public HTTPS origin. Configuration is loaded from repository-root `.env` locally; use provider secret settings in production.

For Vercel frontend + Render API, see [deployment instructions](docs/DEPLOYMENT.md). Relative `/api` requests go through a same-origin reverse proxy. There is no Vercel SDK dependency in application logic.

## First development release

Implemented: responsive public pages, tutor search/profiles, filtered resource catalogue, verification/OTP login and reset, role-based portals, tutor approval/suspension, availability, student requests and admin assignment, booking conflict checks, persisted private messaging/read status, notifications, announcements, PDF/link uploads, eligible reviews, summary analytics, CSV/PDF/XLSX session reports, and contact enquiries.

This is not a completed production release. Live MySQL/SMTP/CAPTCHA still require account-level verification. Cloud file storage is pending: production PDF upload fails clearly unless a proven persistent disk is configured. Messaging refreshes every five seconds. Analytics currently shows summary counts rather than the full planned trends. Profile/photo editing, tutor draft editing, cancellation/rescheduling requests, one-time admin invitations, sensitive-action re-authentication, fuller audit/retention controls, security/accessibility review and UAT remain release work. The current admin invitation is a shared provisioning secret: rotate it immediately after onboarding. Reminder timing depends on an awake server and configured SMTP.

The implementation uses JavaScript modules; TypeScript conversion from the original proposed architecture is deferred. See [the implementation plan](IMPLEMENTATION_PLAN.md) for target scope and [current status](docs/STATUS.md) for delivery limits. Demo content does not claim real endorsements, qualifications or accreditation.
