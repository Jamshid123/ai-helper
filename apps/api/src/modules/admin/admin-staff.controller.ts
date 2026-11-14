import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import { z } from 'zod'
import { StaffOnly } from '../staff/staff.decorator'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { StaffAuthService } from '../staff/staff-auth.service'
import { parse } from './admin.schemas'

const name = z.string().trim().min(1).max(60)
const createSchema = z.object({
  firstName: name,
  lastName: z.string().trim().max(60).default(''),
  phone: z.string().trim().min(1).max(30),
  password: z.string().min(1).max(200),
  roleId: z.string().uuid(),
})
const patchSchema = createSchema
  .omit({ password: true })
  .partial()
  .extend({ disabled: z.boolean().optional() })
  .strict()
const passwordSchema = z.object({ password: z.string().min(1).max(200) })

/** Сотрудники (только владелец): добавить с ролью, изменить, отключить, задать новый пароль. Пароль виден только при вводе. */
@StaffOnly('owner')
@Controller('admin/staff')
export class AdminStaffController {
  constructor(private readonly staff: StaffAuthService) {}

  @Get()
  list() {
    return this.staff.list()
  }

  @Post()
  create(@Body() body: unknown, @Req() req: StaffRequest) {
    return this.staff.createStaff(parse(createSchema, body), req.staff.id, req.ip ?? null)
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    return this.staff.update(id, parse(patchSchema, body), req.staff.id, req.ip ?? null)
  }

  @Post(':id/password')
  @HttpCode(204)
  async password(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    await this.staff.setPassword(id, parse(passwordSchema, body).password, req.staff.id, req.ip ?? null)
  }
}
