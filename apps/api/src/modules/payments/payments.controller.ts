import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { LIMITS, RateLimit } from '../../common/rate-limit'

const startSchema = z.object({
  acceptRules: z.literal(true),
  /** Click / Payme — что выбрал покупатель (решение 17.11.2026); без выбора — первая доступная система. */
  provider: z.string().max(20).optional(),
  locale: z.enum(['ru', 'uz']).optional(),
})

@Controller()
export class PaymentsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly admissions: AdmissionsService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /** Получить допуск к лоту: принять правила → допуск сразу, бесплатно (решение 18.11.2026). */
  @RateLimit(LIMITS.admission)
  @Post('lots/:lotId/admission')
  @HttpCode(200)
  start(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const parsed = startSchema.safeParse(body)
    if (!parsed.success)
      throw new BadRequestException({ code: 'RULES_NOT_ACCEPTED', message: 'Примите правила торгов' })
    // допуск бесплатный (решение 18.11.2026): provider/locale старых клиентов игнорируются
    return this.admissions.start(req.userId, lotId, true, req.deviceHash ?? null)
  }

  /** Выйти из лота до начала торгов: место освобождается (старым оплаченным допускам — возврат 100%). */
  @RateLimit(LIMITS.admission)
  @Delete('lots/:lotId/admission')
  @HttpCode(200)
  leave(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Req() req: AuthedRequest) {
    return this.admissions.leave(req.userId, lotId)
  }

  /**
   * Мои допуски — подтягиваются на любом устройстве (ТЗ «Доступ к просмотру»).
   * Число участников лота видно только допущенным (решение 14.11.2026).
   */
  @Get('me/admissions')
  mine(@Req() req: AuthedRequest) {
    return this.admissions.mine(req.userId)
  }

  /** Имитация успешной оплаты — ТОЛЬКО при PAYMENTS_MODE=fake (демо/тесты). Идёт через тот же путь подтверждения. */
  @RateLimit(LIMITS.payment)
  @Post('payments/fake/:orderId/complete')
  @HttpCode(200)
  async fakeComplete(@Param('orderId', new ParseUUIDPipe()) orderId: string, @Req() req: AuthedRequest) {
    if (this.env.PAYMENTS_MODE !== 'fake') throw new NotFoundException()
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException()
    if (order.userId !== req.userId) throw new ForbiddenException()
    const outcome = await this.payments.confirmPayment({
      orderId,
      providerTxId: `fake-${orderId}`,
      amount: order.amount,
      paidAt: this.clock.now(),
    })
    return { outcome }
  }
}
