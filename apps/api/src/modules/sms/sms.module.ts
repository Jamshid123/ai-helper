import { Global, Module } from '@nestjs/common'
import { SmsProvider, SmsProviderFactory } from './sms.provider'

@Global()
@Module({
  providers: [
    SmsProviderFactory,
    { provide: SmsProvider, useFactory: (f: SmsProviderFactory) => f.create(), inject: [SmsProviderFactory] },
  ],
  exports: [SmsProvider],
})
export class SmsModule {}
