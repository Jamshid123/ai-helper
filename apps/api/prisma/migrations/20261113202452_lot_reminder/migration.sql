-- CreateTable
CREATE TABLE "LotReminder" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "remindAt" TIMESTAMPTZ NOT NULL,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotReminder_sentAt_remindAt_idx" ON "LotReminder"("sentAt", "remindAt");

-- CreateIndex
CREATE UNIQUE INDEX "LotReminder_lotId_userId_key" ON "LotReminder"("lotId", "userId");

-- AddForeignKey
ALTER TABLE "LotReminder" ADD CONSTRAINT "LotReminder_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotReminder" ADD CONSTRAINT "LotReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LotReminder" ADD CONSTRAINT "LotReminder_minutes_valid" CHECK ("minutesBefore" IN (15, 60, 1440));
