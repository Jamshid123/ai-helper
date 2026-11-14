import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { compressImage } from '@/lib/image'
import { Button } from '@/components/ui/button'
import {
  MAX_PHOTOS,
  type Product,
  useAddPhoto,
  useOrderPhotos,
  useRemovePhoto,
} from './api'

/**
 * Фото товара (решение заказчика 14.11.2026): до 10, первое — главное; покупатели видят их и до допуска.
 * Перед загрузкой фото сжимаются в браузере (≤ 1600 px, < 900 КБ).
 */
export function ProductPhotos({
  product,
  editable,
}: {
  product: Product
  editable: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const add = useAddPhoto()
  const remove = useRemovePhoto()
  const order = useOrderPhotos()
  const [uploading, setUploading] = useState(0)
  const photos = product.photos
  const left = MAX_PHOTOS - photos.length

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).slice(0, left)
    if (files.length > left) toast.warning(`Можно добавить ещё ${left} фото`)
    setUploading(list.length)
    for (const file of list) {
      try {
        const blob = await compressImage(file)
        await add.mutateAsync({ productId: product.id, file: blob })
      } catch (e) {
        // ошибки сервера показывает глобальный обработчик; здесь — только чтение файла
        if (!(e instanceof Error) || !('status' in e))
          toast.error(`Не удалось прочитать «${file.name}»`)
      }
      setUploading((n) => n - 1)
    }
    if (input.current) input.current.value = ''
  }

  const makeMain = (id: string) =>
    order.mutate({
      productId: product.id,
      ids: [id, ...photos.filter((p) => p.id !== id).map((p) => p.id)],
    })

  return (
    <section className='grid gap-2' aria-label='Фото товара'>
      <div className='flex items-center justify-between gap-2'>
        <h3 className='text-sm font-medium'>
          Фото{' '}
          <span className='text-muted-foreground'>
            {photos.length} из {MAX_PHOTOS}
          </span>
        </h3>
        {editable && (
          <>
            <input
              ref={input}
              type='file'
              accept='image/*'
              multiple
              className='sr-only'
              id={`photos-${product.id}`}
              onChange={(e) => void upload(e.target.files)}
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={left <= 0 || uploading > 0}
              onClick={() => input.current?.click()}
            >
              {uploading > 0 ? (
                <Loader2 className='animate-spin' />
              ) : (
                <ImagePlus />
              )}
              {uploading > 0 ? `Загрузка… ${uploading}` : 'Добавить фото'}
            </Button>
          </>
        )}
      </div>
      {photos.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          Фото пока нет. Первое фото — главное: его видно в каталоге.
        </p>
      ) : (
        <ul className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
          {photos.map((p, i) => (
            <li
              key={p.id}
              className='relative overflow-hidden rounded-md border bg-muted'
            >
              <img
                src={p.url}
                alt={`Фото ${i + 1}`}
                loading='lazy'
                className='aspect-square w-full object-cover'
              />
              {i === 0 && (
                <span className='absolute top-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium'>
                  Главное
                </span>
              )}
              {editable && (
                <div className='absolute inset-x-1 bottom-1 flex justify-end gap-1'>
                  {i > 0 && (
                    <Button
                      type='button'
                      size='icon'
                      variant='secondary'
                      className='size-8'
                      aria-label={`Сделать фото ${i + 1} главным`}
                      disabled={order.isPending}
                      onClick={() => makeMain(p.id)}
                    >
                      <Star />
                    </Button>
                  )}
                  <Button
                    type='button'
                    size='icon'
                    variant='secondary'
                    className='size-8'
                    aria-label={`Удалить фото ${i + 1}`}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate({ productId: product.id, photoId: p.id })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
