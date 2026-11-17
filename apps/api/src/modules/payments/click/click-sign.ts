import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Подпись запросов Click SHOP API (docs.click.uz/shop-api/requests):
 * Prepare  — md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
 * Complete — md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 * Строки берём как пришли (сумма — «1000» или «1000.00» — ровно в том виде, в каком её подписал Click).
 */
export function clickSign(b: Record<string, string>, secret: string): string {
  const parts = [b.click_trans_id, b.service_id, secret, b.merchant_trans_id]
  if (b.action === '1') parts.push(b.merchant_prepare_id)
  parts.push(b.amount, b.action, b.sign_time)
  return createHash('md5').update(parts.join('')).digest('hex')
}

export function clickSignValid(b: Record<string, string>, secret: string): boolean {
  const got = Buffer.from(String(b.sign_string ?? '').toLowerCase())
  const want = Buffer.from(clickSign(b, secret))
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Заголовок Auth для наших запросов к Click Merchant API: merchant_user_id:sha1(timestamp + secret):timestamp. */
export function clickAuthHeader(merchantUserId: number, secret: string, nowMs: number): string {
  const ts = Math.floor(nowMs / 1000)
  const digest = createHash('sha1').update(`${ts}${secret}`).digest('hex')
  return `${merchantUserId}:${digest}:${ts}`
}

/**
 * Сумма от Click приходит в сумах дробным числом («12000» / «12000.00»). Принимаем только целые сумы:
 * деньги у нас — целые (bigint), дробные тийины означают ошибку суммы.
 */
export function parseClickAmount(s: string | undefined): bigint | null {
  const m = /^(\d{1,15})(?:\.0{1,2})?$/.exec(String(s ?? '').trim())
  return m ? BigInt(m[1]) : null
}
