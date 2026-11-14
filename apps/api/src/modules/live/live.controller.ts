import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { Public } from '../../common/public.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { PUBLIC_STATUSES } from '../catalog/lot.dto'
import { LiveEventsService, MAX_STREAMS, type LiveEvent } from './live-events.service'

const HEARTBEAT_MS = 20_000

/**
 * Поток событий комнаты (Server-Sent Events). Публичный: в событиях только номер, сумма и время
 * предложения — то же, что видно в карточке лота. Проходит через nginx без настройки WebSocket
 * (`X-Accel-Buffering: no` отключает буферизацию), браузер сам переподключается.
 */
@Public()
@Controller('lots/:lotId/events')
export class LiveController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveEventsService
  ) {}

  @Get()
  async stream(
    @Param('lotId', new ParseUUIDPipe()) lotId: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const exists = await this.prisma.lot.count({ where: { id: lotId, status: { in: PUBLIC_STATUSES } } })
    if (!exists) throw new NotFoundException({ code: 'LOT_NOT_FOUND', message: 'Лот не найден' })
    if (this.live.openStreams >= MAX_STREAMS) {
      throw new ServiceUnavailableException({ code: 'BUSY', message: 'Попробуйте позже' })
    }

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    })
    raw.write('retry: 3000\n\n')
    const send = (e: LiveEvent) => raw.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`)
    const off = this.live.subscribe(lotId, send, () => raw.end())
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS)
    heartbeat.unref()
    req.raw.on('close', () => {
      clearInterval(heartbeat)
      off()
    })
  }
}
