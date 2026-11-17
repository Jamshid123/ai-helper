import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Clock } from '../../common/clock'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { AdmissionsService } from './admissions.service'
import { ClickProvider } from './click/click.provider'
import { ClickService } from './click/click.service'
import { FakePaymentProvider, PAYMENT_GATEWAY, PaymentGateway, type PaymentProvider } from './payment-provider'
import { PaymentCallbacksController } from './payment-callbacks.controller'
import { PaymentsController } from './payments.controller'
import { PaymentsFilter } from './payments.filter'
import { PaymentsService } from './payments.service'
import { PaymeProvider } from './payme/payme.provider'
import { PaymeService, type PaymeConfig } from './payme/payme.service'
import { RefundsService } from './refunds.service'

const siteUrl = (env: Env) => env.PUBLIC_SITE_URL ?? env.CORS_ORIGINS[0]

/** Click настроен полностью (все четыре переменные — проверяет loadEnv). */
const clickConfig = (env: Env) =>
  env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID && env.CLICK_MERCHANT_USER_ID && env.CLICK_SECRET_KEY
    ? {
        serviceId: env.CLICK_SERVICE_ID,
        merchantId: env.CLICK_MERCHANT_ID,
        merchantUserId: env.CLICK_MERCHANT_USER_ID,
        secretKey: env.CLICK_SECRET_KEY,
        siteUrl: siteUrl(env),
      }
    : null

const paymeConfig = (env: Env): PaymeConfig | null =>
  env.PAYME_MERCHANT_ID && env.PAYME_KEY
    ? { merchantId: env.PAYME_MERCHANT_ID, key: env.PAYME_KEY, checkIp: env.PAYME_IP_CHECK, testMode: env.PAYME_TEST_MODE }
    : null

@Module({
  controllers: [PaymentsController, PaymentCallbacksController],
  providers: [
    AdmissionsService,
    PaymentsService,
    RefundsService,
    ClickService,
    PaymeService,
    { provide: APP_FILTER, useClass: PaymentsFilter },
    // Ключи принимаются только в режиме live: в demo/fake запросы Click и Payme отклоняются.
    { provide: 'CLICK_CONFIG', inject: [ENV], useFactory: (env: Env) => (env.PAYMENTS_MODE === 'live' ? clickConfig(env) : null) },
    { provide: 'PAYME_CONFIG', inject: [ENV], useFactory: (env: Env) => (env.PAYMENTS_MODE === 'live' ? paymeConfig(env) : null) },
    {
      provide: PAYMENT_GATEWAY,
      inject: [ENV, PrismaService, Clock],
      useFactory: (env: Env, prisma: PrismaService, clock: Clock) => {
        if (env.PAYMENTS_MODE === 'fake') return new PaymentGateway([new FakePaymentProvider()])
        if (env.PAYMENTS_MODE !== 'live') return new PaymentGateway([])
        const list: PaymentProvider[] = []
        const click = clickConfig(env)
        if (click) list.push(new ClickProvider(click, prisma, (url, init) => fetch(url, init), () => clock.now().getTime()))
        const payme = paymeConfig(env)
        if (payme) list.push(new PaymeProvider({ merchantId: payme.merchantId, testMode: payme.testMode, siteUrl: siteUrl(env) }))
        return new PaymentGateway(list)
      },
    },
  ],
  exports: [PaymentsService, RefundsService, PAYMENT_GATEWAY],
})
export class PaymentsModule {}
