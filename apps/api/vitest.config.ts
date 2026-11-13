import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// SWC нужен для decorator metadata (DI в NestJS); esbuild её не генерирует.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
