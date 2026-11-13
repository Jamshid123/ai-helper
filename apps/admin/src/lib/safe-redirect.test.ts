import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safe-redirect'

describe('safeRedirect', () => {
  it('пропускает внутренние пути с query и hash', () => {
    expect(safeRedirect('/lots?status=live#top')).toBe('/lots?status=live#top')
  })

  it.each([
    'https://evil.example/phish',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'lots',
    '/lots\u0000',
    '',
    undefined,
    42,
  ])('отклоняет %p', (value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})
