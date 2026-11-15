import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { BuyerAuthGuard } from './buyer-auth.guard'
import { BuyerSessionService } from './buyer-session.service'
import { OtpService } from './otp.service'
import { SessionService } from './session.service'

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    BuyerSessionService,
    OtpService,
    { provide: APP_GUARD, useClass: BuyerAuthGuard },
  ],
  exports: [SessionService, BuyerSessionService],
})
export class AuthModule {}
