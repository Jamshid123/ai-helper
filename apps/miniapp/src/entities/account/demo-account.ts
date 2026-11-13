import { useSyncExternalStore } from 'react'

/**
 * Аккаунт на демо-стенде (заглушка до API). Хранится в localStorage этого устройства.
 * На проде: телефон — из message.contact бота (сервер), правила и заявка продавца — через API.
 */
export const DEMO_TEST_PHONE = '+998 90 000 00 01'

export type SellerType = 'individual' | 'company'
export type SellerStatus = 'none' | 'review'

export type Account = {
  phone: string | null
  firstName: string
  lastName: string
  rulesAccepted: boolean
  seller: { status: SellerStatus; type: SellerType | null; name: string; inn: string; cardLast4: string }
}

const KEY = 'auksion.demo.account'
const EMPTY: Account = {
  phone: null,
  firstName: '',
  lastName: '',
  rulesAccepted: false,
  seller: { status: 'none', type: null, name: '', inn: '', cardLast4: '' },
}

function read(): Account {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Account) } : EMPTY
  } catch {
    return EMPTY
  }
}

let state: Account = read()
const listeners = new Set<() => void>()

export function updateAccount(patch: Partial<Account>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // приватный режим — живём в памяти
  }
  listeners.forEach((l) => l())
}

export function resetAccount() {
  updateAccount(EMPTY)
}

export function useAccount(): Account {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state
  )
}

export const isRegistered = (a: Account) => Boolean(a.phone && a.firstName && a.rulesAccepted)

/** «Азиз К.» — как имя видят другие участники (ТЗ: имя + сокращённая фамилия). */
export function publicNameOf(a: Pick<Account, 'firstName' | 'lastName'>): string {
  const first = a.firstName.trim()
  const last = a.lastName.trim()
  return last ? `${first} ${last[0].toUpperCase()}.` : first
}

export function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  return digits.length >= 12 ? `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ***-**-${digits.slice(-2)}` : p
}
