import { cn } from '@/shared/lib/cn'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
}

export function Button({ className, variant = 'primary', ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition-opacity active:opacity-80 disabled:bg-surface disabled:text-muted',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink',
        variant === 'primary' ? 'bg-primary text-on-primary' : 'bg-surface text-fg',
        className
      )}
      {...props}
    />
  )
}
