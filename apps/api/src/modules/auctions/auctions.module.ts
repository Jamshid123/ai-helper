import { Module } from '@nestjs/common'
import { BidsService } from './bids.service'

@Module({ providers: [BidsService], exports: [BidsService] })
export class AuctionsModule {}
