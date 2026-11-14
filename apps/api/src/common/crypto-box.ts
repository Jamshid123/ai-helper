import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Шифрование небольших секретов в БД (TOTP-секреты сотрудников, позже — IMEI): AES-256-GCM.
 * Формат: base64(iv[12] | tag[16] | ciphertext). Ключ — 32 байта hex из DATA_ENCRYPTION_KEY.
 */
export function seal(plaintext: string, keyHex: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

export function open(sealed: string, keyHex: string): string {
  const buf = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}
