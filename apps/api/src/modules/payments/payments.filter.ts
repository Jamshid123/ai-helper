import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { AdmissionError } from './admissions.service'
import { PaymentsDisabledError } from './payment-provider'

const MAP: Record<string, { status: number; message: string }> = {
  LOT_NOT_FOUND: { status: 404, message: 'Лот не найден' },
  LOT_CLOSED: { status: 409, message: 'Торги по лоту завершены' },
  RULES_NOT_ACCEPTED: { status: 400, message: 'Примите правила торгов' },
  PAYMENTS_DISABLED: { status: 503, message: 'Оплата скоро будет доступна' },
}

@Catch(AdmissionError, PaymentsDisabledError)
export class PaymentsFilter implements ExceptionFilter {
  catch(e: AdmissionError | PaymentsDisabledError, host: ArgumentsHost) {
    const code = e instanceof AdmissionError ? e.code : 'PAYMENTS_DISABLED'
    const { status, message } = MAP[code]
    host.switchToHttp().getResponse<FastifyReply>().status(status).send({ code, message })
  }
}
