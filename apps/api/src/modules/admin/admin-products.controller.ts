import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import type { Category, Prisma, Product, ProductPhoto } from '@prisma/client'
import { z } from 'zod'
import { seal } from '../../common/crypto-box'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { MediaService, detectImage, photoUrl } from '../media/media.service'
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
/** Не больше 10 фото на товар. */
export const MAX_PHOTOS = 10
const orderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_PHOTOS) })

const dto = (p: Product & { category: Pick<Category, 'slug' | 'nameRu'>; photos: ProductPhoto[] }) => ({
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
  photos: p.photos.map((ph) => ({ id: ph.id, url: photoUrl(ph.file) })),
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
})
const include = {
  category: { select: { slug: true, nameRu: true } },
  photos: { orderBy: { position: 'asc' } },
} as const

/** Товары площадки: карточка и акт проверки. Полный IMEI наружу не отдаётся (ТЗ: ограниченный доступ). */
@StaffOnly('products')
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService
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

  // ───────────── фото (решение заказчика 14.11.2026: диск сервера, видны всем) ─────────────

  /** Тело запроса — сам файл (image/jpeg | image/png | image/webp), тип проверяется по байтам. */
  @Post(':id/photos')
  @HttpCode(201)
  async addPhoto(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const ext = Buffer.isBuffer(body) ? detectImage(body) : null
    if (!ext) throw new BadRequestException({ code: 'BAD_IMAGE', message: 'Нужна фотография JPEG, PNG или WebP' })
    const p = await this.editable(id)
    if (p._count.photos >= MAX_PHOTOS) throw conflict('PHOTO_LIMIT', `Не больше ${MAX_PHOTOS} фото на товар`)
    const file = await this.media.save(body as Buffer, ext)
    try {
      await this.prisma.productPhoto.create({ data: { productId: id, file, position: p._count.photos } })
    } catch (e) {
      await this.media.remove(file)
      throw e
    }
    await this.log(req, 'product.photo_added', id, { file })
    return this.fresh(id)
  }

  @Put(':id/photos/order')
  async orderPhotos(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const { ids } = parse(orderSchema, body)
    await this.editable(id)
    const own = await this.prisma.productPhoto.findMany({ where: { productId: id }, select: { id: true } })
    if (own.length !== ids.length || !own.every((o) => ids.includes(o.id))) {
      throw new BadRequestException({ code: 'BAD_ORDER', message: 'Передайте все фото товара в нужном порядке' })
    }
    await this.prisma.$transaction(
      ids.map((pid, position) => this.prisma.productPhoto.update({ where: { id: pid }, data: { position } }))
    )
    await this.log(req, 'product.photos_reordered', id, { ids })
    return this.fresh(id)
  }

  @Delete(':id/photos/:photoId')
  async removePhoto(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @Req() req: StaffRequest
  ) {
    await this.editable(id)
    const ph = await this.prisma.productPhoto.findFirst({ where: { id: photoId, productId: id } })
    if (!ph) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Фото не найдено' })
    await this.prisma.$transaction(async (tx) => {
      await tx.productPhoto.delete({ where: { id: photoId } })
      await tx.productPhoto.updateMany({
        where: { productId: id, position: { gt: ph.position } },
        data: { position: { decrement: 1 } },
      })
    })
    await this.media.remove(ph.file)
    await this.log(req, 'product.photo_removed', id, { file: ph.file })
    return this.fresh(id)
  }

  /** Фото меняются, пока товар не продан и не идут торги (описание после открытия торгов не меняется — ТЗ). */
  private async editable(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { photos: true } }, lots: { where: { status: 'LIVE' }, select: { id: true } } },
    })
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Товар не найден' })
    if (p.status === 'SOLD' || p.lots.length > 0) {
      throw conflict('PRODUCT_LOCKED', 'Фото нельзя менять: идут торги или товар продан')
    }
    return p
  }

  private async fresh(id: string) {
    return dto(await this.prisma.product.findUniqueOrThrow({ where: { id }, include }))
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
