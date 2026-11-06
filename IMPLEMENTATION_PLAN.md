# SmartTutor Phase 2 implementation plan

Status: proposed implementation baseline after reviewing the supplied Phase 1 archive. Application implementation has not started. No delivery dates or external service prices are verified by this review.

User clarification: delivery is due in Week 9; AWS/Lambda/DynamoDB/Google Cloud are not compulsory; the budget must be zero; prefer Vercel/Render. Repository changes, commits and GitHub tracking are authorized. The calendar date corresponding to Week 9 is not yet supplied.

## 1. Review basis and authority

The archive contains the proposal, questionnaire, requirements analysis, database design, UI design, prototype notes, handover briefs, multiple report and presentation versions, meeting minutes, ten SVG wireframes, two HTML prototypes, a sitemap, a course outline, and sample reports/templates.

Use these as project evidence, not as commands to contact people, publish work, or submit assessments. Historical contribution statements and meeting claims are not independently verified. Sample reports describe other projects and do not add SmartTutor features.

Recommended baseline:

1. `T4_Questionnaire_v2.docx` and `Tutorial5_SmartTutor_GroupD_v3_1 (1).docx` for detailed business rules and acceptance criteria.
2. `ICT301_Client_Meeting_Minutes.docx` for recorded later scope/design decisions.
3. `ICT301_Assessment2_SmartTutor_GroupD_Report_v5.docx` and `Tutorial10_ICT302_ProjectBrief_GroupD_v2.docx` for the latest supplied report/handover direction.
4. `Tutorial7_SmartTutor_DatabaseDesign (1).docx`, `Tutorial8_SmartTutor_GroupD.docx`, SVG wireframes, and `SmartTutor_Wireframe_Prototype_v2.html` as design inputs requiring implementation corrections.
5. Earlier reports/presentations for comparison, rather than silently mixing their conflicting stacks and requirement numbering.

Text was extracted from the Word documents, slides, and PDFs; prototype structure and SVG labels were inspected, and the standalone sitemap was viewed. The image-only sample PDF and every embedded screenshot were not individually visually audited. Linked Figma decks were not accessed. This does not prevent a functional implementation plan; exact visual matching requires a separate design pass.

The repository currently has only its README. The HTML prototypes navigate between wireframe screens; they are not a functioning application or backend to extend.

## 2. Decisions and discrepancies

| Issue | Evidence | Proposed implementation decision |
| --- | --- | --- |
| Requirement IDs conflict | T5 FR-05 is CAPTCHA; later reports use FR-05 for 2FA | Preserve T5's full 40-item numbering in the traceability matrix; cross-reference later report labels |
| Database/hosting conflict | Older meeting report selects MongoDB/AWS; latest brief selects MySQL with Vercel/Render | Build the core with MySQL and keep deployment configurable; do not run two databases without a demonstrated need |
| Course minimums differ from project stack | ICT301 outline Appendix B, page 21 lists AWS dashboard, Lambda/DynamoDB, Google Cloud, re-authentication and account lock-ins | User clarified these cloud platforms are not compulsory; proceed with Vercel/Render preference and MySQL |
| Student booking prototype suggests immediate confirmation | Questionnaire/T5 and v5 report require admin-mediated assignment | Student submits a request; only admin assignment creates a confirmed session |
| Admin self-registration | Questionnaire explicitly permits it | Preserve the registration form but gate privilege activation with an expiring admin invitation or controlled first-admin bootstrap; record this proposed change for client agreement |
| Tutor approval | Email verification and tutor approval are both required | Enforce both; pending/rejected tutors cannot teach, publish, or message as active tutors |
| Published content permissions | T5 limits edit/delete to admin; prototype includes drafts | Tutors may manage their own unpublished drafts; after publishing, admin alone edits/deletes |
| Upload moderation | A prototype note says submitted for review; T5 describes publishing | Default to approved tutors publishing directly; moderation queue is a separate decision |
| Reviews/ratings | Confirmed requirement is tutor reviews; tutorial cards show ratings | Label card scores as the tutor's rating; do not invent tutorial-specific reviews |
| Design palette | Earlier navy/blue proposals differ from recorded later teal approval | Use teal #4A9EBA, Inter, and Heroicons as the starting direction; adjust text/button shades to pass contrast checks |
| Claimed free hosting | Documents assume historical free database/email/hosting plans | Recheck availability, quotas, sleep behaviour and pricing before deployment; no zero-cost guarantee |
| Scale and uptime | Questionnaire leaves capacity open; slides assert 500 users and 99.5% uptime | Treat as proposed targets requiring a workload definition and actual evidence, not verified capabilities |

