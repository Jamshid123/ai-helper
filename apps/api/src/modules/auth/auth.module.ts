import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { BuyerAuthGuard } from './buyer-auth.guard'
import { SessionService } from './session.service'

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, { provide: APP_GUARD, useClass: BuyerAuthGuard }],
  exports: [SessionService],
})
export class AuthModule {}
