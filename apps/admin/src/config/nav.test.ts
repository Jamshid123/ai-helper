import { describe, expect, it } from 'vitest'
import { NAV_AREAS, areaOf, visibleAreas } from './nav'

describe('меню админки: 7 разделов по правам (ТЗ 20.11.2026)', () => {
  it('владелец видит все 7 разделов в порядке ТЗ', () => {
    expect(visibleAreas({ isOwner: true }).map((a) => a.title)).toEqual([
      'Обзор',
      'Аукционы',
      'Каталог',
      'Пользователи',
      'Финансы',
      'Контроль',
      'Настройки',
    ])
  })

  it('сотрудник видит только разделы с доступной вкладкой; Настройки — только владелец', () => {
    const areas = visibleAreas({
      permissions: { fulfillment: 'edit', products: 'view' },
    })
    expect(areas.map((a) => a.title)).toEqual(['Обзор', 'Аукционы', 'Каталог'])
    const auctions = areas.find((a) => a.id === 'auctions')
    // без права на лоты «Все лоты», «Результаты» и «Расписание» скрыты — раздел открывает первую доступную вкладку
    expect(auctions?.tabs.map((t) => t.title)).toEqual(['Выдача'])
    expect(auctions?.url).toBe('/fulfillment')
  })

  it('без прав — только Обзор; группировка не даёт новых прав', () => {
    expect(visibleAreas({ permissions: {} }).map((a) => a.id)).toEqual([
      'overview',
    ])
    expect(
      visibleAreas({ permissions: { finance: 'view' } }).map((a) => a.id)
    ).toEqual(['overview', 'finance'])
  })

  it('прежние адреса страниц сохранены и принадлежат своим разделам', () => {
    const map = Object.fromEntries(
      [
        '/lots',
        '/schedule',
        '/results',
        '/fulfillment',
        '/products',
        '/categories',
        '/participants',
        '/finance',
        '/audit',
        '/staff',
        '/roles',
        '/',
      ].map((url) => [url, areaOf(url)?.id])
    )
    expect(map).toEqual({
      '/lots': 'auctions',
      '/schedule': 'auctions',
      '/results': 'auctions',
      '/fulfillment': 'auctions',
      '/products': 'catalog',
      '/categories': 'catalog',
      '/participants': 'users',
      '/finance': 'finance',
      '/audit': 'control',
      '/staff': 'settings',
      '/roles': 'settings',
      '/': 'overview',
    })
    expect(areaOf('/lots/')?.id).toBe('auctions')
  })

  it('заглушки без API в меню не попадают', () => {
    const urls = NAV_AREAS.flatMap((a) => a.tabs.map((t) => t.url))
    for (const hidden of ['/sellers', '/inspection', '/risk']) {
      expect(urls).not.toContain(hidden)
    }
  })
})
