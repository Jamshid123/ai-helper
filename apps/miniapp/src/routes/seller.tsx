import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Building2, Clock, FileUp, User } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { haptic, useBackButton, useMainButton } from '@/app/telegram'
import { isRegistered, updateAccount, useAccount, type SellerType } from '@/entities/account/demo-account'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Check, Field, Steps } from '@/shared/ui/steps'

/**
 * Заявка продавца (ТЗ «Проверка продавца»): тип профиля → данные → документы → карта выплат → договор.
 * В пилоте заявки принимаются без оплаты и публикации лотов. Демо: документы и проверка — заглушки.
 */
function SellerPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const account = useAccount()
  const [step, setStep] = useState(1)
  const [type, setType] = useState<SellerType | null>(account.seller.type)
  const [name, setName] = useState(account.seller.name)
  const [inn, setInn] = useState(account.seller.inn)
  const [docs, setDocs] = useState(false)
  const [card, setCard] = useState('')
  const [contract, setContract] = useState(false)

  const back = () => (step > 1 ? setStep(step - 1) : navigate({ to: '/me' }))
  useBackButton(back)

  const cardDigits = card.replace(/\D/g, '')
  const canNext = [
    Boolean(type),
    name.trim().length > 2 && /^\d{9,14}$/.test(inn.trim()),
    docs,
    cardDigits.length === 16,
    contract,
  ][step - 1]
  const submit = () => {
    // TODO(API): POST /seller/applications — данные шифруются, проверка реквизитов, решение сотрудника с причиной.
    updateAccount({
      seller: { status: 'review', type, name: name.trim(), inn: inn.trim(), cardLast4: cardDigits.slice(-4) },
    })
    haptic('success')
  }
  const primaryText = step === 5 ? t('seller.submit') : t('reg.next')
  const onPrimary = step === 5 ? submit : () => setStep(step + 1)
  const inReview = account.seller.status === 'review'
  const native = useMainButton({
    text: primaryText,
    onClick: onPrimary,
    enabled: Boolean(canNext),
    visible: !inReview && isRegistered(account),
  })

  if (!isRegistered(account)) {
    return (
      <div className='grid gap-4 px-4 pt-6'>
        <h1 className='text-xl font-semibold'>{t('seller.title')}</h1>
        <p className='text-[14px] text-muted'>{t('reg.required')}</p>
        <Link
          to='/register'
          search={{ next: '/seller' }}
          className='flex h-12 items-center justify-center rounded-xl bg-primary font-semibold text-on-primary'
        >
          {t('me.register')}
        </Link>
      </div>
    )
  }

  if (inReview) {
    return (
      <div className='grid gap-3 px-4 pt-8 text-center'>
        <Clock className='mx-auto size-10 text-brand-ink' aria-hidden='true' />
        <h1 className='text-xl font-semibold'>{t('seller.review')}</h1>
        <p className='text-[14px] text-muted'>{t('seller.review.text')}</p>
        <p className='text-[13px] text-muted'>
          {account.seller.name} · •••• {account.seller.cardLast4}
        </p>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-5 px-4 pt-4 pb-28'>
      <div className='grid gap-3'>
        <h1 className='text-xl font-semibold'>{t('seller.title')}</h1>
        <p className='rounded-xl bg-surface px-3 py-2 text-[13px] leading-relaxed text-muted'>{t('seller.pilot')}</p>
        <Steps current={step} total={5} />
      </div>

      {step === 1 && (
        <section className='grid gap-3' role='radiogroup' aria-label={t('seller.type.title')}>
          <h2 className='text-[17px] font-semibold'>{t('seller.type.title')}</h2>
          {(
            [
              ['individual', User, 'seller.type.individual'],
              ['company', Building2, 'seller.type.company'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type='button'
              role='radio'
              aria-checked={type === v}
              onClick={() => setType(v)}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left text-[15px]',
                type === v ? 'border-primary bg-surface font-semibold' : 'border-line'
              )}
            >
              <Icon className='size-5 text-brand-ink' aria-hidden='true' /> {t(label)}
            </button>
          ))}
        </section>
      )}

      {step === 2 && (
        <section className='grid gap-4'>
          <h2 className='text-[17px] font-semibold'>{t('seller.data.title')}</h2>
          <Field
            id='sellerName'
            label={t(type === 'company' ? 'seller.data.name.company' : 'seller.data.name.individual')}
            value={name}
            onChange={setName}
          />
          <Field id='inn' label={t('seller.data.inn')} value={inn} onChange={setInn} inputMode='numeric' />
        </section>
      )}

      {step === 3 && (
        <section className='grid gap-4'>
          <h2 className='text-[17px] font-semibold'>{t('seller.docs.title')}</h2>
          <p className='text-[14px] text-muted'>
            {t(type === 'company' ? 'seller.docs.company' : 'seller.docs.individual')}
          </p>
          <Button variant='ghost' onClick={() => setDocs(true)} className='border border-dashed border-line'>
            <FileUp className='size-5' aria-hidden='true' />{' '}
            {docs ? t('seller.docs.uploaded') : t('seller.docs.upload')}
          </Button>
        </section>
      )}

      {step === 4 && (
        <section className='grid gap-4'>
          <h2 className='text-[17px] font-semibold'>{t('seller.payout.title')}</h2>
          <p className='text-[14px] text-muted'>{t('seller.payout.text')}</p>
          <Field
            id='card'
            label={t('seller.payout.card')}
            value={card}
            onChange={(v) =>
              setCard(
                v
                  .replace(/\D/g, '')
                  .slice(0, 16)
                  .replace(/(\d{4})(?=\d)/g, '$1 ')
              )
            }
            inputMode='numeric'
            autoComplete='cc-number'
            placeholder='8600 •••• •••• ••••'
          />
        </section>
      )}

      {step === 5 && (
        <section className='grid gap-4'>
          <h2 className='text-[17px] font-semibold'>{t('seller.contract.title')}</h2>
          <Check id='contract' checked={contract} onChange={setContract}>
            {t('seller.contract.accept')}
          </Check>
        </section>
      )}

      {!native && (
        <div className='fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'>
          <div className='mx-auto grid max-w-lg grid-cols-[auto_1fr] gap-2'>
            <Button variant='ghost' onClick={back}>
              {t('reg.back')}
            </Button>
            <Button onClick={onPrimary} disabled={!canNext}>
              {primaryText}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/seller')({ component: SellerPage })
