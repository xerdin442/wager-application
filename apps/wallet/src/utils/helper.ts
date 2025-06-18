import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chain } from '@prisma/client';
import { ChainRPC, USDCTokenAddress } from './constants';
import { isAddress } from 'web3-validator';
import { PublicKey } from '@solana/web3.js';

@Injectable()
export class HelperService {
  private readonly NODE_ENV: string;
  private readonly ALCHEMY_API_KEY: string;
  private readonly HELIUS_API_KEY: string;

  constructor(private readonly config: ConfigService) {
    this.NODE_ENV = config.getOrThrow<string>('NODE_ENV');
    this.ALCHEMY_API_KEY = config.getOrThrow<string>('ALCHEMY_API_KEY');
    this.HELIUS_API_KEY = config.getOrThrow<string>('HELIUS_API_KEY');
  }

  selectRpcUrl(chain: Chain): string {
    let url: string;
    const isDev = this.NODE_ENV === 'development';

    if (!isDev) {
      chain === 'BASE'
        ? (url = `${ChainRPC.BASE_MAINNET}/${this.ALCHEMY_API_KEY}`)
        : (url = `${ChainRPC.SOLANA_MAINNET}=${this.HELIUS_API_KEY}`);
    } else {
      chain === 'BASE'
        ? (url = `${ChainRPC.BASE_SEPOLIA}/${this.ALCHEMY_API_KEY}`)
        : (url = `${ChainRPC.SOLANA_DEVNET}=${this.HELIUS_API_KEY}`);
    }

    return url;
  }

  selectUSDCTokenAddress(chain: Chain): string {
    let address: string;
    const isDev = this.NODE_ENV === 'development';

    if (!isDev) {
      chain === 'BASE'
        ? (address = USDCTokenAddress.BASE_MAINNET)
        : (address = USDCTokenAddress.SOLANA_MAINNET);
    } else {
      chain === 'BASE'
        ? (address = USDCTokenAddress.BASE_SEPOLIA)
        : (address = USDCTokenAddress.SOLANA_DEVNET);
    }

    return address;
  }

  validateAddress(address: string, chain: Chain): boolean {
    let isValidated: boolean;

    chain === 'BASE'
      ? (isValidated = isAddress(address))
      : (isValidated = PublicKey.isOnCurve(new PublicKey(address)));

    return isValidated;
  }
}
