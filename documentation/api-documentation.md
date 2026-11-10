# API documentation

Base path: `/api`. JSON request bodies are capped at 32 KB. Rate limiting is 120 requests per 15 minutes per client IP.

## Public endpoints

- `GET /health` — service status and timestamp.
- `POST /calculations/solar` — validated solar investment estimate. Requires `monthlyBill`, `monthlyConsumption`, `tariff`, `systemKw`, and `installationCost`. Optional inputs include `batteryKwh`, `annualTariffIncrease` (decimal, e.g. `0.08`), `lifespanYears`, `irradiation`, `performanceRatio`, `selfConsumption`, and `mode`.
- `POST /calculations/affordability` — savings timeline: `currentSavings`, `monthlySaving`, `targetCost`; optional `monthlyReturn` (monthly decimal), `annualInflation` (decimal), `annualLumpSum`.
- `POST /calculations/loan` — amortization: `systemCost`, `deposit`, `annualInterestRate` (decimal), `termMonths`, optional `monthlySavings`.
- `POST /calculations/usage` — appliance estimates: `appliances` array of name, watts, quantity, hoursPerDay, daysPerMonth; optional tariff.
- `POST /calculations/battery` — outage estimate: `hours` plus appliances (watts, quantity, hours).
- `GET /weather?latitude=-26.2&longitude=28.0` — Open-Meteo current conditions, recent observations and forecast.
- `GET /solar-potential?latitude=-26.2&longitude=28.0&peakPower=5&orientation=180&tilt=30` — PVGIS modeled production estimate. Orientation uses PVGIS azimuth conventions (`180` north-facing, `0` south-facing).
- `GET /solar-irradiation?latitude=-26.2&longitude=28.0` — modeled long-term global horizontal irradiation from PVGIS.
- `POST /solar-map/financial-estimate` — map savings/payback estimate. Requires numeric `latitude`, `longitude`, `monthlyBill`, `monthlyConsumption`, `tariff`, `systemKw`, and `installationCost`; accepts optional `selfConsumption` (decimal from 0 to 1), `orientation` and `tilt`.
- `GET /tariffs` — currently effective database tariff records. No default live tariffs are supplied.
- `POST /feedback` — validated product feedback; database required.

Validation failures return HTTP 400 with `VALIDATION_ERROR`; unavailable persisted data or upstream service returns a structured HTTP 503 error. External data responses identify the source, retrieval time and classification, and may identify that a response was served from cache.

## Administrator

- `POST /admin/login` with email/password returns an 8-hour signed bearer token.
- `GET /admin/overview` requires `Authorization: Bearer <token>`.
- `POST /admin/tariffs` requires the same token and an administrator role. A tariff must include municipality, effective date, charges, source URL and last verification date.
- `POST /admin/tariffs/import` requires the same token and an administrator role. Submit `{ "csv": "..." }` (maximum 256 KB) using the [tariff CSV worksheet](../frontend/data/tariff-import-template.csv), prefilled with all 213 map municipalities. Required columns: `municipality`, `province`, `name`, `customerCategory`, `effectiveFrom`, `lastVerifiedAt`, `fixedMonthlyCharge`, `energyChargePerKwh`, and `sourceUrl`; optional columns are `feedInRatePerKwh` and `timeOfUseRates` (a JSON object). Dates use `YYYY-MM-DD`; source URLs must use HTTPS. Municipality and province names must match the map boundary dataset. Missing municipality database records are created from that canonical list, and untouched blank worksheet rows are ignored. Existing identical records are skipped; a duplicate with conflicting values aborts the import. The importer validates HTTPS and required fields but cannot verify that a source is official or that the figures match it; an administrator must review those details. It accepts single flat energy rates only; do not condense inclining-block tariffs into a single rate.

Public calculator endpoints never require authentication. Do not place administrator tokens in URLs or browser local storage.
