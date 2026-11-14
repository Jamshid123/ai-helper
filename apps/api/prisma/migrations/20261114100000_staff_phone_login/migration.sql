-- Вход сотрудников по телефону (решение заказчика 14.11.2026), имя и фамилия вместо одного поля.
-- Существующие учётки сохраняют email как устаревший логин; телефон им задаётся отдельной командой на сервере
-- (номер — персональные данные, в миграции его нет).

ALTER TABLE "Staff" ADD COLUMN "phone" TEXT;
ALTER TABLE "Staff" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Staff" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
UPDATE "Staff" SET "firstName" = "name";
ALTER TABLE "Staff" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "Staff" DROP COLUMN "name";
ALTER TABLE "Staff" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "Staff_phone_key" ON "Staff"("phone");
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^\+998[0-9]{9}$');
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_has_login" CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);
