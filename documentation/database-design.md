# Database design

PostgreSQL is accessed through Prisma. The schema contains:

- `Administrator` for hashed-password privileged access.
- `Province` and `Municipality` geographic reference tables.
- `ElectricityTariff` records with historical effective dates, source, verification date, customer category, fixed/energy charges, time-of-use data and optional feed-in rate.
- `SolarDataset` and `WeatherObservation` for dated, geographically described external data.
- `InstallationCostAssumption`, `SystemConfiguration`, `ApplianceProfile`, and `EmissionsFactor` for configurable reference assumptions.
- `EducationalContent` and `FAQ` for managed, source-linked public information.
- `ApiLog` for integration status records and `Feedback` for user submissions.

Tariff history is retained by effective dates; a current tariff is represented by a null `effectiveTo`. The application does not seed fictional or unverified tariff values. Province names are seeded; municipality and tariff source records must be researched and reviewed before publication.
