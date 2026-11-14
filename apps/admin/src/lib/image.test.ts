import { describe, expect, it } from 'vitest'
import { compressImage, fitSize, MAX_UPLOAD_BYTES } from './image'

describe('сжатие фото перед загрузкой', () => {
  it('fitSize: длинная сторона ≤ max, пропорции сохраняются, маленькие не растягиваются', () => {
    expect(fitSize(4032, 3024, 1600)).toEqual({ w: 1600, h: 1200 })
    expect(fitSize(3024, 4032, 1600)).toEqual({ w: 1200, h: 1600 })
    expect(fitSize(800, 600, 1600)).toEqual({ w: 800, h: 600 })
  })
  it('большое фото → JPEG меньше лимита и не больше 1600 px', async () => {
    const c = document.createElement('canvas')
    c.width = 4000
    c.height = 3000
    const ctx = c.getContext('2d')!
    // шум — худший случай для сжатия
    const img = ctx.createImageData(4000, 3000)
    for (let i = 0; i < img.data.length; i++)
      img.data[i] = (i * 2654435761) % 256
    ctx.putImageData(img, 0, 0)
    const src = await new Promise<Blob>((ok) =>
      c.toBlob((b) => ok(b!), 'image/png')
    )
    const out = await compressImage(src)
    expect(out.type).toBe('image/jpeg')
    expect(out.size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES)
    const bmp = await createImageBitmap(out)
    expect(Math.max(bmp.width, bmp.height)).toBe(1600)
  })
})
