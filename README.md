# SolarWise SA

SolarWise SA is a no-login solar decision-support application for South African households. Calculations are estimates, not quotes, guarantees, financial advice or live tariff data.

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL 14 or newer for tariffs, feedback and administrator features
- Internet access for live Open-Meteo and PVGIS requests

Core calculations and static pages can run without PostgreSQL. Database-backed functions report unavailable until a database is configured and migrated.

## Local setup (Windows)

1. Install PostgreSQL using the [official Windows installer](https://www.postgresql.org/download/windows/) or run `winget install --id PostgreSQL.PostgreSQL.17 --exact`. In the installer, set and retain the `postgres` superuser password, use port `5432`, and install pgAdmin.
2. Open **SQL Shell (psql)** or pgAdmin and connect as `postgres`. Create a dedicated local application user and database:

   ```sql
   CREATE ROLE solarwise LOGIN PASSWORD 'choose-a-strong-local-password';
   CREATE DATABASE solarwise OWNER solarwise;
   ```

   Use your own password; do not commit it. If the `solarwise` role or database already exists, do not recreate it.
3. In the project root, copy `.env.example` to `.env`. Set `DATABASE_URL` to `postgresql://solarwise:<password>@localhost:5432/solarwise?schema=public` (URL-encode special characters in the password). Generate a private JWT key with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Put the generated value in `JWT_SECRET`. Keep `.env` private.
4. Install dependencies and prepare the database:

   ```powershell
   npm ci
   npm run db:generate
   npm run db:check
   npm run db:migrate
   ```

5. To initialise reference provinces and an administrator, set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters in `.env`, then run:

   ```powershell
   npm run db:seed
   ```

   Seeding is optional for stateless calculators. It never uses bundled credentials.
6. Start the server and open [http://localhost:3000](http://localhost:3000):

   ```powershell
   npm start
   ```

   `npm run dev` starts the development watcher.
7. Run tests with `npm test`. Check `/api/health` for server liveness and `/api/health/ready` for database readiness.

### Database commands

- `npm run db:check` tests the configured PostgreSQL connection.
- `npm run db:status` reports migration status.
- `npm run db:migrate` applies development migrations.
- `npm run db:deploy` applies checked-in migrations in a deployment; back up the database first.
- `npm run db:seed` creates/updates province reference records and the administrator specified by `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

The server does not run schema changes on startup. If PostgreSQL is not configured, public pages and non-database calculators remain available; database-dependent routes return an explicit error. Read [installation instructions](documentation/installation.md) for troubleshooting and production notes.

## Weather and solar data

Open-Meteo forecast requests have bounded timeouts and retries. Successful responses are cached in memory; stale results from the same running process may be served after an upstream failure and are marked `stale`. If there is no previous cached response, the API reports an upstream-unavailable error; it never invents weather. The cache is cleared when the server restarts. PVGIS results are modeled long-term potential, not a live meter reading. Both sources include provenance and retrieval timestamps.

Open-Meteo and PVGIS require outbound DNS/network access. The live Open-Meteo endpoint could not be reached in the development environment due to DNS resolution failure; retry behavior is covered with mocked tests, not represented as a successful live integration test.

No tariff schedule is bundled as current. Users enter their own tariff or use administrator-maintained tariff records with source and effective dates. See [calculation methodology](documentation/calculation-methodology.md) for assumptions.

## Documentation

- [Installation](documentation/installation.md)
- [API documentation](documentation/api-documentation.md)
- [Calculation methodology](documentation/calculation-methodology.md)
- [Database design](documentation/database-design.md)
- [Deployment](documentation/deployment.md)

## Privacy and security

Core calculations are stateless and do not require accounts. Saved scenarios stay in the user's browser. Do not enter account numbers or other sensitive identifiers. Administrator endpoints require a signed bearer token and role check. Deploy behind HTTPS, configure a strict origin, rotate secrets, and review POPIA obligations before operating analytics or collecting feedback.
