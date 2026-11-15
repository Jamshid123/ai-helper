-- Метка устройства покупателя (решение 15.11.2026)
ALTER TABLE "BuyerSession" ADD COLUMN "deviceHash" TEXT;
CREATE INDEX "BuyerSession_deviceHash_createdAt_idx" ON "BuyerSession"("deviceHash", "createdAt");
