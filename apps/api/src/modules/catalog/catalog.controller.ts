import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common'
import { currentOrNextSession } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { Public } from '../../common/public.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { PUBLIC_LOT_WHERE, toLotDto } from './lot.dto'

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
      where: { status: { in: ['LIVE', 'SCHEDULED'] }, category: { enabled: true } },
      include: { category: { select: { slug: true } } },
      // идущие — первыми (в enum LIVE объявлен после SCHEDULED), затем по времени начала
      orderBy: [{ status: 'desc' }, { opensAt: 'asc' }],
      take: 200,
    })
    return lots.map(toLotDto)
  }

  @Get('lots/:id')
  async one(@Param('id', new ParseUUIDPipe()) id: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id, ...PUBLIC_LOT_WHERE },
      include: { category: { select: { slug: true } } },
    })
    if (!lot) throw new NotFoundException({ code: 'LOT_NOT_FOUND', message: 'Лот не найден' })
    return toLotDto(lot)
  }

  /** Категории каталога: только включённые, по порядку, названия ru/uz. */
  @Get('categories')
  async categories() {
    const list = await this.prisma.category.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    })
    return list.map((c) => ({ id: c.id, slug: c.slug, name: { ru: c.nameRu, uz: c.nameUz } }))
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
