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
- `POST /admin/tariffs` requires the same token and an administrator role. A tariff must include its municipality, effective date, source URL, last verification date, and exactly one energy-rate representation: a flat `energyChargePerKwh` or an inclining-block `energyBlocks` array. Fixed monthly charges are optional when the source does not specify them.
- `POST /admin/tariffs/import` requires the same token and an administrator role. Submit `{ "csv": "..." }` (maximum 256 KB) using the [tariff CSV worksheet](../frontend/data/tariff-import-template.csv), prefilled with all 213 map municipalities. Required columns: `municipality`, `province`, `name`, `customerCategory`, `effectiveFrom`, `lastVerifiedAt`, and `sourceUrl`. Provide exactly one of `energyChargePerKwh` (flat rate) or `energyBlocks` (JSON array of `{ "upToKwh": number | null, "ratePerKwh": number }`; limits must increase and the final block uses `null`). Optional fields are `fixedMonthlyCharge`, `fixedCharges` (JSON array of `{ "name": string, "amount": number, "frequency": "perMonth" | "perDay" | "once" }`), `feedInRatePerKwh`, `timeOfUseRates` (JSON object), and `pricesIncludeVat` (`true` or `false`, blank if unstated). Dates use `YYYY-MM-DD`; source URLs must use HTTPS. Municipality and province names must match the map boundary dataset. Missing municipality database records are created from that canonical list, and untouched blank worksheet rows are ignored. Existing identical records are skipped; a duplicate with conflicting values aborts the import. The importer validates schedule shape, HTTPS, and required fields but cannot verify that a source is official or that the figures match it; an administrator must review those details. Tiered schedules appear as schedules and are never reduced to a flat rate for map shading or calculator autofill.

The [partial 2026/27 verified metro CSV](../frontend/data/verified-metro-tariffs-2026-27-partial.csv) contains two Johannesburg prepaid residential schedules from the official City Power tariff publication. It is not a complete list of Johannesburg plans or other metros. The publication does not state VAT treatment, so the CSV leaves that field blank.

Public calculator endpoints never require authentication. Do not place administrator tokens in URLs or browser local storage.
