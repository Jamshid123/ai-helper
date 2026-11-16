import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import type { AuthedRequest } from '../auth/buyer-auth.guard'
import { NotificationsService } from './notifications.service'

/** Покупатель: непрочитанные уведомления (баннер на сайте) и «прочитано». */
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  mine(@Req() req: AuthedRequest) {
    return this.notifications.mine(req.userId)
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: AuthedRequest) {
    return this.notifications.markRead(req.userId, id)
  }
}
