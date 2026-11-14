import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { AdmissionsService } from './admissions.service'
import { DisabledPaymentProvider, FakePaymentProvider, PAYMENT_PROVIDER } from './payment-provider'
import { PaymentsController } from './payments.controller'
import { PaymentsFilter } from './payments.filter'
import { PaymentsService } from './payments.service'
import { RefundsService } from './refunds.service'

@Module({
  controllers: [PaymentsController],
  providers: [
    AdmissionsService,
    PaymentsService,
    RefundsService,
    { provide: APP_FILTER, useClass: PaymentsFilter },
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENV],
      // live-адаптер партнёра появится после выбора Click / Payme / Uzum.
      useFactory: (env: Env) =>
        env.PAYMENTS_MODE === 'fake' ? new FakePaymentProvider() : new DisabledPaymentProvider(),
    },
  ],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}
