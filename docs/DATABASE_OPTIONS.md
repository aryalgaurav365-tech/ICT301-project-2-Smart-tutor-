# Free database recommendation — 9 November 2026

Recommendation for SmartTutor: **TiDB Cloud Starter, monthly spending limit $0**. This is a MySQL-compatible service, rather than the MySQL server itself. Validate the actual hosted schema, migration locks, TLS, and concurrent booking behaviour before marking the live database ready.

## Evidence from official provider documentation

Direct pricing pages were blocked by this workspace's outbound policy. The following evidence was read from the providers' own public documentation repositories, rather than inferred from historical pricing or trial banners.

### Aiven MySQL: no new free services

Aiven states that new free MySQL services cannot be created from **6 November 2026**. Existing free services are scheduled for termination and data/backups deletion on **21 December 2026**. Its remaining free PostgreSQL offering is a different database engine.

Source: [Aiven's free-MySQL retirement notice](https://github.com/aiven/aiven-docs/blob/cdf59c672f490525ab455923545f186d6c0a11ea/docs/products/mysql/howto/mysql-free-tier-migration-options.md).

The earlier SmartTutor setup guidance recommending a new free Aiven MySQL service is superseded by this notice. Do not provision a paid or trial-credit MySQL service for this zero-cost project.

### TiDB Cloud Starter: recommended candidate

The provider documents an ongoing free Starter quota with no credit card required:

- 5 GiB row-based database storage, plus a separate 5 GiB columnar allowance.
- 50 million request units per month; a request unit is not the same as one SQL query.
- A spending limit of **0** keeps the instance free. A positive limit requires adding a credit card.
- When free quotas are reached, connections are restricted/throttled until usage is reduced or the relevant allowance resets. This is a constrained free service, not unlimited hosting.
- The MySQL protocol and TLS are supported. Usernames include the instance-specific prefix supplied by the connection screen.

Official sources:

- [Plan and free quota](https://github.com/pingcap/docs/blob/16b9550da30e6feba95243d0e6b5ddbd859ab3c4/tidb-cloud/select-cluster-tier.md).
- [Spending limits](https://github.com/pingcap/docs/blob/16b9550da30e6feba95243d0e6b5ddbd859ab3c4/tidb-cloud/manage-serverless-spend-limit.md).
- [Account and Starter creation](https://github.com/pingcap/docs/blob/16b9550da30e6feba95243d0e6b5ddbd859ab3c4/tidb-cloud/create-tidb-cluster-serverless.md).
- [Advisory-lock support](https://github.com/pingcap/docs/blob/16b9550da30e6feba95243d0e6b5ddbd859ab3c4/functions-and-operators/locking-functions.md).

The locking documentation lists GET_LOCK and RELEASE_LOCK, used by SmartTutor's migration protection. This is documented compatibility, not a substitute for testing the actual Starter instance. No account, database, credentials or application connection was created by this research.

## Alternative

Supabase also documents an ongoing free plan with two projects, 500 MB database size per project and a 1 GB file-storage allowance. Its database is PostgreSQL, so SmartTutor would need database-driver and migration/query validation changes. For the current MySQL-oriented code, TiDB is the more direct candidate.

Source: [Supabase billing documentation](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/platform/billing-on-supabase.mdx).

## Account setup

1. Open https://tidbcloud.com/signup and sign up using email or one of its offered Google/GitHub/Microsoft options.
2. Choose **Create Resource → Starter**.
3. Name the instance `smarttutor` and choose an offered region.
4. Keep the monthly spending limit at **$0**, without adding a credit card.
5. Confirm the screen still explicitly offers the free Starter allowance before creating it.
6. Set its password privately and configure the connection through Vercel's secure environment-variable settings. Never send database passwords or full connection URLs in chat.

Vercel remains the application host. Email, CAPTCHA and private PDF/photo storage are separate setup requirements.
