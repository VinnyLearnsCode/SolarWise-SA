# Calculation methodology and limitations

All currency outputs are nominal South African rand (ZAR). Estimates are not quotes, financial advice, guaranteed generation, or an engineering design.

## Solar estimate

Annual AC generation estimate is:

`system kWp × daily irradiation (kWh/m²/day) × 365 × performance ratio`

Default performance ratio is 0.78 to account for aggregate system losses. Annual generation is reduced by 0.5% degradation per modeled year. This simplified engine does not model hourly shading, tilt, orientation, temperature, inverter clipping, dispatch, time-of-use billing or export compensation. PVGIS can provide location-specific modeled production separately; the calculator lets the user enter an irradiation estimate.

Estimated self-used solar is the lesser of annual consumption and generation multiplied by an assumed self-consumption fraction (default 75%). Annual bill savings are capped by the annual bill and calculated at the user's single entered energy tariff. Fixed charges are not modeled and exports receive no assumed value.

Annual maintenance defaults to 1% of installation cost. Gross savings grow using the user-set tariff escalation and are reduced by 0.5% annual panel degradation. Net savings subtract annual maintenance. Long-term savings are nominal, undiscounted values; no NPV/IRR claim is made. Simple payback divides initial cost by first-year savings net of maintenance and is not a discounted cash-flow payback.

The calculator can load modeled annual PVGIS output for a representative South African city. It converts that output to the calculator's equivalent daily-irradiation input using the selected capacity and calculator performance ratio; it does not treat the PVGIS result as a measured value or a guarantee. Location, source, retrieval time, and cache status are shown with the assessment. The optional stress test reruns the estimate with solar resource and installed cost changed by 10% in either direction. These are illustrative scenarios, not confidence intervals or forecasts.

The application does not currently calculate carbon savings because no dated, verified South African grid emissions factor is configured. Do not use an assumed generic factor for formal reporting; publish a sourced factor with its effective date before enabling this estimate.

## Affordability and loan

Affordability compounds the monthly balance by the submitted monthly return, adds monthly contributions, and adds optional lump sums every 12 months. A separate estimate compares a future target using annual installation-cost inflation. Returns and inflation are user assumptions, not predictions.

Loan payments use standard fixed-rate amortization, with a monthly rate equal to the nominal annual rate divided by 12. Fees, insurance, tax effects, rate variability and lender eligibility are excluded.

## Appliance and battery estimates

Monthly appliance kWh = watts × quantity × hours/day × days/month ÷ 1,000. Battery sizing sums load watt-hours, then divides by 80% depth of discharge and 92% inverter efficiency and adds a 15% reserve. Inverter recommendation is 125% of the listed simultaneous load. Starting surges, temperature, battery aging, charging availability, wiring and manufacturer limits are omitted.

## Data sources and freshness

PVGIS is the European Commission Joint Research Centre's modeled solar potential API. Open-Meteo provides weather observations and forecasts; forecast values are not climate normals. Both are fetched on demand with in-memory caching and a timeout. No live Eskom or municipal tariff feed is currently configured. Tariffs must be entered and verified against a municipality or provider's official publication.

The calculator's optional tariff list contains active administrator-maintained records only when the database is available. The displayed energy charge is used as a single flat rate; fixed charges and time-of-use blocks are shown for context but are not included in the solar savings calculation. Check the linked official publication and effective date against the latest bill.
