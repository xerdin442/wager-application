import { Injectable } from '@nestjs/common';
import { Connection, Keypair } from '@solana/web3.js';
import { selectRpcUrl } from '@src/common/util/crypto';
import Web3 from 'web3';

@Injectable()
export class CryptoService {
  private readonly web3 = new Web3(selectRpcUrl('ethereum'));
  private readonly connection = new Connection(selectRpcUrl('solana'), 'confirmed');
  
  createEthereumWallet(): { address: string, privateKey: string } {
    const accounts = this.web3.eth.accounts.wallet.create(1);
    return { ...accounts[0] };
  }

  createSolanaWallet(): string {
    return Keypair.generate().publicKey.toBase58();
  }
}
