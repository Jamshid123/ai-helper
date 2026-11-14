import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import type { Category, Prisma, Product } from '@prisma/client'
import { z } from 'zod'
import { seal } from '../../common/crypto-box'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../staff/audit.service'
import { StaffOnly } from '../staff/staff.decorator'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { conflict, inspectionSchema, isUniqueViolation, money, parse } from './admin.schemas'

const createSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  condition: z.enum(['NEW', 'USED']),
  description: z.string().trim().max(3000).default(''),
  inspection: inspectionSchema.optional(),
  /** Полный IMEI / серийный номер — хранится зашифрованным. */
  imei: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{6,32}$/)
    .optional(),
  inventoryNo: z.string().trim().min(1).max(40).optional(),
  costPrice: money.optional(),
})
const patchSchema = createSchema.partial().strict()
const STATUSES = ['AVAILABLE', 'IN_LOT', 'SOLD', 'ARCHIVED'] as const

const dto = (p: Product & { category: Pick<Category, 'slug' | 'nameRu'> }) => ({
  id: p.id,
  categoryId: p.categoryId,
  category: { slug: p.category.slug, name: p.category.nameRu },
  title: p.title,
  condition: p.condition,
  description: p.description,
  inspection: p.inspection,
  imeiLast4: p.imeiLast4,
  inventoryNo: p.inventoryNo,
  costPrice: p.costPrice?.toString() ?? null,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
})
const include = { category: { select: { slug: true, nameRu: true } } } as const

/** Товары площадки: карточка и акт проверки. Полный IMEI наружу не отдаётся (ТЗ: ограниченный доступ). */
@StaffOnly('OPERATOR', 'EXPERT')
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list(@Query('status') status?: string) {
    const where: Prisma.ProductWhereInput = STATUSES.includes(status as (typeof STATUSES)[number])
      ? { status: status as (typeof STATUSES)[number] }
      : {}
    return (await this.prisma.product.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 500 })).map(dto)
  }

  @Get(':id')
  async one(@Param('id', new ParseUUIDPipe()) id: string) {
    const p = await this.prisma.product.findUnique({ where: { id }, include })
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Товар не найден' })
    return dto(p)
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: StaffRequest) {
    const d = parse(createSchema, body)
    const p = await this.save(() =>
      this.prisma.product.create({
        data: {
          categoryId: d.categoryId,
          title: d.title,
          condition: d.condition,
          description: d.description,
          inspection: d.inspection ?? inspectionSchema.parse({}),
          inventoryNo: d.inventoryNo ?? null,
          costPrice: d.costPrice ? BigInt(d.costPrice) : null,
          ...this.imei(d.imei),
        },
        include,
      })
    )
    await this.log(req, 'product.created', p.id, { title: d.title })
    return dto(p)
  }

  @Patch(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const d = parse(patchSchema, body)
    if (!(await this.prisma.product.findUnique({ where: { id } }))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Товар не найден' })
    }
    const p = await this.save(() =>
      this.prisma.product.update({
        where: { id },
        data: {
          ...(d.categoryId && { categoryId: d.categoryId }),
          ...(d.title && { title: d.title }),
          ...(d.condition && { condition: d.condition }),
          ...(d.description !== undefined && { description: d.description }),
          ...(d.inspection && { inspection: d.inspection }),
          ...(d.inventoryNo !== undefined && { inventoryNo: d.inventoryNo }),
          ...(d.costPrice && { costPrice: BigInt(d.costPrice) }),
          ...(d.imei && this.imei(d.imei)),
        },
        include,
      })
    )
    // в журнал — какие поля менялись, без значения IMEI
    await this.log(req, 'product.updated', id, { fields: Object.keys(d) })
    return dto(p)
  }

  private imei(imei: string | undefined) {
    return imei ? { imeiEnc: seal(imei, this.env.DATA_ENCRYPTION_KEY), imeiLast4: imei.slice(-4) } : {}
  }

  private async save<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op()
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('INVENTORY_TAKEN', 'Такой инвентарный номер уже есть')
      if ((e as { code?: string }).code === 'P2003') throw conflict('CATEGORY_NOT_FOUND', 'Категория не найдена')
      throw e
    }
  }

  private log(req: StaffRequest, action: string, id: string, meta: Prisma.InputJsonValue) {
    return this.audit.log({
      actorType: 'staff',
      actorId: req.staff.id,
      action,
      entityType: 'product',
      entityId: id,
      meta,
      ip: req.ip,
    })
  }
}
