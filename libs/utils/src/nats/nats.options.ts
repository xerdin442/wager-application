import {
  ClientOptions,
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';

export const natsOptions: ClientOptions | MicroserviceOptions = {
  transport: Transport.NATS,
  options: {
    servers: [process.env.NATS_URL as string],
  },
};
