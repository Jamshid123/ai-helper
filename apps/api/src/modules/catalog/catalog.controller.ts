import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common'
import { currentOrNextSession } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { Public } from '../../common/public.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { PUBLIC_STATUSES, toLotDto } from './lot.dto'

@Public()
@Controller()
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /** Каталог: идущие и запланированные лоты (гость видит расписание и стартовую цену — ТЗ). */
  @Get('lots')
  async list() {
    const lots = await this.prisma.lot.findMany({
      where: { status: { in: ['LIVE', 'SCHEDULED'] } },
      orderBy: [{ status: 'asc' }, { opensAt: 'asc' }],
      take: 200,
    })
    return lots.map(toLotDto)
  }

  @Get('lots/:id')
  async one(@Param('id', new ParseUUIDPipe()) id: string) {
    const lot = await this.prisma.lot.findFirst({ where: { id, status: { in: PUBLIC_STATUSES } } })
    if (!lot) throw new NotFoundException({ code: 'LOT_NOT_FOUND', message: 'Лот не найден' })
    return toLotDto(lot)
  }

  /** Серверное время и окно ближайшей пятничной сессии — клиент считает таймеры от serverTime. */
  @Get('schedule')
  schedule() {
    const now = this.clock.now()
    const s = currentOrNextSession(now)
    return {
      serverTime: now.toISOString(),
      timezone: 'Asia/Tashkent',
      session: { opensAt: s.opensAt.toISOString(), closesAt: s.closesAt.toISOString(), isLive: s.isLive },
    }
  }
}
