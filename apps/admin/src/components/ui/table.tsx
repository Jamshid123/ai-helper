import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Подписи колонок → `data-label` у ячеек: на телефоне (< md) строка таблицы показывается
 * карточкой «подпись — значение», без горизонтальной прокрутки и спрятанных кнопок действий.
 */
function useCellLabels(ref: React.RefObject<HTMLTableElement | null>) {
  React.useLayoutEffect(() => {
    const table = ref.current
    if (!table) return
    const label = () => {
      const heads = Array.from(table.querySelectorAll('thead th')).map(
        (th) => th.textContent?.trim() ?? ''
      )
      table.querySelectorAll('tbody tr').forEach((tr) => {
        let col = 0
        for (const cell of Array.from(tr.children) as HTMLTableCellElement[]) {
          const span = cell.colSpan || 1
          const text = span > 1 ? '' : (heads[col] ?? '')
          if (cell.getAttribute('data-label') !== text)
            cell.setAttribute('data-label', text)
          col += span
        }
      })
    }
    label()
    const observer = new MutationObserver(label)
    observer.observe(table, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [ref])
}

const MOBILE_CARDS = [
  'max-md:block max-md:[&_tbody]:block max-md:[&_thead]:hidden',
  'max-md:[&_tr]:block max-md:[&_tr]:px-3 max-md:[&_tr]:py-2',
  // подпись — слева (float), значение одним блоком справа, даже если в ячейке несколько элементов
  'max-md:[&_td]:flow-root max-md:[&_td]:px-0 max-md:[&_td]:py-1 max-md:[&_td]:text-end max-md:[&_td]:whitespace-normal',
  'max-md:[&_td]:before:float-left max-md:[&_td]:before:me-3 max-md:[&_td]:before:text-muted-foreground',
  'max-md:[&_td]:before:content-[attr(data-label)]',
].join(' ')

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  const ref = React.useRef<HTMLTableElement>(null)
  useCellLabels(ref)
  return (
    <div
      data-slot='table-container'
      className='relative w-full overflow-x-auto'
    >
      <table
        ref={ref}
        data-slot='table'
        className={cn('w-full caption-bottom text-sm', MOBILE_CARDS, className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot='table-header'
      className={cn('[&_tr]:border-b', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot='table-body'
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot='table-footer'
      className={cn(
        'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot='table-row'
      className={cn(
        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot='table-head'
      className={cn(
        'h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5',
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot='table-cell'
      className={cn(
        'p-2 align-middle whitespace-nowrap *:[[role=checkbox]]:translate-y-0.5',
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot='table-caption'
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
