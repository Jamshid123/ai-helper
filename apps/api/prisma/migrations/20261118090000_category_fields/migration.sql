-- Поля карточки у категории и встроенный блок устройства (решение 18.11.2026: шаблоны товаров, вариант A)
ALTER TABLE "Category" ADD COLUMN "fields" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Category" ADD COLUMN "deviceAct" BOOLEAN NOT NULL DEFAULT false;
-- Электроника с актом эксперта (IMEI/серийный, батарея, «Проверено экспертом»); «Путешествия» и новые — без блока
UPDATE "Category" SET "deviceAct" = true WHERE slug IN ('phones', 'laptops', 'tablets', 'watches', 'audio');

-- Значения полей у товара и снимок полей в лоте (не меняется при правке шаблона)
ALTER TABLE "Product" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Lot" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '[]';
