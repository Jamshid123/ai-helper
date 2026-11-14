/** Размер с сохранением пропорций, длинная сторона не больше max. */
export function fitSize(
  w: number,
  h: number,
  max: number
): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.round(w * k), h: Math.round(h * k) }
}

/** Лимит nginx хоста для админки — 1 МБ; держим запас. */
export const MAX_UPLOAD_BYTES = 900_000
const MAX_SIDE = 1600

/**
 * Сжатие фото в браузере перед загрузкой: длинная сторона ≤ 1600 px, JPEG,
 * качество снижается, пока файл не станет меньше 900 КБ. Ориентация с камеры учитывается.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { w, h } = fitSize(bmp.width, bmp.height, MAX_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(bmp, 0, 0, w, h)
    for (const q of [0.82, 0.72, 0.6, 0.5, 0.4]) {
      const blob = await new Promise<Blob | null>((ok) =>
        canvas.toBlob(ok, 'image/jpeg', q)
      )
      if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob
    }
    throw new Error('too-large')
  } finally {
    bmp.close()
  }
}
