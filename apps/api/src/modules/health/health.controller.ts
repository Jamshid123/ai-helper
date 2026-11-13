import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS } from '../../common/redis.module'
import { PrismaService } from '../../prisma/prisma.service'

type Check = 'ok' | 'fail'

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  /** Живость и зависимости. Без деталей ошибок наружу. */
  @Get()
  async check(): Promise<{ status: 'ok'; db: Check; redis: Check; time: string }> {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then((): Check => 'ok').catch((): Check => 'fail'),
      this.redis
        .ping()
        .then((r): Check => (r === 'PONG' ? 'ok' : 'fail'))
        .catch((): Check => 'fail'),
    ])
    if (db !== 'ok' || redis !== 'ok') {
      throw new HttpException({ status: 'fail', db, redis }, HttpStatus.SERVICE_UNAVAILABLE)
    }
    return { status: 'ok', db, redis, time: new Date().toISOString() }
  }
}
