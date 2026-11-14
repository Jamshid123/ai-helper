-- Настраиваемые роли (решение заказчика 14.11.2026): владелец задаёт права по модулям — «просмотр» или «изменение».
-- Владелец (isOwner) видит и меняет всё, только он добавляет сотрудников и настраивает роли.

CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Role_name_present" CHECK (length(trim("name")) > 0)
);
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- Стартовые роли: «Администратор» — все модули на изменение (без сотрудников и ролей); «Оператор» — каталог и лоты.
INSERT INTO "Role" ("id", "name", "permissions", "updatedAt") VALUES
    (gen_random_uuid(), 'Администратор', '{"schedule":"edit","categories":"edit","products":"edit","lots":"edit","sellers":"edit","inspection":"edit","risk":"edit","participants":"edit","finance":"edit","fulfillment":"edit","audit":"view"}', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Оператор', '{"categories":"edit","products":"edit","lots":"edit","participants":"view"}', CURRENT_TIMESTAMP);

ALTER TABLE "Staff" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Staff" ADD COLUMN "roleId" UUID;
-- Прежние ADMIN становятся владельцами, остальные — операторами.
UPDATE "Staff" SET "isOwner" = true WHERE 'ADMIN' = ANY("roles");
UPDATE "Staff" SET "roleId" = (SELECT "id" FROM "Role" WHERE "name" = 'Оператор') WHERE NOT "isOwner";
ALTER TABLE "Staff" DROP COLUMN "roles";
DROP TYPE "StaffRole";
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_owner_or_role" CHECK ("isOwner" OR "roleId" IS NOT NULL);
