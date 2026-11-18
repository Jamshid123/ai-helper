import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { Category, Prisma } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../staff/audit.service'
import { StaffOnly } from '../staff/staff.decorator'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { type CategoryField, FIELD_LIMITS, fieldsProblems } from '@auksion/shared'
import { conflict, isUniqueViolation, parse } from './admin.schemas'

/** Поля категории — только простые типы, без HTML; ошибки — по-русски, с номером поля. */
function checkFields(fields: unknown[] | undefined) {
  if (fields === undefined) return
  const problems = fieldsProblems(fields)
  if (problems.length) throw new UnprocessableEntityException({ code: 'BAD_FIELDS', message: problems.join('; ') })
}

// Значения по умолчанию — только при создании: в zod 4 `.partial()` подставляет default, и PATCH без поля
// сбрасывал бы его (баг 18.11.2026: переименование выключало категорию)
const editable = {
  nameRu: z.string().trim().min(1).max(60),
  nameUz: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  /** Поля карточки товара (решение 18.11.2026); проверка — fieldsProblems из @auksion/shared. */
  fields: z.array(z.unknown()).max(FIELD_LIMITS.MAX_FIELDS),
  /** Встроенный блок устройства: IMEI (зашифрован), батарея, «Проверено экспертом». */
  deviceAct: z.boolean(),
}
const createSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'латиница в нижнем регистре, цифры и дефис'),
  ...editable,
  enabled: editable.enabled.default(false),
  sortOrder: editable.sortOrder.default(100),
  fields: editable.fields.default([]),
  deviceAct: editable.deviceAct.default(false),
})
const patchSchema = z.object(editable).partial().strict()

const dto = (c: Category & { _count?: { lots: number; products: number } }) => ({
  id: c.id,
  slug: c.slug,
  nameRu: c.nameRu,
  nameUz: c.nameUz,
  enabled: c.enabled,
  sortOrder: c.sortOrder,
  fields: (c.fields ?? []) as CategoryField[],
  deviceAct: c.deviceAct,
  lots: c._count?.lots ?? 0,
  products: c._count?.products ?? 0,
})

/** Категории каталога: добавить, переименовать (ru/uz), включить/выключить, порядок. Удаления нет — выключение. */
@StaffOnly('categories')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list() {
    const list = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      include: { _count: { select: { lots: true, products: true } } },
    })
    return list.map(dto)
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: StaffRequest) {
    const data = parse(createSchema, body)
    checkFields(data.fields)
    try {
      const c = await this.prisma.category.create({ data: { ...data, fields: data.fields as Prisma.InputJsonValue } })
      await this.audit.log({
        actorType: 'staff',
        actorId: req.staff.id,
        action: 'category.created',
        entityType: 'category',
        entityId: c.id,
        meta: data as Prisma.InputJsonObject,
        ip: req.ip,
      })
      return dto(c)
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('SLUG_TAKEN', 'Категория с таким кодом уже есть')
      throw e
    }
  }

  @Patch(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const data = parse(patchSchema, body)
    checkFields(data.fields)
    const { fields, ...rest } = data
    const before = await this.prisma.category.findUnique({ where: { id } })
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Категория не найдена' })
    // Правка полей касается новых товаров и лотов: выставленные лоты хранят снимок (решение 18.11.2026)
    const c = await this.prisma.category.update({
      where: { id },
      data: { ...rest, ...(fields && { fields: fields as Prisma.InputJsonValue }) },
    })
    await this.audit.log({
      actorType: 'staff',
      actorId: req.staff.id,
      action: 'category.updated',
      entityType: 'category',
      entityId: id,
      meta: { before: dto(before), after: data } as Prisma.InputJsonObject,
      ip: req.ip,
    })
    return dto(c)
  }
}
