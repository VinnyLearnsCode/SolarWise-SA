# Deployment and operations

Deploy the Node.js service behind a managed HTTPS reverse proxy. Configure `NODE_ENV=production`, `PORT`, PostgreSQL `DATABASE_URL`, a rotated 32+ character `JWT_SECRET`, and an exact `FRONTEND_ORIGIN`. Keep `.env` outside source control and use the deployment platform's secret manager.

Build the Prisma client and apply reviewed migrations as a release step (`npm run db:generate`, `npm run db:migrate`). Do not run development migrations automatically on application startup. Seed an administrator only through the protected deployment process.

Use PostgreSQL automated backups with encryption, retention and restore drills. Monitor HTTP 5xx rates, database connectivity, rate limits and Open-Meteo/PVGIS availability. Upstream feeds are cached in process memory; multiple replicas do not share cache and do not have a durable fallback store. A failed upstream request returns a visible service error rather than a fabricated result.

The current release is a working decision-support foundation, not a fully certified investment, engineering, or compliance system. Before public production use, independently validate calculation assumptions, source an official emissions factor, add reviewed tariff datasets and freshness monitoring, complete POPIA assessment and retention controls, perform security testing, and validate municipal approval guidance.
