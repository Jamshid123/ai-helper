import { Module } from '@nestjs/common'
import { PaymentsModule } from '../payments/payments.module'
import { AdminBuyoutDecisionsController, AdminFulfillmentController } from './admin-fulfillment.controller'
import { BuyoutService } from './buyout.service'
import { ObligationsController } from './obligations.controller'

@Module({
  imports: [PaymentsModule],
  controllers: [ObligationsController, AdminFulfillmentController, AdminBuyoutDecisionsController],
  providers: [BuyoutService],
  exports: [BuyoutService],
})
export class FulfillmentModule {}
