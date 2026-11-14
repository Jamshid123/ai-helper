/*
  Warnings:

  - You are about to drop the column `lastTotpStep` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `totpEnrolledAt` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `totpSecretEnc` on the `Staff` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Staff" DROP COLUMN "lastTotpStep",
DROP COLUMN "totpEnrolledAt",
DROP COLUMN "totpSecretEnc";