## 3. Product scope

### Public pages

- Responsive home page: search, subject categories, featured tutors, how it works, and real platform statistics when available.
- Find a Tutor with search/filter/pagination, approved tutor profiles, subjects, availability and public reviews.
- Tutorial catalogue with subject, tutor, keyword, difficulty and content-type filters; clearly label tutor rating filters.
- About, Contact, Privacy and Terms pages. Store contact submissions for admin handling; add email delivery when configured.
- Registration, email verification, login, email OTP, forgotten password and password reset.
- Visitors can see catalogue/profile metadata; require login to access complete learning resources as a provisional preview policy.
- Use clearly marked demonstration content until real biographies, contact details and approved testimonials are supplied. Never invent accreditation or real endorsements.

### Student portal

- Full role-specific registration fields, profile, subjects of interest and consent tracking.
- Dashboard with next session, pending requests, recent resources and unread notifications.
- Session request form with preferred tutor, subject, date/time, duration and learning goals. Show "Awaiting admin assignment" after submission.
- Confirmed session history, cancellation/rescheduling requests, private messages with assigned tutors, and notifications.
- Access PDF/link tutorials and see personal resource activity; activity is not proof of learning mastery.
- Submit one public tutor review per eligible completed session; prevent reviews without attendance/completion eligibility.

### Tutor portal

- Registration with qualifications, biography, subjects and validated profile image; approval status view.
- Dashboard, assigned students, upcoming sessions, profile and own analytics.
- Manage availability intervals and exceptions; show conflicts with confirmed sessions.
- Upload PDFs up to 20 MB or safe external HTTPS links, subject, difficulty, description and tags; save drafts and publish.
- Once published, request admin changes rather than edit/delete it directly.
- Private messaging with assigned students and in-app notifications.

### Admin portal

- Controlled admin onboarding; no public path to immediate admin privilege.
- Approve/reject tutors with reason and audit record; manage users and suspend/deactivate accounts.
- View booking requests, assign/reassign suitable tutors, prevent scheduling conflicts, cancel sessions with a reason, and record completion/attendance.
- Upload, edit, unpublish and remove resources; manage subjects.
- Handle contact enquiries; publish announcements with notification/email jobs.
- Platform analytics with date filters, counts and trends; PDF, CSV and XLSX exports respecting role permissions.
- Audit relevant administrative actions without exposing passwords, tokens or private message bodies in logs.

## 4. Architecture

Use React with Vite and TypeScript for the browser application; Node.js/Express with TypeScript for the API; MySQL with migrations and a supported ORM/query layer; Socket.IO for live messaging and notification updates. Use npm workspaces and a committed lockfile. Select supported stable dependency versions during implementation.

Keep the API responsible for identity, permissions, validation, database transactions, file authorization and analytics. Frontend route guards improve navigation but never replace backend permission checks.

Suggested repository layout:

```text
apps/web/              React pages, components and browser tests
apps/api/              Express API, Socket.IO and background worker entrypoints
packages/shared/       Shared validation schemas and API types
database/              Schema, migrations and synthetic development seed data
docs/                  Architecture, traceability, operations and user guides
```

Prefer one public origin with `/api` routing where hosting allows it. If frontend/API are separate origins, configure exact CORS origins, cookie behaviour and CSRF protections. Avoid storing long-lived authentication tokens in browser localStorage. The reports propose JWT: use short-lived tokens in secure HttpOnly cookies plus revocable server-side refresh/session records, expiry, logout and re-authentication for sensitive operations.

Provide interchangeable service adapters:

| Capability | Local development | Hosted use |
| --- | --- | --- |
| Database | Local MySQL | Managed MySQL or course-approved alternative |
| Email | Local email capture inbox | Verified SMTP/email provider |
| PDFs/images | Persistent local development directory outside public source assets | Cloudinary or approved object storage with controlled access |
| CAPTCHA | Provider-supported test keys/test configuration | Registered site keys and server-side verification |
| Jobs | Database-backed jobs and worker | Persistent worker/scheduler supported by chosen hosting |

