import { defineConfig, devices } from '@playwright/test'

/**
 * Сквозные тесты сайта покупателя (решение 17.11.2026: регрессия на Playwright, пишем один раз и ведём с изменениями).
 * Поднимают свой API (порт 3010, отдельная БД *_e2e, имитация оплаты и SMS), сайт (vite, порт 5180) и админку (vite, 5181).
 * Запуск: pnpm --filter @auksion/e2e e2e   (нужна собранная API: pnpm --filter @auksion/api build)
 * Локально уже установленный Chromium: PW_CHROMIUM_PATH=/путь/к/chrome.
 */
const API_PORT = 3010
const SITE_PORT = 5180
const ADMIN_PORT = 5181
const CI = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  // общая БД и один API — тесты идут по одному, каждый со своим новым покупателем
  workers: 1,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${SITE_PORT}`,
    locale: 'ru-RU',
    trace: 'on-first-retry',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    // основные сценарии (ru, светлая тема)
    { name: 'phone', testIgnore: /small-uz-dark|admin/, use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', testIgnore: /small-uz-dark|admin/, use: { viewport: { width: 1280, height: 800 } } },
    // маленький экран (iPhone SE, 375×667) + узбекский + тёмная тема: вёрстка, перекрытия, длинные строки
    {
      name: 'small-uz-dark',
      testMatch: /small-uz-dark/,
      use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium', colorScheme: 'dark', locale: 'uz-UZ' },
    },
    // админка сотрудников (экран оператора 1280×800)
    {
      name: 'admin',
      testMatch: /admin\/.+\.spec\.ts$/,
      use: { baseURL: `http://localhost:${ADMIN_PORT}`, viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'bash scripts/start-api.sh',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: 'pipe',
      env: { API_PORT: String(API_PORT), SITE_ORIGIN: `http://localhost:${SITE_PORT},http://localhost:${ADMIN_PORT}` },
    },
    {
      command: `pnpm --filter @auksion/miniapp exec vite --port ${SITE_PORT} --strictPort`,
      url: `http://localhost:${SITE_PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { VITE_DEMO_STAND: 'true', VITE_DEMO_DATA: 'false', API_PROXY: `http://localhost:${API_PORT}` },
    },
    {
      command: `pnpm --filter @auksion/admin exec vite --port ${ADMIN_PORT} --strictPort`,
      url: `http://localhost:${ADMIN_PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { VITE_DEMO_AUTH: 'false', API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
})
