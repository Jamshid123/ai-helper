import { useEffect, useState } from 'react'

/** Текущее время с обновлением раз в секунду. На проде — со сдвигом к серверному времени. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function formatCountdown(ms: number, dayLabel: string): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86_400)
  const hms = [Math.floor((total % 86_400) / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
  return d > 0 ? `${d} ${dayLabel} ${hms}` : hms
}
