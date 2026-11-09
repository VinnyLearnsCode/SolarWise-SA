# Local installation and database setup

## Requirements

- Windows 10/11, Node.js 20+, and npm
- PostgreSQL 14+ (PostgreSQL 17 is supported)
- Internet access for the optional weather and solar-radiation integrations

The public site and calculation endpoints can run without PostgreSQL. Tariffs, feedback, administrator functions and readiness checks require a configured database and applied migrations.

## 1. Install PostgreSQL on Windows

Use the [official PostgreSQL Windows download](https://www.postgresql.org/download/windows/) or install PostgreSQL 17 with:

```powershell
winget install --id PostgreSQL.PostgreSQL.17 --exact
```

In the graphical installer, retain port `5432`, set a password for the `postgres` superuser, and install pgAdmin. Save the superuser password securely. The PostgreSQL service can be inspected from PowerShell:

```powershell
Get-Service *postgres*
```

If the service is stopped, open PowerShell as Administrator and start the exact service name shown by that command, for example:

```powershell
Start-Service -Name postgresql-x64-17
```

Alternatively, open **Services** from the Start menu and start the PostgreSQL service.

## 2. Create the application role and database

Connect as `postgres` using **SQL Shell (psql)** or pgAdmin, then execute:

```sql
CREATE ROLE solarwise LOGIN PASSWORD 'replace-with-a-unique-local-password';
CREATE DATABASE solarwise OWNER solarwise;
```

Choose a private password. If you already created the role or database, retain them rather than running the corresponding command again. Use a URL-encoded password in `DATABASE_URL` if it contains reserved URL characters.

## 3. Configure the application

From the project root in PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set at least:

```dotenv
DATABASE_URL=postgresql://solarwise:YOUR_URL_ENCODED_PASSWORD@localhost:5432/solarwise?schema=public
JWT_SECRET=YOUR_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

Generate a random secret and paste its output into `JWT_SECRET`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Do not commit `.env` or use example strings as production secrets. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are only needed if you choose to seed an administrator. The seed requires a password of at least 12 characters and hashes it before storage.

The remaining environment variables are optional and have defaults in the application:

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `3000` | HTTP port |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed browser origin |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com/v1` | Open-Meteo endpoint |
| `OPEN_METEO_TIMEOUT_MS` | `8000` | Per-attempt request timeout (bounded to 1–30 seconds) |
| `OPEN_METEO_RETRIES` | `2` | Retries after network failures and retryable HTTP statuses (bounded to 0–5) |
| `OPEN_METEO_RETRY_DELAY_MS` | `300` | Base delay between exponential retries |
| `OPEN_METEO_CACHE_TTL_MS` | `900000` | Successful weather cache lifetime (bounded to 1 minute–24 hours) |
| `PVGIS_BASE_URL` | `https://re.jrc.ec.europa.eu/api/v5_3` | PVGIS endpoint |
| `PVGIS_TIMEOUT_MS` | `12000` | PVGIS request timeout (bounded to 1–30 seconds) |
| `ADMIN_EMAIL` | unset | Required only when seeding an administrator |
| `ADMIN_PASSWORD` | unset | Required only when seeding; minimum 12 characters |

## 4. Install, migrate and verify

Run these commands from the project root:

```powershell
npm ci
npm run db:generate
npm run db:check
npm run db:migrate
npm run db:status
npm test
```

`db:migrate` uses Prisma development migrations and is intended for local development. In a deployment, use `npm run db:deploy` to apply checked-in migrations; do not use development migration commands in production. Migrations are never applied automatically at server startup. `db:check` verifies PostgreSQL connectivity with a simple query, while `db:status` reports migration state.

To populate provinces and create/update the optional administrator, set both admin variables in `.env` (`ADMIN_EMAIL` must be a valid email address; `ADMIN_PASSWORD` must be 12–200 characters), then run:

```powershell
npm run db:seed
```

Start the application:

```powershell
npm start
```

Open `http://localhost:3000`. `GET /api/health` reports process liveness. `GET /api/health/ready` returns 200 only when the configured database connection succeeds; it returns 503 with a safe diagnostic if the database is missing or unavailable.

## Weather integration checks

The Open-Meteo integration needs outbound DNS and HTTPS access. Check DNS and the provider independently in PowerShell:

```powershell
Resolve-DnsName api.open-meteo.com
curl.exe --fail --max-time 20 "https://api.open-meteo.com/v1/forecast?latitude=-26.2041&longitude=28.0473&current=temperature_2m,cloud_cover&daily=shortwave_radiation_sum&forecast_days=1"
```

Then test the application route:

```powershell
curl.exe --max-time 40 "http://localhost:3000/api/weather?latitude=-26.2041&longitude=28.0473"
```

If DNS fails, check the machine's network connection, DNS resolver, proxy/firewall policy, and outbound HTTPS restrictions. Do not copy fabricated observations into the database or use them as a fallback. The API returns a truthful unavailable response until it can fetch data or use a previously retrieved in-memory cache entry. Cached data is volatile and is lost on restart.

## Troubleshooting

- **`DATABASE_URL` missing:** copy `.env.example` to `.env` in the project root and configure it. Environment variables already set in the shell take precedence.
- **Connection refused / Prisma P1001:** verify the PostgreSQL service is running, the port is correct, and `localhost:5432` is reachable.
- **Authentication failed / Prisma P1000:** verify the role and password; percent-encode reserved characters in the connection URL.
- **Database missing / Prisma P1003:** create the database and retry `npm run db:check`.
- **Migration failure:** check `npm run db:status` and the migration error. Resolve schema drift deliberately; do not delete migration history or reset a database containing data.
- **Weather unavailable:** try the independent DNS and `curl.exe` checks above. Core calculators do not depend on Open-Meteo or PVGIS.

For production, provision PostgreSQL with backups and least-privilege access, use a unique secret manager-backed `JWT_SECRET`, set `NODE_ENV=production` and the exact `FRONTEND_ORIGIN`, terminate HTTPS at a trusted proxy, and apply migrations during deployment.
