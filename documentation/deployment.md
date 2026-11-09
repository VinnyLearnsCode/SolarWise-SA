# Deployment and operations

Deploy the Node.js service behind a managed HTTPS reverse proxy. Configure `NODE_ENV=production`, `PORT`, PostgreSQL `DATABASE_URL`, a rotated 32+ character `JWT_SECRET`, and an exact `FRONTEND_ORIGIN`. Keep `.env` outside source control and use the deployment platform's secret manager.

Set `PUBLIC_SITE_URL` to the canonical public origin (scheme and hostname, without a path). The application generates `/robots.txt` and `/sitemap.xml` from this origin. Static page canonical and social metadata must use the same domain; update those tags when moving from the configured Render preview hostname to a custom production domain. Submit the production sitemap in search-engine webmaster tools after deployment.

Build the Prisma client and apply reviewed migrations as a release step (`npm run db:generate`, `npm run db:migrate`). Do not run development migrations automatically on application startup. Seed an administrator only through the protected deployment process.

Use PostgreSQL automated backups with encryption, retention and restore drills. Monitor HTTP 5xx rates, database connectivity, rate limits and Open-Meteo/PVGIS availability. Upstream feeds are cached in process memory; multiple replicas do not share cache and do not have a durable fallback store. A failed upstream request returns a visible service error rather than a fabricated result.

The current release is a working decision-support foundation, not a fully certified investment, engineering, or compliance system. Before public production use, independently validate calculation assumptions, source an official emissions factor, add reviewed tariff datasets and freshness monitoring, complete POPIA assessment and retention controls, perform security testing, and validate municipal approval guidance.

Google Tag Manager and optional analytics are disabled. Keep them disabled until every container tag, trigger, data destination and retention setting has been reviewed. If analytics is later enabled, first implement an appropriate consent flow, allow only the reviewed endpoints in the Content Security Policy, and test that calculator inputs and query parameters are not transmitted.

The privacy notice lists the supplied operator identity and contact email, a 365-day retention period for feedback and closed privacy-request correspondence, and request acknowledgment/response targets. The application runs feedback cleanup at startup and daily when the database is available. The operator must apply the correspondence-retention rule to the contact mailbox and check the hosting provider's backup expiry schedule; database backups can outlive deletion from the live database. Review requests sent to the privacy contact, acknowledge within 5 business days, aim to resolve within 30 calendar days, and record any reason for delay. Obtain an appropriate POPIA review before public launch; do not treat the notice as legal advice.
