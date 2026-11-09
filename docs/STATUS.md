# Application status

## Implemented and locally exercised

- Responsive public pages, tutor discovery/profiles/photos, resource search/filtering and three role-based portals.
- Registration, verification/welcome emails, password plus email OTP login, password reset, expiring sessions and sensitive-action password confirmation.
- Email-bound, single-use admin invitations; admin-created student accounts; tutor approval and account suspension.
- Editable profiles and safe image processing; tutor draft editing and publishing; admin-only changes to published resources.
- Availability, pending student requests, admin assignment with scheduling conflicts checked, request withdrawal, completion, eligible reviews, and admin-controlled cancellation/rescheduling requests.
- Persisted private messaging/read status with five-second refresh, notifications, announcements and contact enquiries.
- Date-filtered, role-scoped activity analytics with chart/table views; CSV/PDF/XLSX session reports; administrative audit/delivery views.
- Private local or S3-compatible storage. Object uploads and short-lived authenticated download redirects are exercised against a local S3-compatible test server, not a real cloud account.
- Durable mail jobs with unique reminder keys, worker leases, retry limits/backoff, stale-reminder cancellation and delivery status. Real Nodemailer message serialization is tested; actual SMTP delivery is unverified.
- Additive versioned schema upgrades, TLS settings for hosted MySQL, portable Node startup, Vercel proxy generator, Render blueprint, CI checks and optional hourly reminder workflow.

## Validation boundaries

The latest local release checks passed: 27 backend tests, 10 browser tests and the production build. The generated XLSX was also read independently with openpyxl. The production dependency audit reported zero known vulnerabilities at the time of the check. These results describe this checkout. Automated WCAG A/AA checks cover five public pages and do not certify every aspect of accessibility. MySQL CI is configured, but no live MySQL provider has been connected in this workspace. A local MySQL server installation was unavailable because the workspace cannot write the system package directories. SQLite is the locally exercised database.

## What prevents a live release

The user has no service accounts configured yet. A public release requires Vercel, an API host, persistent MySQL, verified email sender, CAPTCHA keys, and private file-storage settings. No public application URL is deployed or verified. Follow [Vercel setup](VERCEL_SETUP.md).

Real-user content, actual tutor credential verification, operator contact details/privacy/age policies, human acceptance testing, provider backup/restore rehearsal, and production workload measurements require owner participation. No legal/privacy certification, guaranteed free-tier availability, 500-user capacity or uptime SLA is claimed. Free-host sleeping and scheduled-run delays can affect reminders. Messaging uses polling rather than a streaming connection.

## Vercel deployment preparation update

The application now includes a tested Vercel Node function adapter, cached cold-start initialization, fresh-production subject categories, optional first-admin email bootstrap, bounded post-response email jobs and direct signed PDF uploads. API bodies stay small while the browser uploads PDFs up to 20 MB to private storage. Vercel’s official Node builder produced a nodejs24.x Lambda with handler api/index.js; this was an offline bundle verification, not a published deployment. The standalone Node/Render path remains available.

The Vercel adapter and large-file flow are tested locally. A real Vercel deployment and provider-backed smoke checks are still pending. Consult VERCEL_SETUP.md for the single-project configuration; do not select the multi-service import automatically inferred from render.yaml.
