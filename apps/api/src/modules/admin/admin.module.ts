import { Module } from '@nestjs/common'
import { PaymentsModule } from '../payments/payments.module'
import { AdminCategoriesController } from './admin-categories.controller'
import { AdminLotsController } from './admin-lots.controller'
import { AdminLotsService } from './admin-lots.service'
import { AdminProductsController } from './admin-products.controller'

/** API админки (все эндпоинты — @StaffOnly: cookie-сессия сотрудника, CSRF, роли). */
@Module({
  imports: [PaymentsModule],
  controllers: [AdminCategoriesController, AdminProductsController, AdminLotsController],
  providers: [AdminLotsService],
})
export class AdminModule {}
