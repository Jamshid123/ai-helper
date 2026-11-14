import { Module } from '@nestjs/common'
import { LiveController } from './live.controller'
import { LiveEventsService } from './live-events.service'

@Module({ controllers: [LiveController], providers: [LiveEventsService] })
export class LiveModule {}
