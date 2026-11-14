-- Категории каталога (решение заказчика 14.11.2026) и товары площадки.
-- Перенос данных: существующие лоты (категория PHONES) → категория «Телефоны».

CREATE TYPE "ProductStatus" AS ENUM ('AVAILABLE', 'IN_LOT', 'SOLD', 'ARCHIVED');

CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameUz" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Category_slug_format" CHECK ("slug" ~ '^[a-z][a-z0-9-]{1,39}$'),
    CONSTRAINT "Category_names_present" CHECK (length(trim("nameRu")) > 0 AND length(trim("nameUz")) > 0)
);
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- Стартовые категории (ТЗ «Главный экран»): «Телефоны» включена, «Путешествия» — заготовка, выключена.
INSERT INTO "Category" ("id", "slug", "nameRu", "nameUz", "enabled", "sortOrder", "updatedAt") VALUES
    (gen_random_uuid(), 'phones', 'Телефоны', 'Telefonlar', true, 10, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'travel', 'Путешествия', 'Sayohatlar', false, 20, CURRENT_TIMESTAMP);

CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "condition" "LotCondition" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "inspection" JSONB NOT NULL DEFAULT '{}',
    "imeiEnc" TEXT,
    "imeiLast4" TEXT,
    "inventoryNo" TEXT,
    "costPrice" BIGINT,
    "status" "ProductStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Product_cost_positive" CHECK ("costPrice" IS NULL OR "costPrice" > 0)
);
CREATE UNIQUE INDEX "Product_inventoryNo_key" ON "Product"("inventoryNo");
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Лот → категория (с переносом) и товар.
ALTER TABLE "Lot" ADD COLUMN "categoryId" UUID, ADD COLUMN "productId" UUID;
UPDATE "Lot" SET "categoryId" = (SELECT "id" FROM "Category" WHERE "slug" = 'phones');
ALTER TABLE "Lot" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Lot" DROP COLUMN "category";
DROP TYPE "LotCategory";
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Lot_categoryId_idx" ON "Lot"("categoryId");
