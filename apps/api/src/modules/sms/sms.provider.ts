import { Inject, Injectable, Logger } from '@nestjs/common'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'

/** Отправка SMS (вход и уведомления). Реальный провайдер подключается после выбора (решение 15.11.2026). */
export abstract class SmsProvider {
  /** Можно ли отправлять SMS. */
  abstract readonly enabled: boolean
  /** Демо/тесты: код входа возвращается в ответе, SMS не уходит. */
  abstract readonly exposesCodes: boolean
  abstract send(phone: string, text: string): Promise<void>
}

/** SMS отключены: вход по коду недоступен (безопасное поведение по умолчанию). */
class DisabledSms extends SmsProvider {
  readonly enabled = false
  readonly exposesCodes = false
  async send(): Promise<void> {
    throw new Error('SMS отключены')
  }
}

/** Имитация: ничего не отправляет и не пишет в лог сам текст (там может быть код). */
class FakeSms extends SmsProvider {
  readonly enabled = true
  readonly exposesCodes = true
  private readonly log = new Logger('FakeSms')
  async send(phone: string): Promise<void> {
    this.log.debug(`fake SMS to ***${phone.slice(-2)}`)
  }
}

@Injectable()
export class SmsProviderFactory {
  constructor(@Inject(ENV) private readonly env: Env) {}
  create(): SmsProvider {
    return this.env.SMS_MODE === 'fake' ? new FakeSms() : new DisabledSms()
  }
}