Local email capture validates generated messages and authentication flows; it does not prove real email delivery. Test CAPTCHA settings must never silently become a production bypass. Cloudinary PDF delivery restrictions and account settings need a real account-level check.

## 5. Database corrections before implementation

Retain the useful User, Student, Tutor, Administrator, Tutorial, Session, SessionAssignment, Message, Review, Notification, Announcement, Subject and LoginActivity concepts. The final schema need not remain exactly 13 tables: correctness matters more than copying the initial entity count.

- Normalize tutor subjects and student interests with join tables rather than comma-separated lists.
- Add tutor availability intervals and exceptions, with subject relationships and indexes for discovery.
- Separate BookingRequest from confirmed Session/SessionAssignment; preserve request history and assignment decisions.
- Model one-to-one sessions initially, matching the handover; do not introduce group scheduling solely because an older ER diagram allows many students.
- Add authentication sessions/refresh records, hashed single-use email verification/reset tokens, expiring hashed OTP challenges, attempt limits and invitation records.
- Fix Review's misleading `SessionID` foreign key pointing at an assignment ID; enforce one review per eligible student assignment.
- Add resource-view events or defined aggregate counters for recent activity and analytics; record what constitutes a view.
- Add contact enquiries, admin audit records, email outbox/job records and delivery attempts.
- Store UTC session instants and display in the user's IANA timezone, initially Australia/Sydney; handle daylight-saving transitions explicitly.
- Keep derived rating averages computed or explicitly maintained; do not describe cached aggregates as normalized source facts.
- Do not default `EmailSent` to true. Record pending/sent/failed delivery outcomes.
- Use database transactions and locking when assigning sessions so simultaneous admin actions cannot double-book a tutor or student.
- Separate user role, tutor approval, email verification and active/suspended status.
- Preserve historical sessions/reviews through controlled deactivation or appropriate referential rules rather than destructive user deletion.

## 6. Authentication, privacy and operational rules

- bcrypt password hashing with at least 12 rounds as specified; validate byte-length limits and never store raw passwords.
- Email verification before access, then password plus six-digit email OTP for every role at each login. Email OTP matches the project request but is not phishing-resistant MFA.
- Expiring single-use OTP/reset tokens, resend cooldowns, attempt limits and rate limiting. Generic public reset responses avoid account enumeration.
- Session expiry and revocation; sensitive admin actions require recent authentication. Clarify the course's account-lock-in requirement versus the questionnaire's no-account-lockout preference.
- Enforce ownership and role checks on every API endpoint, file download, Socket.IO subscription and message send/read event.
- Validate PDF size and file type/content, image types and dimensions, generated filenames and safe downloads. Keep files private where access requires login; do not proxy arbitrary external URLs into the server.
- Parameterized queries, strict validation, safe rendered text, TLS in deployment, secure headers, CSRF controls and secrets outside the repository.
- Keep DOB/home address private, minimize collection/use, and define retention/access/deletion procedures with the operator. Older drafts mention students aged 15+, so age/guardian policy needs owner review before use by real minors.
- Draft Privacy/Terms text accurately describing implemented behaviour; legal compliance and tutor credential/background verification require accountable human review.
- Test keyboard navigation, focus management, labels, errors, contrast and responsive layouts. Automated accessibility tools support but do not certify WCAG compliance.

## 7. Development sequence and acceptance gates

These are ordered milestones. Week 9 is the delivery deadline, with a proposed schedule below; the current course week and calendar deadline still need to be mapped before treating this as a dated commitment.

