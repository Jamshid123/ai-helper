import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ShieldCheck, Smartphone } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { getWebApp, haptic, useBackButton, useMainButton } from '@/app/telegram'
import { DEMO_TEST_PHONE, publicNameOf, updateAccount, useAccount } from '@/entities/account/demo-account'
import { Button } from '@/shared/ui/button'
import { Check, Field, Steps } from '@/shared/ui/steps'

/**
 * Регистрация покупателя (ТЗ «Аккаунт покупателя»): телефон → имя → правила.
 * Демо: вместо контакта из Telegram подставляется тестовый номер. На проде контакт приходит боту
 * (message.contact, проверка contact.user_id === from.id) и подтверждается сервером.
 */
function RegisterPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { next } = Route.useSearch()
  const account = useAccount()
  const tgUser = getWebApp()?.initDataUnsafe.user
  const [step, setStep] = useState(account.phone ? 2 : 1)
  const [firstName, setFirstName] = useState(account.firstName || tgUser?.first_name || '')
  const [lastName, setLastName] = useState(account.lastName)
  const [rules, setRules] = useState(account.rulesAccepted)

  const back = () => (step > 1 ? setStep(step - 1) : navigate({ to: '/me' }))
  useBackButton(back)

  const sharePhone = () => {
    // TODO(API): WebApp.requestContact() → бот получает контакт → сервер подтверждает номер.
    updateAccount({ phone: DEMO_TEST_PHONE })
    haptic('success')
    setStep(2)
  }
  const finish = () => {
    updateAccount({ firstName: firstName.trim(), lastName: lastName.trim(), rulesAccepted: true })
    haptic('success')
    navigate({ href: next ?? '/', replace: true })
  }

  const canNext = step === 1 ? Boolean(account.phone) : step === 2 ? firstName.trim().length > 1 : rules
  const primaryText = step === 1 ? t('reg.phone.share') : step === 3 ? t('reg.finish') : t('reg.next')
  const onPrimary = step === 1 ? sharePhone : step === 3 ? finish : () => setStep(3)
  const native = useMainButton({ text: primaryText, onClick: onPrimary, enabled: step === 1 || canNext })

  return (
    <div className='flex flex-col gap-5 px-4 pt-4 pb-28'>
      <div className='grid gap-3'>
        <h1 className='text-xl font-semibold'>{t('reg.title')}</h1>
        {next && <p className='text-[14px] text-muted'>{t('reg.required')}</p>}
        <Steps current={step} total={3} />
      </div>

      {step === 1 && (
        <section className='grid gap-3'>
          <Smartphone className='size-8 text-brand-ink' aria-hidden='true' />
          <h2 className='text-[17px] font-semibold'>{t('reg.phone.title')}</h2>
          <p className='text-[14px] leading-relaxed text-muted'>{t('reg.phone.text')}</p>
          <p className='rounded-xl bg-surface px-3 py-2 text-[13px] text-muted'>
            {t('reg.phone.demo')}: {DEMO_TEST_PHONE}
          </p>
        </section>
      )}

      {step === 2 && (
        <section className='grid gap-4'>
          <p className='text-[13px] font-medium text-ok'>
            ✓ {t('reg.phone.got')}: {account.phone}
          </p>
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
        </section>
      )}

      {step === 3 && (
        <section className='grid gap-4'>
          <h2 className='text-[17px] font-semibold'>{t('reg.rules.title')}</h2>
          <ul className='grid gap-2.5 rounded-2xl border border-line p-4'>
            {(['reg.safety.1', 'reg.safety.2', 'reg.safety.3'] as const).map((k) => (
              <li key={k} className='grid grid-cols-[20px_1fr] gap-2 text-[13.5px] leading-snug'>
                <ShieldCheck className='mt-0.5 size-4 text-ok' aria-hidden='true' />
                {t(k)}
              </li>
            ))}
          </ul>
          <p className='text-[13px] leading-relaxed text-muted'>{t('lot.terms.text')}</p>
          <Check id='rules' checked={rules} onChange={setRules}>
            {t('reg.rules.accept')}
          </Check>
        </section>
      )}

      {!native && (
        <div className='fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'>
          <div className='mx-auto grid max-w-lg grid-cols-[auto_1fr] gap-2'>
            <Button variant='ghost' onClick={back}>
              {t('reg.back')}
            </Button>
            <Button onClick={onPrimary} disabled={step !== 1 && !canNext}>
              {primaryText}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/register')({
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === 'string' && s.next.startsWith('/') && !s.next.startsWith('//') ? { next: s.next } : {},
  component: RegisterPage,
})
