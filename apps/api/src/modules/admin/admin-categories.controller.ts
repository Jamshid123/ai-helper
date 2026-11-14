import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import type { Category } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../staff/audit.service'
import { StaffOnly } from '../staff/staff.decorator'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { conflict, isUniqueViolation, parse } from './admin.schemas'

const createSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'латиница в нижнем регистре, цифры и дефис'),
  nameRu: z.string().trim().min(1).max(60),
  nameUz: z.string().trim().min(1).max(60),
  enabled: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(100),
})
const patchSchema = createSchema.omit({ slug: true }).partial().strict()

const dto = (c: Category & { _count?: { lots: number; products: number } }) => ({
  id: c.id,
  slug: c.slug,
  nameRu: c.nameRu,
  nameUz: c.nameUz,
  enabled: c.enabled,
  sortOrder: c.sortOrder,
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
    try {
      const c = await this.prisma.category.create({ data })
      await this.audit.log({
        actorType: 'staff',
        actorId: req.staff.id,
        action: 'category.created',
        entityType: 'category',
        entityId: c.id,
        meta: data,
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
    const before = await this.prisma.category.findUnique({ where: { id } })
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Категория не найдена' })
    const c = await this.prisma.category.update({ where: { id }, data })
    await this.audit.log({
      actorType: 'staff',
      actorId: req.staff.id,
      action: 'category.updated',
      entityType: 'category',
      entityId: id,
      meta: { before: dto(before), after: data },
      ip: req.ip,
    })
    return dto(c)
  }
}
