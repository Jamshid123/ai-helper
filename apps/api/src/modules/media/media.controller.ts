import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { Public } from '../../common/public.decorator'
import { MediaService } from './media.service'

/** Раздача фото товаров: публично (фото видны всем, решение 14.11.2026), кэш на год — имена файлов неизменяемы. */
@Public()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':file')
  async get(@Param('file') file: string, @Res() reply: FastifyReply) {
    const f = await this.media.open(file)
    if (!f) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Файл не найден' })
    return reply
      .header('Content-Type', f.mime)
      .header('Content-Length', f.size)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(f.stream)
  }
}
