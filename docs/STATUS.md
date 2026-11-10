# Application status

## Implemented and locally exercised

- Responsive public pages, tutor discovery/profiles/photos, resource search/filtering and three role-based portals.
- Registration, verification/welcome emails, password plus email OTP login, password reset, expiring sessions and sensitive-action password confirmation.
- Email-bound, single-use admin invitations; admin-created student accounts; tutor approval and account suspension.
- Editable profiles and safe image processing; tutor draft editing and publishing; admin-only changes to published resources.
- Availability, pending student requests, admin assignment with scheduling conflicts checked, request withdrawal, completion, eligible reviews, and admin-controlled cancellation/rescheduling requests.
- Persisted private messaging/read status with five-second refresh, notifications, announcements and contact enquiries.
- Date-filtered, role-scoped activity analytics with chart/table views; CSV/PDF/XLSX session reports; administrative audit/delivery views.
- Private database-backed storage for production files up to 3 MB, plus local or S3-compatible storage. Tutor uploads accept PDFs and validated still JPEG/PNG/WebP images, reject video/link uploads, and rewrite images as WebP. Object uploads and short-lived authenticated download redirects are exercised against a local S3-compatible test server, not a real cloud account.
- Durable mail jobs with unique reminder keys, worker leases, retry limits/backoff, stale-reminder cancellation and delivery status. Real Nodemailer message serialization is tested; actual SMTP invitation delivery was reported successful by the user in a separate connected chat.
- Additive versioned schema upgrades, TLS settings for hosted MySQL, portable Node startup, Vercel proxy generator, Render blueprint, CI checks and optional hourly reminder workflow.

## Validation boundaries

The current local checks passed 44 backend tests, 15 browser scenarios and the production build. Coverage includes CAPTCHA lifecycle, upload types, database file persistence, completed-session ratings, two-session messaging and a 390-pixel phone layout. CAPTCHA browser tests use a simulated provider; completing a live challenge remains a production verification step. The generated XLSX was also read independently with openpyxl. The production dependency audit reported zero known vulnerabilities at the time of the check. These results describe this checkout. Automated WCAG A/AA checks cover five public pages and do not certify every aspect of accessibility. MySQL CI is configured, but no live MySQL provider has been connected in this workspace. A local MySQL server installation was unavailable because the workspace cannot write the system package directories. SQLite is the locally exercised database.

## What prevents a live release

The user has created a Vercel account and reported a deployment at https://ict-301-project-2-smart-tutor.vercel.app/. This workspace has not verified the live endpoint because its network access is blocked. The user reports that production database connectivity, SMTP invitation delivery, administrator access and Turnstile configuration have been verified in a separate connected chat. This workspace cannot independently inspect that account. Database-backed uploads now require no extra storage credentials; larger PDFs still require object storage configuration. TiDB Cloud Starter is now the recommended free database candidate; see DATABASE_OPTIONS.md. Follow [Vercel setup](VERCEL_SETUP.md).

Real-user content, actual tutor credential verification, operator contact details/privacy/age policies, human acceptance testing, provider backup/restore rehearsal, and production workload measurements require owner participation. No legal/privacy certification, guaranteed free-tier availability, 500-user capacity or uptime SLA is claimed. Free-host sleeping and scheduled-run delays can affect reminders. Messaging uses polling rather than a streaming connection.

## Vercel deployment preparation update

The application now includes a tested Vercel Node function adapter, cached cold-start initialization, fresh-production subject categories, optional first-admin email bootstrap, bounded post-response email jobs and direct signed PDF uploads. API bodies stay small while the browser uploads PDFs up to 20 MB to private storage. Vercel’s official Node builder produced a nodejs24.x Lambda with handler api/index.js; this was an offline bundle verification, not a published deployment. The standalone Node/Render path remains available.

The Vercel adapter and large-file flow are tested locally. A real Vercel deployment and provider-backed smoke checks are still pending. Consult VERCEL_SETUP.md for the single-project configuration; do not select the multi-service import automatically inferred from render.yaml.

## TiDB connection-field setup

The app accepts separate DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME settings, so passwords do not need URI encoding. DATABASE_URL remains supported. The current Vercel function region is aligned to the selected Tokyo TiDB endpoint. Real TiDB connection verification remains pending; these changes do not configure the account's password, IP allowlist or Vercel environment variables on the user's behalf.
