import { Module } from '@nestjs/common'
import { PaymentsModule } from '../payments/payments.module'
import { AdminBuyoutDecisionsController, AdminFulfillmentController } from './admin-fulfillment.controller'
import { BuyoutService } from './buyout.service'
import { ObligationsController, RelistController } from './obligations.controller'
import { RelistService } from './relist.service'

@Module({
  imports: [PaymentsModule],
  controllers: [ObligationsController, RelistController, AdminFulfillmentController, AdminBuyoutDecisionsController],
  providers: [BuyoutService, RelistService],
  exports: [BuyoutService, RelistService],
})
export class FulfillmentModule {}
