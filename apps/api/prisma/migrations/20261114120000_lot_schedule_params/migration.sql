-- Параметры торгов (решение заказчика 14.11.2026): торги в любой день, длительность задаётся,
-- минимум и максимум участников, ожидание следующего предложения (досрочное завершение).
ALTER TABLE "Lot" ADD COLUMN "maxParticipants" INTEGER;
ALTER TABLE "Lot" ADD COLUMN "minParticipants" INTEGER;
ALTER TABLE "Lot" ADD COLUMN "bidTimeoutSec" INTEGER;
ALTER TABLE "Lot" ADD COLUMN "lastBidAt" TIMESTAMPTZ;
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_participants_range" CHECK (
  ("maxParticipants" IS NULL OR "maxParticipants" >= 1)
  AND ("minParticipants" IS NULL OR "minParticipants" >= 1)
  AND ("maxParticipants" IS NULL OR "minParticipants" IS NULL OR "minParticipants" <= "maxParticipants")
);
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_bid_timeout_range" CHECK ("bidTimeoutSec" IS NULL OR "bidTimeoutSec" BETWEEN 30 AND 86400);
-- У идущих лотов время последнего предложения — из истории.
UPDATE "Lot" l SET "lastBidAt" = b.last FROM (SELECT "lotId", max("createdAt") AS last FROM "Bid" GROUP BY "lotId") b WHERE b."lotId" = l.id;
