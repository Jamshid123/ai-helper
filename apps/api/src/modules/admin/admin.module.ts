import { Module } from '@nestjs/common'
import { PaymentsModule } from '../payments/payments.module'
import { AdminAuditController } from './admin-audit.controller'
import { AdminCategoriesController } from './admin-categories.controller'
import { AdminLotsController } from './admin-lots.controller'
import { AdminLotsService } from './admin-lots.service'
import { AdminParticipantsController } from './admin-participants.controller'
import { AdminProductsController } from './admin-products.controller'
import { AdminStaffController } from './admin-staff.controller'

/** API админки (все эндпоинты — @StaffOnly: cookie-сессия сотрудника, CSRF, роли). */
@Module({
  imports: [PaymentsModule],
  controllers: [
    AdminCategoriesController,
    AdminProductsController,
    AdminLotsController,
    AdminParticipantsController,
    AdminAuditController,
    AdminStaffController,
  ],
  providers: [AdminLotsService],
})
export class AdminModule {}
