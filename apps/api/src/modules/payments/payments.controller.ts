import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import { Clock } from '../../common/clock'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthedRequest } from '../auth/buyer-auth.guard'
import { AdmissionsService } from './admissions.service'
import { PaymentsService } from './payments.service'

const startSchema = z.object({ acceptRules: z.literal(true) })

@Controller()
export class PaymentsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly admissions: AdmissionsService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /** Оформить допуск к лоту: принять правила → заказ на взнос → оплата. */
  @Post('lots/:lotId/admission')
  @HttpCode(200)
  start(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const parsed = startSchema.safeParse(body)
    if (!parsed.success)
      throw new BadRequestException({ code: 'RULES_NOT_ACCEPTED', message: 'Примите правила торгов' })
    return this.admissions.start(req.userId, lotId, true)
  }

  /** Мои допуски — подтягиваются на любом устройстве (ТЗ «Доступ к просмотру»). */
  @Get('me/admissions')
  async mine(@Req() req: AuthedRequest) {
    const list = await this.prisma.admission.findMany({
      where: { userId: req.userId },
      select: { lotId: true, createdAt: true },
    })
    return list.map((a) => ({ lotId: a.lotId, admittedAt: a.createdAt.toISOString() }))
  }

  /** Имитация успешной оплаты — ТОЛЬКО при PAYMENTS_MODE=fake (демо/тесты). Идёт через тот же путь подтверждения. */
  @Post('payments/fake/:orderId/complete')
  @HttpCode(200)
  async fakeComplete(@Param('orderId', new ParseUUIDPipe()) orderId: string, @Req() req: AuthedRequest) {
    if (this.env.PAYMENTS_MODE !== 'fake') throw new NotFoundException()
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException()
    if (order.userId !== req.userId) throw new ForbiddenException()
    const outcome = await this.payments.confirmAdmissionPayment({
      orderId,
      providerTxId: `fake-${orderId}`,
      amount: order.amount,
      paidAt: this.clock.now(),
    })
    return { outcome }
  }
}
