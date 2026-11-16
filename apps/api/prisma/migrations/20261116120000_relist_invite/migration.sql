-- Приглашение на повторные торги и защиты (решение 16.11.2026)
ALTER TABLE "Admission" ADD COLUMN "confirmedAt" TIMESTAMPTZ;
ALTER TABLE "Lot" ADD COLUMN "relistCheckedAt" TIMESTAMPTZ;

CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "lotId" UUID NOT NULL,
    "readAt" TIMESTAMPTZ,
    "smsSentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_userId_type_lotId_key" ON "Notification"("userId", "type", "lotId");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_smsSentAt_createdAt_idx" ON "Notification"("smsSentAt", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
