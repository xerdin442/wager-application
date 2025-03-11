import { Secrets } from "../env";

export const selectRpcUrl = (chain: 'ethereum' | 'solana'): string => {
  let url: string;

  if (Secrets.NODE_ENV === 'production') {
    chain === 'ethereum' ? url = Secrets.ETHEREUM_MAINNET_RPC_URL : url = Secrets.SOLANA_MAINNET_RPC_URL
  };

  if (Secrets.NODE_ENV === 'development' || "test") {
    chain === 'ethereum' ? url = Secrets.ETHEREUM_DEVNET_RPC_URL : url = Secrets.SOLANA_DEVNET_RPC_URL
  };

  return url;
}