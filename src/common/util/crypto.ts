import { Secrets } from "../env";
import { Chain } from "../types";

export const selectRpcUrl = (chain: Chain, mode: 'http' | 'websocket'): string => {
  let url: string;

  mode === 'http' ? url = 'https://' : url = 'wss://'

  if (Secrets.NODE_ENV === 'production') {
    chain === 'base'
      ? url += `base-mainnet.g.alchemy.com/v2/${Secrets.ALCHEMY_API_KEY}`
      : url += `mainnet.helius-rpc.com?api-key=${Secrets.HELIUS_API_KEY}`
  };

  if (Secrets.NODE_ENV === 'development' || "test") {
    chain === 'base'
      ? url += `base-sepolia.g.alchemy.com/v2/${Secrets.ALCHEMY_API_KEY}`
      : url += `devnet.helius-rpc.com?api-key=${Secrets.HELIUS_API_KEY}`
  };

  return url;
}

export const selectUSDCTokenAddress = (chain: Chain): string => {
  let address: string;

  if (Secrets.NODE_ENV === 'production') {
    chain === 'base'
      ? address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      : address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  };

  if (Secrets.NODE_ENV === 'development' || "test") {
    chain === 'base'
      ? address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      : address = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
  };

  return address;
}