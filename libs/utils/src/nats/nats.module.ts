import { Global, Module } from '@nestjs/common';
import { ClientOptions, ClientProxyFactory } from '@nestjs/microservices';
import { natsOptions } from './nats.options';

@Global()
@Module({
  providers: [
    {
      provide: 'AUTH_SERVICE',
      useFactory: () => ClientProxyFactory.create(natsOptions as ClientOptions),
    },
    {
      provide: 'ADMIN_SERVICE',
      useFactory: () => ClientProxyFactory.create(natsOptions as ClientOptions),
    },
    {
      provide: 'WAGER_SERVICE',
      useFactory: () => ClientProxyFactory.create(natsOptions as ClientOptions),
    },
    {
      provide: 'FIAT_SERVICE',
      useFactory: () => ClientProxyFactory.create(natsOptions as ClientOptions),
    },
    {
      provide: 'CRYPTO_SERVICE',
      useFactory: () => ClientProxyFactory.create(natsOptions as ClientOptions),
    },
    {
      provide: 'USER_SERVICE',
      useFactory: () => ClientProxyFactory.create(natsOptions as ClientOptions),
    },
  ],
  exports: [
    'AUTH_SERVICE',
    'ADMIN_SERVICE',
    'WAGER_SERVICE',
    'FIAT_SERVICE',
    'CRYPTO_SERVICE',
    'USER_SERVICE',
  ],
})
export class NatsModule {}
