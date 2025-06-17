import { ContractAbi as ERC20Abi } from 'web3';

export const contractAbi: ERC20Abi = [
  {
    name: 'transfer',
    type: 'function',
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    payable: false,
  },
  {
    name: 'balanceOf',
    type: 'function',
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    payable: false,
  },
];

export enum USDCTokenAddress {
  BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  SOLANA_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  SOLANA_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
}

export enum ChainRPC {
  BASE_SEPOLIA = 'https://base-sepolia.g.alchemy.com/v2',
  BASE_MAINNET = 'https://base-mainnet.g.alchemy.com/v2',
  SOLANA_DEVNET = 'https://devnet.helius-rpc.com?api-key',
  SOLANA_MAINNET = 'https://mainnet.helius-rpc.com?api-key',
}
