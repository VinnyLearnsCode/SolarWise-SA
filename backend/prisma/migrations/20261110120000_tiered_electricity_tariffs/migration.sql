ALTER TABLE "ElectricityTariff"
  ALTER COLUMN "fixedMonthlyCharge" DROP NOT NULL,
  ALTER COLUMN "energyChargePerKwh" DROP NOT NULL,
  ADD COLUMN "fixedCharges" JSONB,
  ADD COLUMN "energyBlocks" JSONB,
  ADD COLUMN "pricesIncludeVat" BOOLEAN;
