-- Сайт вместо Telegram: вход по телефону и SMS-коду (решение заказчика 15.11.2026)
ALTER TABLE "User" ALTER COLUMN "telegramId" DROP NOT NULL;

CREATE TABLE "BuyerSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "ip" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuyerSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuyerSession_tokenHash_key" ON "BuyerSession"("tokenHash");
CREATE INDEX "BuyerSession_userId_idx" ON "BuyerSession"("userId");
ALTER TABLE "BuyerSession" ADD CONSTRAINT "BuyerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "ip" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "consumedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtpChallenge_phone_createdAt_idx" ON "OtpChallenge"("phone", "createdAt");
CREATE INDEX "OtpChallenge_ip_createdAt_idx" ON "OtpChallenge"("ip", "createdAt");