| Milestone | Work | Required evidence before moving on |
| --- | --- | --- |
| 1. Foundation | Repository structure, scripts, MySQL, migration/seed workflow, validation, design tokens, CI | Clean install, build, typecheck, health check and database migration succeed; seed is safe to rerun locally |
| 2. Identity | Registration, verification, email capture, login OTP, reset, roles, controlled admin setup, tutor approval | Browser/API tests prove each role's access and all pending/unverified/expired-code denials |
| 3. First complete workflow | Tutor availability, student request, admin assignment, dashboards, confirmation emails | A student requests a slot, admin assigns it, both dashboards update and captured emails match the assignment; simultaneous conflict test passes |
| 4. Resources | Catalogue/profile search, upload/drafts, PDF access, admin content management | Valid PDF/link succeeds; oversized/spoofed files and unauthorized reads/edits fail; search uses persisted data |
| 5. Communication | Persisted private messages, Socket.IO, notifications, announcements, reminder worker | Assigned users exchange messages; unrelated users cannot subscribe/read; restart/retry does not resend completed reminder jobs |
| 6. Reviews and reporting | Eligible reviews, dashboards, view tracking, PDF/CSV/XLSX export | Ineligible/duplicate reviews fail; seeded known counts match reports; exported files contain correct scoped data |
| 7. Full user interface | Remaining public/support pages, responsive layouts, empty/error/loading states, accessibility | Core journeys work at mobile/tablet/desktop sizes with keyboard navigation and no misleading success states |
| 8. Release and handover | Deployment configuration, real provider checks, backup/restore, documentation, demo script | Hosted smoke tests, real configured email/storage tests, migration and restore rehearsal; deployment limitations recorded |

Build working slices connecting UI, API and database from the beginning. Avoid completing every static screen before authentication and booking work. Use synthetic student/tutor data, realistic PDFs and clearly marked demo accounts; never import the archive's student IDs/contact details as public demo data.

## 8. Validation and definition of done

- Unit tests for permission rules, validation, tokens, review eligibility and scheduling.
- API integration tests against isolated MySQL covering authentication, approval, ownership, requests/assignment, uploads, messages, reviews and exports.
- Browser end-to-end tests for student, tutor and admin journeys; include negative cases, expired codes, pending approvals and server errors.
- Concurrent booking tests, daylight-saving/timezone cases, notification retries and restart/recovery tests.
- Build/type checks and dependency/security checks in CI. Report findings rather than claiming OWASP certification.
- Accessibility automation plus manual keyboard checks, responsive checks, and measured representative performance. Under-three-second pages and 500 concurrent users require defined conditions and measured results; published uptime requires operational monitoring over time.
- Real staging smoke checks for HTTPS, cookies, email delivery, CAPTCHA and protected PDF storage once accounts are configured.
- Maintain a requirement-to-screen/API/test matrix using T5 numbering. Record implemented, tested, blocked and deferred status separately.
- Deliver source code, lockfile, migrations, safe seed command, `.env.example` without secrets, setup/start instructions, API documentation, test results, revised ER diagram, user/admin guide, deployment/backup guide and an honest limitations/demo report.
- User acceptance and assessment evidence must reflect actual runs and human feedback; do not invent meetings, contribution logs or client sign-off.

## 9. What can be completed here and what needs the user

I can implement frontend/backend/database code, tests, local email/storage adapters, provider integrations, deployment files, CI configuration, technical documentation and demonstration flows. I can diagnose and fix failures observable through the available workspace/tools. Integrations can be developed before live credentials exist.

User/account-owner prerequisites for a live service:

- Hosting/database/storage/email/CAPTCHA accounts, any billing acceptance, secure credentials and network access. Check available bindings before requesting new ones; never send secrets in chat.
- Verified sender address/domain and DNS changes for production email; domain ownership if a custom URL is wanted.
- Actual branding, approved About/Contact information, licensed teaching materials and valid tutor credentials.
- Current ICT302 rubric and the calendar date/current week for the Week 9 deadline. User has clarified that the listed cloud platforms are not compulsory.
- Approval of the proposed controlled admin-registration change, final legal/privacy text, age policy and real-user launch.

I cannot create legal identities, accept provider terms/billing for the owner, obtain ownership verification codes independently, certify tutor qualifications/legal compliance, guarantee free hosting/uptime, or observe real-user feedback without participation. External deployment remains dependent on access and the selected provider's capabilities. These constraints do not require dropping the core features; use explicit development adapters until live prerequisites are available.

## 10. Deliberately excluded features

Exclude payment processing, built-in live video/audio, native iOS/Android apps and multilingual support based on the supplied scope. Also exclude social login, gamification, mobile push notifications, group discussion threads, FAQ, media gallery, homepage support chatbot, Google Map and social-sharing widgets according to the questionnaire. Footer social links are distinct from social-sharing features.

