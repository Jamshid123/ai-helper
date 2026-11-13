-- Отдельная миграция: новое значение enum нельзя использовать в той же транзакции, где оно добавлено.
ALTER TYPE "ObligationStatus" ADD VALUE IF NOT EXISTS 'AWAITING_CONFIRMATION' BEFORE 'AWAITING_PREPAYMENT';
