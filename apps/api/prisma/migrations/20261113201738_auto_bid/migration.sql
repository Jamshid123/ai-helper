-- CreateTable
CREATE TABLE "AutoBid" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "maxAmount" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AutoBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoBid_lotId_active_maxAmount_idx" ON "AutoBid"("lotId", "active", "maxAmount" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AutoBid_lotId_userId_key" ON "AutoBid"("lotId", "userId");

-- AddForeignKey
ALTER TABLE "AutoBid" ADD CONSTRAINT "AutoBid_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoBid" ADD CONSTRAINT "AutoBid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutoBid" ADD CONSTRAINT "AutoBid_max_positive" CHECK ("maxAmount" > 0);
