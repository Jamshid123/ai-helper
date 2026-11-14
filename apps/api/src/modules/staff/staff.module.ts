import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AuditService } from './audit.service'
import { StaffAuthController } from './staff-auth.controller'
import { StaffAuthGuard } from './staff-auth.guard'
import { StaffAuthService } from './staff-auth.service'

@Global()
@Module({
  controllers: [StaffAuthController],
  providers: [StaffAuthService, AuditService, { provide: APP_GUARD, useClass: StaffAuthGuard }],
  exports: [StaffAuthService, AuditService],
})
export class StaffModule {}
