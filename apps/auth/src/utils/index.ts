import { ClientProxy } from '@nestjs/microservices';
import { CreateWalletResponse } from '../types';
import { lastValueFrom } from 'rxjs';

export const createWallet = async (
  client: ClientProxy,
  message: { chain: string },
): Promise<CreateWalletResponse> => {
  return lastValueFrom(
    client.send<CreateWalletResponse>('create-wallet', message),
  );
};
