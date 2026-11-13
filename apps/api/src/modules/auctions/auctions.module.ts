import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { BidRejectedFilter } from './bid-rejected.filter'
import { BidsController } from './bids.controller'
import { BidsService } from './bids.service'
import { LifecycleScheduler } from './lifecycle.scheduler'
import { LotLifecycleService } from './lot-lifecycle.service'

@Module({
  controllers: [BidsController],
  providers: [
    BidsService,
    LotLifecycleService,
    LifecycleScheduler,
    { provide: APP_FILTER, useClass: BidRejectedFilter },
  ],
  exports: [BidsService, LotLifecycleService],
})
export class AuctionsModule {}
