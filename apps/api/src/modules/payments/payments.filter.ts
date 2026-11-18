import { RULES } from '@auksion/shared'
import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { AdmissionError } from './admission.errors'
import { PaymentsDisabledError, UnknownProviderError } from './payment-provider'

const MAP: Record<string, { status: number; message: string }> = {
  LOT_NOT_FOUND: { status: 404, message: 'Лот не найден' },
  LOT_CLOSED: { status: 409, message: 'Торги по лоту завершены' },
  RULES_NOT_ACCEPTED: { status: 400, message: 'Примите правила торгов' },
  PAYMENTS_DISABLED: { status: 503, message: 'Оплата скоро будет доступна' },
  UNKNOWN_PROVIDER: { status: 400, message: 'Этот способ оплаты недоступен' },
  RESTRICTED: { status: 403, message: 'Участие временно ограничено' },
  LOT_STARTED: { status: 409, message: 'Торги уже начались — выйти с возвратом нельзя' },
  NOT_ADMITTED: { status: 404, message: 'Допуска к этому лоту нет' },
  LOT_FULL: { status: 409, message: 'Мест в этих торгах больше нет' },
  ADMISSION_LIMIT: { status: 409, message: `Одновременно — не больше ${RULES.MAX_ACTIVE_ADMISSIONS} торгов` },
  PRODUCT_BLOCKED: { status: 403, message: 'Участие в торгах этого товара для вас недоступно' },
  DEVICE_SHARED: {
    status: 409,
    message: 'С этого устройства в этих торгах уже участвует другой аккаунт. Если это ошибка — напишите в поддержку',
  },
}

@Catch(AdmissionError, PaymentsDisabledError, UnknownProviderError)
export class PaymentsFilter implements ExceptionFilter {
  catch(e: AdmissionError | PaymentsDisabledError | UnknownProviderError, host: ArgumentsHost) {
    const code = e instanceof AdmissionError ? e.code : e.message
    const { status, message } = MAP[code]
    host.switchToHttp().getResponse<FastifyReply>().status(status).send({ code, message })
  }
}
