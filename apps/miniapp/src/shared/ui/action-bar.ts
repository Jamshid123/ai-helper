/**
 * Нижняя панель действия на телефоне — над нижним меню (Каталог / Профиль), а не поверх него:
 * иначе меню закрыто и со страницы не уйти (баг 17.11.2026). Высота меню — h-14 + граница (см. routes/__root.tsx).
 * С md и шире нижнего меню нет — панель у самого низа экрана.
 */
export const ACTION_BAR =
  'fixed inset-x-0 z-10 border-t border-line bg-bg px-4 pt-3 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom,0px))] pb-3 md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
