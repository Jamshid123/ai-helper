/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // API_PROXY — для сквозных тестов (apps/e2e поднимает свой API на другом порту)
  server: { proxy: { '/api': process.env.API_PROXY ?? 'http://localhost:3000' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
