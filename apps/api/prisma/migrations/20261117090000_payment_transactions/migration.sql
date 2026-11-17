-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "state" INTEGER NOT NULL DEFAULT 1,
    "reason" INTEGER,
    "providerTime" TIMESTAMPTZ,
    "paymentRef" TEXT,
    "needsRefund" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedAt" TIMESTAMPTZ,
    "cancelledAt" TIMESTAMPTZ,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentTransaction_orderId_state_idx" ON "PaymentTransaction"("orderId", "state");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_providerTime_idx" ON "PaymentTransaction"("provider", "providerTime");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_provider_externalId_key" ON "PaymentTransaction"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Гарантии на уровне БД
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_state_check" CHECK ("state" IN (1, 2, -1, -2));
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_provider_check" CHECK ("provider" IN ('click', 'payme'));
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_amount_check" CHECK ("amount" > 0);
