-- AlterTable: add publicId column
ALTER TABLE "Merchant" ADD COLUMN "publicId" TEXT;

-- Backfill: deterministically populate publicId for existing merchants
UPDATE "Merchant" SET "publicId" = 'pub_' || "id" WHERE "publicId" IS NULL;

-- Enforce NOT NULL constraint on publicId
ALTER TABLE "Merchant" ALTER COLUMN "publicId" SET NOT NULL;

-- CreateIndex: enforce database-level uniqueness
CREATE UNIQUE INDEX "Merchant_publicId_key" ON "Merchant"("publicId");
