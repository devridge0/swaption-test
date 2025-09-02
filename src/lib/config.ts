// Centralized runtime configuration with sensible defaults

export const SIDE_SWAP_WS_URL: string =
  (import.meta as any)?.env?.VITE_SIDE_SWAP_WS_URL ?? "wss://api.sideswap.io/json-rpc-ws";


export const SIDE_SWAP_TESTNET_URL: string =
  (import.meta as any)?.env?.VITE_SIDE_SWAP_TESTNET_URL ?? "https://api-testnet.sideswap.io/payjoin";

// BTC/USDT asset identifiers; override via env if needed
export const SIDE_SWAP_BASE_ASSET_ID: string =
  (import.meta as any)?.env?.VITE_SIDE_SWAP_BASE_ASSET_ID ??
  "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d";

export const SIDE_SWAP_QUOTE_ASSET_ID: string =
  (import.meta as any)?.env?.VITE_SIDE_SWAP_QUOTE_ASSET_ID ??
  "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";


