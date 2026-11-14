/**
 * Подключение TOTP при первом входе. Ключ держим только в памяти вкладки (не в URL, не в storage):
 * перезагрузка страницы — просто войти заново, сервер выдаст ключ снова, пока код не подключён.
 */
export type Enrollment = { secret: string; otpauthUrl: string }

let pending: { challengeId: string; enroll: Enrollment } | null = null

export function rememberEnrollment(
  challengeId: string,
  enroll: Enrollment | null
): void {
  pending = enroll ? { challengeId, enroll } : null
}

export function enrollmentFor(challengeId: string): Enrollment | null {
  return pending?.challengeId === challengeId ? pending.enroll : null
}

export function forgetEnrollment(): void {
  pending = null
}
