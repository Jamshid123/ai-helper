-- Выкуп по модели 10% / 24 ч и повторные торги (решения 14.11 и 16.11.2026)
CREATE TYPE "PrepaymentDecision" AS ENUM ('PENDING', 'REFUNDED', 'RETAINED');

ALTER TABLE "Admission" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "Admission" ADD COLUMN "carriedFromLotId" UUID;

ALTER TABLE "Lot" ADD COLUMN "relistOfId" UUID;
CREATE UNIQUE INDEX "Lot_relistOfId_key" ON "Lot"("relistOfId");
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_relistOfId_fkey" FOREIGN KEY ("relistOfId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Obligation" ADD COLUMN "expiredReason" TEXT,
ADD COLUMN "prepaymentDecision" "PrepaymentDecision",
ADD COLUMN "decisionReason" TEXT,
ADD COLUMN "decidedBy" TEXT,
ADD COLUMN "completedAt" TIMESTAMPTZ,
ADD COLUMN "issuedBy" TEXT;
