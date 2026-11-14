import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'

export type ImageExt = 'jpg' | 'png' | 'webp'

/** Фото не больше 5 МБ (админка сжимает до ~0,3–1 МБ перед загрузкой). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MIME: Record<ImageExt, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
/** Имя файла задаёт только сервер — так в путь не попадёт ничего чужого. */
export const FILE_RE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/

/** Тип изображения по первым байтам (не по заголовку Content-Type — его можно подделать). */
export function detectImage(buf: Buffer): ImageExt | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp'
  return null
}

/** Хранилище фото на диске сервера (решение заказчика 14.11.2026). */
@Injectable()
export class MediaService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async save(buf: Buffer, ext: ImageExt): Promise<string> {
    await mkdir(this.env.MEDIA_DIR, { recursive: true })
    const file = `${randomUUID()}.${ext}`
    await writeFile(join(this.env.MEDIA_DIR, file), buf, { flag: 'wx' })
    return file
  }

  async remove(file: string): Promise<void> {
    if (!FILE_RE.test(file)) return
    await rm(join(this.env.MEDIA_DIR, file), { force: true })
  }

  /** Поток файла или null, если нет. */
  async open(file: string) {
    if (!FILE_RE.test(file)) return null
    const path = join(this.env.MEDIA_DIR, file)
    const st = await stat(path).catch(() => null)
    if (!st?.isFile()) return null
    return { stream: createReadStream(path), size: st.size, mime: MIME[file.split('.').pop() as ImageExt] }
  }
}

/** Публичный адрес фото. */
export const photoUrl = (file: string) => `/api/v1/media/${file}`
