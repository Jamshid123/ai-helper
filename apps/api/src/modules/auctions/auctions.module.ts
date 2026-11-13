import { Module } from '@nestjs/common'
import { RemindersModule } from '../reminders/reminders.module'
import { APP_FILTER } from '@nestjs/core'
import { AutoBidController } from './autobid.controller'
import { BidRejectedFilter } from './bid-rejected.filter'
import { BidsController } from './bids.controller'
import { BidsService } from './bids.service'
import { LifecycleScheduler } from './lifecycle.scheduler'
import { LotLifecycleService } from './lot-lifecycle.service'

@Module({
  imports: [RemindersModule],
  controllers: [BidsController, AutoBidController],
  providers: [
    BidsService,
    LotLifecycleService,
    LifecycleScheduler,
    { provide: APP_FILTER, useClass: BidRejectedFilter },
  ],
  exports: [BidsService, LotLifecycleService],
})
export class AuctionsModule {}
