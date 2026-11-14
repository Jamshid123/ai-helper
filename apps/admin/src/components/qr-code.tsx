import { useMemo } from 'react'
import { encode } from 'uqr'

/** QR-код из строки — SVG из квадратов (без innerHTML). */
export function QrCode({
  value,
  size = 184,
  label,
}: {
  value: string
  size?: number
  label: string
}) {
  const { data, n } = useMemo(() => {
    const r = encode(value, { border: 2 })
    return { data: r.data, n: r.size }
  }, [value])
  const cells: string[] = []
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) cells.push(`M${x} ${y}h1v1h-1z`)
    })
  )
  return (
    <svg
      role='img'
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering='crispEdges'
      className='rounded-md bg-white'
    >
      <path d={cells.join('')} fill='#000' />
    </svg>
  )
}
