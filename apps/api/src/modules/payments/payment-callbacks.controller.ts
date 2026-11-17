import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { Public } from '../../common/public.decorator'
import { ClickService } from './click/click.service'
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-provider'
import { PaymeService } from './payme/payme.service'

/**
 * Запросы платёжных систем к нам (решение 17.11.2026). Публичные: сессии покупателя нет, доверие —
 * только по подписи Click (MD5 с секретом) и ключу + адресу Payme. Ограничение частоты не ставим:
 * повторы — штатное поведение Click и Payme.
 */
@Controller('payments')
export class PaymentCallbacksController {
  constructor(
    private readonly click: ClickService,
    private readonly payme: PaymeService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway
  ) {}

  /** Какие способы оплаты сейчас доступны покупателю (кнопки на сайте). */
  @Public()
  @Get('providers')
  providers() {
    return { providers: this.gateway.available() }
  }

  /** Click SHOP API: Prepare (action=0) и Complete (action=1) — один адрес или два, Click различает по action. */
  @Public()
  @Post(['click', 'click/prepare', 'click/complete'])
  @HttpCode(200)
  clickCallback(@Body() body: unknown) {
    return this.click.handle(body)
  }

  /** Payme Merchant API (JSON-RPC). */
  @Public()
  @Post('payme')
  @HttpCode(200)
  paymeCallback(@Body() body: unknown, @Headers('authorization') auth: string | undefined, @Req() req: FastifyRequest) {
    return this.payme.handle(body, auth, req.ip)
  }
}
