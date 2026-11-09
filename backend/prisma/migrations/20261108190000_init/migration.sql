-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Administrator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Administrator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Province" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricityTariff" (
    "id" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerCategory" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "fixedMonthlyCharge" DECIMAL(12,2) NOT NULL,
    "energyChargePerKwh" DECIMAL(12,4) NOT NULL,
    "timeOfUseRates" JSONB,
    "feedInRatePerKwh" DECIMAL(12,4),
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectricityTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolarDataset" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "datasetType" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "geographicCoverage" TEXT NOT NULL,
    "reliability" TEXT NOT NULL,
    "dataClassification" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "SolarDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherObservation" (
    "id" TEXT NOT NULL,
    "latitude" DECIMAL(8,5) NOT NULL,
    "longitude" DECIMAL(8,5) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "sourceName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "WeatherObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationCostAssumption" (
    "id" TEXT NOT NULL,
    "systemType" TEXT NOT NULL,
    "capacityKw" DECIMAL(8,2) NOT NULL,
    "costZar" DECIMAL(14,2) NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationCostAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfiguration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemType" TEXT NOT NULL,
    "capacityKw" DECIMAL(8,2) NOT NULL,
    "batteryKwh" DECIMAL(8,2) NOT NULL,
    "assumptions" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplianceProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "watts" INTEGER NOT NULL,
    "source" TEXT,

    CONSTRAINT "ApplianceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionsFactor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kgPerKwh" DECIMAL(8,5) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmissionsFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducationalContent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceLinks" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducationalContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FAQ" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sourceLinks" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FAQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Administrator_email_key" ON "Administrator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Province_name_key" ON "Province"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Province_code_key" ON "Province"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_name_provinceId_key" ON "Municipality"("name", "provinceId");

-- CreateIndex
CREATE INDEX "ElectricityTariff_municipalityId_effectiveFrom_idx" ON "ElectricityTariff"("municipalityId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "WeatherObservation_latitude_longitude_observedAt_idx" ON "WeatherObservation"("latitude", "longitude", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfiguration_name_key" ON "SystemConfiguration"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EducationalContent_slug_key" ON "EducationalContent"("slug");

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityTariff" ADD CONSTRAINT "ElectricityTariff_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