No AI tutor is specified: the product name does not establish an AI requirement. Do not add AI subscriptions, automated lesson generation, quizzes, payments, or conferencing as implied functionality.

Payment integrations are technically implementable, including a provider's sandbox, but are not needed here. Real payment activation would require a merchant account, business verification, credentials and explicit scope expansion.

## 11. Provisional defaults for unresolved details

Proceed with a 20 MB PDF limit and 24-hour reminders from the latest report; retain these as configuration. If a session is assigned within 24 hours of its start, send confirmation and skip an already-past reminder. A persistent worker retries failed deliveries with bounded attempts and records outcomes.

Use admin-only cancellation with reasons and audit records; students submit requests. Do not invent a cancellation fee or fixed penalty window. Public users see tutorial metadata, verified users access content. Use on-demand/date-filtered analytics rather than streaming every metric. Retain rating filters as tutor-rating filters until a tutorial-rating requirement exists. Use one-to-one sessions and controlled admin invitations initially.

These defaults allow development to start; owner decisions can change them without pretending they were all confirmed during Phase 1. User clarification removes the mandatory-cloud-platform concern.

## 12. Zero-cost deployment and Week 9 delivery

Preferred candidate: Vercel Hobby for the React frontend; a Render free web service for the API/Socket.IO; an external free MySQL service if available and compatible; a free email allowance; Cloudinary's free allowance or suitable free object storage for PDFs/images; provider subdomains instead of a paid domain. Candidate MySQL provider: Aiven free MySQL, subject to signup availability, limits and connection checks. Select the actual email provider after checking free allowances and sender-verification requirements; Brevo is a candidate rather than a confirmed selection. Do not rely on the report's PlanetScale/SendGrid pricing assertions.

Official Vercel, Render, Aiven, Brevo and Cloudinary pages were requested during this review, but the environment proxy denied each with HTTP 403. Current pricing/eligibility is therefore unverified. Required access domains for future checks are `vercel.com`, `render.com`, `aiven.io`, `www.brevo.com`, and `cloudinary.com`; API/database destinations will depend on the selected accounts. No network configuration was changed by this review.

Zero-cost constraints:

- Never enable paid resources, paid upgrades or automatic overage billing merely to complete deployment. If a feature exceeds a free allowance, expose the limitation and stop/queue that operation.
- Render-style free services may sleep or restart, use ephemeral disk, and limit background work. Store PDFs in external persistent storage, messages in MySQL, and jobs in the database. Socket reconnects must recover persisted messages.
- A sleeping free API cannot guarantee reminders at the exact scheduled minute. Verify a permitted free scheduler/worker solution before promising unattended 24-hour reminders. Otherwise provide a clearly documented demo/manual worker mode and record live reminders as blocked, not complete.
- Do not use local SQLite as a supposedly durable database on ephemeral hosting. Keep MySQL locally and choose actual persistent hosted MySQL for live use.
- Free-tier deployment does not establish 24/7 uptime, a 99.5% SLA, unlimited email, or capacity for 500 simultaneous users.
- A complete locally runnable, tested application is possible without hosted accounts. Public deployment depends on free service eligibility and user-provided account access; connecting GitHub alone does not provision those services.
- Deployment configuration and supported CLI/API work can be done here when access is available. There is no currently connected Vercel/Render account integration in this session.

Proposed course-week schedule (compress only after identifying the current week):

| Course week | Deliverable |
| --- | --- |
| 1 | Foundation, schema, design system, local services and CI |
| 2 | Registration, verification, OTP, password reset, role permissions and tutor approval |
| 3 | Complete student-request/admin-assignment flow, availability and dashboards |
| 4 | Tutorials, PDF storage, search/filtering and content administration |
| 5 | Private messaging, notifications, announcements and reminder jobs |
| 6 | Reviews, role-scoped analytics and report exports; remaining public pages |
| 7 | Feature-complete integration, browser tests, security and accessibility fixes |
| 8 | Hosted staging checks, performance measurement, backup/restore and documentation |
| 9 | Buffer for final fixes, acceptance/demo rehearsal, release and handover |

Start by scaffolding the TypeScript React/Express/MySQL project, migrations, synthetic seed data and local email capture. Implement identity and the complete booking workflow first, then deliver the remaining modules with tests. Check hosting prerequisites early so account limitations do not appear for the first time in Week 8.
