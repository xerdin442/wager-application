import { ClientProxy } from '@nestjs/microservices';
import { CreateWalletResponse } from '../types';

export const createWallet = async (
  client: ClientProxy,
  message: { chain: string },
): Promise<CreateWalletResponse> => {
  const result = client.send<CreateWalletResponse>('create-wallet', message);

  return new Promise<CreateWalletResponse>((resolve, reject) => {
    result.subscribe({
      next: (data) => resolve(data),
      error: (err: Error) => reject(err),
    });
  });
};
