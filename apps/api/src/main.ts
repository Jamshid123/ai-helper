import { createApp } from './bootstrap'
import { ENV } from './config/config.module'
import type { Env } from './config/env'

async function main() {
  const app = await createApp()
  const env = app.get<Env>(ENV)
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
}

void main()
