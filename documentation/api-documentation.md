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
- `GET /solar-potential?latitude=-26.2&longitude=28.0&peakPower=5` — PVGIS modeled production estimate.
- `GET /tariffs` — currently effective database tariff records. No default live tariffs are supplied.
- `POST /feedback` — validated product feedback; database required.

Validation failures return HTTP 400 with `VALIDATION_ERROR`; unavailable persisted data or upstream service returns a structured HTTP 503 error. External data responses identify the source, retrieval time and classification, and may identify that a response was served from cache.

## Administrator

- `POST /admin/login` with email/password returns an 8-hour signed bearer token.
- `GET /admin/overview` requires `Authorization: Bearer <token>`.
- `POST /admin/tariffs` requires the same token and an administrator role. A tariff must include municipality, effective date, charges, source URL and last verification date.

Public calculator endpoints never require authentication. Do not place administrator tokens in URLs or browser local storage.
