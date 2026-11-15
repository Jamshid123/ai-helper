import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ShieldCheck, Smartphone } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { haptic } from '@/app/platform'
import { publicNameOf } from '@/entities/account/demo-account'
import { DEMO_CODE, useAuthActions } from '@/entities/account/session'
import { DEMO } from '@/entities/lot/api'
import { errorText } from '@/shared/api/error-text'
import { ApiError } from '@/shared/api/client'
import { formatPhoneInput, isCompleteUzPhone } from '@/shared/lib/phone'
import { Button } from '@/shared/ui/button'
import { Field, Steps } from '@/shared/ui/steps'

/**
 * Вход и регистрация на сайте (решение 15.11.2026): телефон → код из SMS → имя (только новым).
 * Код проверяет сервер; сессия — httpOnly-cookie. Правила торгов принимаются при допуске к лоту.
 */
function RegisterPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { next } = Route.useSearch()
  const { requestCode, verifyCode, saveProfile } = useAuthActions()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step !== 2) return
    codeInput.current?.focus()
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [step])

  const done = () => navigate({ href: next ?? '/', replace: true })

  const run = async (fn: () => Promise<void>) => {
    setPending(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      haptic('error')
      const left = e instanceof ApiError && typeof e.body.attemptsLeft === 'number' ? e.body.attemptsLeft : null
      setError(left !== null ? `${errorText(t, e)} · ${t('login.attemptsLeft')}: ${left}` : errorText(t, e))
    } finally {
      setPending(false)
    }
  }

  const sendCode = () =>
    run(async () => {
      const r = await requestCode(phone)
      setDevCode(r.devCode ?? null)
      const t0 = Date.now()
      setNow(t0)
      setResendAt(t0 + r.retryAfterSec * 1000)
      setCode('')
      setStep(2)
    })

  const checkCode = (value = code) =>
    run(async () => {
      const r = await verifyCode(phone, value)
      haptic('success')
      if (r.needsProfile) setStep(3)
      else done()
    })

  const finish = () =>
    run(async () => {
      await saveProfile(firstName, lastName)
      haptic('success')
      done()
    })

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const canPrimary =
    step === 1 ? isCompleteUzPhone(phone) : step === 2 ? /^\d{6}$/.test(code) : firstName.trim().length > 0
  const primary = step === 1 ? sendCode : step === 2 ? () => checkCode() : finish
  const primaryText = step === 1 ? t('login.getCode') : step === 2 ? t('login.enter') : t('login.save')

  return (
    <div className='mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-6 pb-28'>
      <div className='grid gap-3'>
        <h1 className='text-xl font-semibold'>{t('login.title')}</h1>
        {next && step === 1 && <p className='text-[14px] text-muted'>{t('reg.required')}</p>}
        <Steps current={step} total={3} />
      </div>

      <form
        className='grid gap-4'
        onSubmit={(e) => {
          e.preventDefault()
          if (canPrimary && !pending) void primary()
        }}
      >
        {step === 1 && (
          <>
            <Smartphone className='size-8 text-brand-ink' aria-hidden='true' />
            <h2 className='text-[17px] font-semibold'>{t('login.phone.title')}</h2>
            <p className='text-[14px] leading-relaxed text-muted'>{t('login.phone.text')}</p>
            <Field
              id='phone'
              label={t('me.phone')}
              value={phone}
              onChange={(v) => setPhone(formatPhoneInput(v, phone))}
              inputMode='tel'
              autoComplete='tel'
              placeholder='+998 90 123 45 67'
            />
          </>
        )}

        {step === 2 && (
          <>
            <h2 className='text-[17px] font-semibold'>{t('login.code.title')}</h2>
            <p className='text-[14px] text-muted'>
              {t('login.code.sent')} <b className='text-fg'>{phone}</b>{' '}
              <button type='button' className='min-h-11 text-brand-ink underline' onClick={() => setStep(1)}>
                {t('login.code.change')}
              </button>
            </p>
            <label htmlFor='code' className='grid gap-1.5'>
              <span className='text-[13px] text-muted'>{t('login.code.label')}</span>
              <input
                ref={codeInput}
                id='code'
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(v)
                  if (v.length === 6 && !pending) void checkCode(v)
                }}
                inputMode='numeric'
                autoComplete='one-time-code'
                maxLength={6}
                placeholder='••••••'
                className='tabular h-14 rounded-xl border border-line bg-bg px-3.5 text-center text-[24px] tracking-[0.4em] outline-none focus:border-primary'
              />
            </label>
            {(devCode || DEMO) && (
              <p className='rounded-xl bg-surface px-3 py-2 text-[13px] text-muted'>
                {t('login.code.demo')}: <b className='tabular text-fg'>{devCode ?? DEMO_CODE}</b>
              </p>
            )}
            {wait > 0 ? (
              <p className='text-[13px] text-muted'>{t('login.code.resendIn').replace('{s}', String(wait))}</p>
            ) : (
              <button
                type='button'
                onClick={sendCode}
                disabled={pending}
                className='min-h-11 justify-self-start text-[14px] text-brand-ink underline'
              >
                {t('login.code.resend')}
              </button>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className='text-[17px] font-semibold'>{t('reg.name.title')}</h2>
            <Field
              id='firstName'
              label={t('reg.name.first')}
              value={firstName}
              onChange={setFirstName}
              autoComplete='given-name'
            />
            <Field
              id='lastName'
              label={t('reg.name.last')}
              value={lastName}
              onChange={setLastName}
              autoComplete='family-name'
            />
            {firstName.trim() && (
              <p className='rounded-xl bg-surface px-3 py-2 text-[13.5px]'>
                <span className='text-muted'>{t('reg.name.preview')}: </span>
                <b>{publicNameOf({ firstName, lastName })}</b>
              </p>
            )}
          </>
        )}

        {error && (
          <p role='alert' className='rounded-xl bg-hot/10 px-4 py-3 text-[14px] font-medium text-hot-text'>
            {error}
          </p>
        )}

        <ul className='grid gap-2 rounded-2xl border border-line p-4'>
          {(['reg.safety.1', 'reg.safety.2', 'reg.safety.3'] as const).map((k) => (
            <li key={k} className='grid grid-cols-[20px_1fr] gap-2 text-[13px] leading-snug text-muted'>
              <ShieldCheck className='mt-0.5 size-4 text-ok' aria-hidden='true' />
              {t(k)}
            </li>
          ))}
        </ul>

        <Button type='submit' disabled={!canPrimary || pending} className='w-full'>
          {primaryText}
        </Button>
      </form>
    </div>
  )
}

export const Route = createFileRoute('/register')({
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === 'string' && s.next.startsWith('/') && !s.next.startsWith('//') ? { next: s.next } : {},
  component: RegisterPage,
})
