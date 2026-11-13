-- Подтверждение покупки (15 мин) до оплаты 30% (2 ч). Продажа заключается только после подтверждения.
ALTER TABLE "Obligation" ADD COLUMN "confirmDeadline" TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN "confirmedAt" TIMESTAMPTZ,
ALTER COLUMN "status" SET DEFAULT 'AWAITING_CONFIRMATION',
ALTER COLUMN "prepaymentDeadline" DROP NOT NULL;
ALTER TABLE "Obligation" ALTER COLUMN "confirmDeadline" DROP DEFAULT;

CREATE INDEX "Obligation_status_confirmDeadline_idx" ON "Obligation"("status", "confirmDeadline");
