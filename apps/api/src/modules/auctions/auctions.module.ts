import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { BidRejectedFilter } from './bid-rejected.filter'
import { BidsController } from './bids.controller'
import { BidsService } from './bids.service'

@Module({
  controllers: [BidsController],
  providers: [BidsService, { provide: APP_FILTER, useClass: BidRejectedFilter }],
  exports: [BidsService],
})
export class AuctionsModule {}
