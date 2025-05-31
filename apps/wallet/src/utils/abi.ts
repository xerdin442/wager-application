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
