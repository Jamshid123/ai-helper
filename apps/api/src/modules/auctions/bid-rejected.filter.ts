import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { BidRejectedError, type BidRejectCode } from './bid.errors'

const MESSAGES: Record<BidRejectCode, { status: number; message: string }> = {
  LOT_NOT_FOUND: { status: 404, message: 'Лот не найден' },
  LOT_NOT_LIVE: { status: 409, message: 'Торги по лоту не идут' },
  LOT_CLOSED: { status: 409, message: 'Торги по лоту завершены' },
  NO_ADMISSION: { status: 403, message: 'Нужен допуск к этому лоту' },
  RESTRICTED: { status: 403, message: 'Участие временно ограничено' },
  CONFLICT_OF_INTEREST: { status: 403, message: 'Нельзя предлагать цену на этот лот' },
  BID_TOO_LOW: { status: 409, message: 'Цена ниже минимальной — предложите больше' },
  ALREADY_LEADING: { status: 409, message: 'Ваша цена уже лучшая' },
}

/** Отказ → понятный код, текст и актуальная минимальная цена (клиент сразу обновляется). */
@Catch(BidRejectedError)
export class BidRejectedFilter implements ExceptionFilter {
  catch(e: BidRejectedError, host: ArgumentsHost) {
    const { status, message } = MESSAGES[e.code]
    host
      .switchToHttp()
      .getResponse<FastifyReply>()
      .status(status)
      .send({ code: e.code, message, minBid: e.minBid?.toString() ?? null })
  }
}
