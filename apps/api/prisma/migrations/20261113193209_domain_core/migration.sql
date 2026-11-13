-- CreateEnum
CREATE TYPE "LotCategory" AS ENUM ('PHONES');

-- CreateEnum
CREATE TYPE "LotCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('PLATFORM', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'CLOSED_SOLD', 'CLOSED_UNSOLD', 'UNDER_REVIEW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderPurpose" AS ENUM ('ADMISSION', 'LISTING', 'PREPAYMENT', 'REMAINDER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('AWAITING_PREPAYMENT', 'AWAITING_REMAINDER', 'AWAITING_PICKUP', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "username" TEXT,
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMPTZ,
    "publicName" TEXT NOT NULL,
    "rulesVersion" TEXT,
    "rulesAcceptedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restriction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "obligationId" UUID,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "liftedAt" TIMESTAMPTZ,
    "liftedBy" TEXT,
    "liftReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Restriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" "LotCategory" NOT NULL DEFAULT 'PHONES',
    "condition" "LotCondition" NOT NULL,
    "sellerType" "SellerType" NOT NULL DEFAULT 'PLATFORM',
    "description" TEXT NOT NULL DEFAULT '',
    "inspection" JSONB NOT NULL DEFAULT '{}',
    "startPrice" BIGINT NOT NULL,
    "step" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "currentPrice" BIGINT,
    "leaderUserId" UUID,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "admittedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "LotStatus" NOT NULL DEFAULT 'DRAFT',
    "opensAt" TIMESTAMPTZ NOT NULL,
    "closesAt" TIMESTAMPTZ NOT NULL,
    "closedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "seq" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "purpose" "OrderPurpose" NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerTxId" TEXT,
    "paidAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bidId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "prepaymentAmount" BIGINT NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'AWAITING_PREPAYMENT',
    "prepaymentDeadline" TIMESTAMPTZ NOT NULL,
    "remainderDeadline" TIMESTAMPTZ,
    "pickupCodeHash" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "Restriction_userId_endsAt_idx" ON "Restriction"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "Lot_status_opensAt_idx" ON "Lot"("status", "opensAt");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_orderId_key" ON "Admission"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_lotId_userId_key" ON "Admission"("lotId", "userId");

-- CreateIndex
CREATE INDEX "Bid_lotId_amount_idx" ON "Bid"("lotId", "amount" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Bid_lotId_seq_key" ON "Bid"("lotId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_userId_idempotencyKey_key" ON "Bid"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_providerTxId_key" ON "Order"("providerTxId");

-- CreateIndex
CREATE INDEX "Order_userId_lotId_purpose_idx" ON "Order"("userId", "lotId", "purpose");

-- CreateIndex
CREATE INDEX "Obligation_status_prepaymentDeadline_idx" ON "Obligation"("status", "prepaymentDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_lotId_rank_key" ON "Obligation"("lotId", "rank");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_id_idx" ON "OutboxEvent"("publishedAt", "id");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Restriction" ADD CONSTRAINT "Restriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Ограничения, которые Prisma не описывает: последняя линия защиты на уровне БД ──
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_money_positive" CHECK ("startPrice" > 0 AND "step" > 0 AND "fee" >= 0);
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_window_valid" CHECK ("closesAt" > "opensAt");
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_current_ge_start" CHECK ("currentPrice" IS NULL OR "currentPrice" >= "startPrice");
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_amount_positive" CHECK ("amount" > 0 AND "seq" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_amounts_valid" CHECK ("amount" > 0 AND "prepaymentAmount" > 0 AND "prepaymentAmount" <= "amount" AND "rank" > 0);
ALTER TABLE "Restriction" ADD CONSTRAINT "Restriction_window_valid" CHECK ("endsAt" > "startsAt");
