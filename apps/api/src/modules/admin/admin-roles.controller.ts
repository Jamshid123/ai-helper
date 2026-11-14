import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import type { Role } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../staff/audit.service'
import { MODULES, sanitizePermissions } from '../staff/permissions'
import { StaffOnly } from '../staff/staff.decorator'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { conflict, isUniqueViolation, parse } from './admin.schemas'

const level = z.enum(['none', 'view', 'edit'])
/** permissions: { модуль: none | view | edit } — none и отсутствующие модули = нет доступа. */
const permissionsSchema = z.partialRecord(z.enum(MODULES), level)
const createSchema = z.object({ name: z.string().trim().min(2).max(40), permissions: permissionsSchema.optional() })
const patchSchema = createSchema.partial().strict()

const dto = (r: Role & { _count?: { staff: number } }) => ({
  id: r.id,
  name: r.name,
  permissions: sanitizePermissions(r.permissions),
  staff: r._count?.staff ?? 0,
})

/** Роли (только владелец): права по каждому модулю — «нет», «просмотр», «изменение». Изменения действуют сразу. */
@StaffOnly('owner')
@Controller('admin/roles')
export class AdminRolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { staff: true } } },
    })
    return { modules: MODULES, roles: roles.map(dto) }
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: StaffRequest) {
    const d = parse(createSchema, body)
    try {
      const r = await this.prisma.role.create({
        data: { name: d.name, permissions: sanitizePermissions(d.permissions ?? {}) },
      })
      await this.log(req, 'role.created', r.id, { name: d.name })
      return dto(r)
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('ROLE_NAME_TAKEN', 'Роль с таким названием уже есть')
      throw e
    }
  }

  @Patch(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const d = parse(patchSchema, body)
    const before = await this.prisma.role.findUnique({ where: { id } })
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Роль не найдена' })
    try {
      const r = await this.prisma.role.update({
        where: { id },
        data: {
          ...(d.name && { name: d.name }),
          ...(d.permissions && { permissions: sanitizePermissions(d.permissions) }),
        },
        include: { _count: { select: { staff: true } } },
      })
      await this.log(req, 'role.updated', id, { before: dto(before).permissions, after: dto(r).permissions })
      return dto(r)
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('ROLE_NAME_TAKEN', 'Роль с таким названием уже есть')
      throw e
    }
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: StaffRequest) {
    const r = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { staff: true } } } })
    if (!r) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Роль не найдена' })
    if (r._count.staff > 0)
      throw conflict('ROLE_IN_USE', 'У роли есть сотрудники — сначала переведите их на другую роль')
    await this.prisma.role.delete({ where: { id } })
    await this.log(req, 'role.deleted', id, { name: r.name })
  }

  private log(req: StaffRequest, action: string, id: string, meta: object) {
    return this.audit.log({
      actorType: 'staff',
      actorId: req.staff.id,
      action,
      entityType: 'role',
      entityId: id,
      meta,
      ip: req.ip,
    })
  }
}
