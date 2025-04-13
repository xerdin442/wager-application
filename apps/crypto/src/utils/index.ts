import { ConfigService } from '@nestjs/config';
import { Chain } from '../types';

const config = new ConfigService();
const NODE_ENV = config.getOrThrow<string>('NODE_ENV');
const ALCHEMY_API_KEY = config.getOrThrow<string>('ALCHEMY_API_KEY}');
const HELIUS_API_KEY = config.getOrThrow<string>('HELIUS_API_KEY}');

export const selectRpcUrl = (
  chain: Chain,
  mode: 'http' | 'websocket',
): string => {
  let url: string;

  mode === 'http' ? (url = 'https://') : (url = 'wss://');

  if (NODE_ENV === 'production') {
    chain === 'base'
      ? (url += `base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`)
      : (url += `mainnet.helius-rpc.com?api-key=${HELIUS_API_KEY}`);
  }

  if (NODE_ENV === 'development' || NODE_ENV === 'test') {
    chain === 'base'
      ? (url += `base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`)
      : (url += `devnet.helius-rpc.com?api-key=${HELIUS_API_KEY}`);
  }

  return url;
};

export const selectUSDCTokenAddress = (chain: Chain): string => {
  let address: string = '';

  if (NODE_ENV === 'production') {
    chain === 'base'
      ? (address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
      : (address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  }

  if (NODE_ENV === 'development' || NODE_ENV === 'test') {
    chain === 'base'
      ? (address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e')
      : (address = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  }

  return address;
};
