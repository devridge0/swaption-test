import axios from "axios";
import { networks, Pset, Updater, address as liquidAddress, AssetHash, ElementsValue } from "liquidjs-lib";
import { Buffer } from "buffer";

// Blockstream Esplora (Liquid Testnet)
export const ESPLORA_BASE_URL = "https://blockstream.info/liquidtestnet/api";

// Correct network object for Liquid Testnet in liquidjs-lib
export const NETWORK = networks.testnet;

// Liquid Testnet L-BTC asset id exposed by the network object
export const LBTC_ASSET: string = NETWORK.assetHash;

// ---------- Types (Esplora) ----------

export type EsploraUtxo = {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  value?: number;
  asset?: string;
};

export type EsploraTxVout = {
  scriptpubkey: string;
  scriptpubkey_address?: string;
  value?: number;
  asset?: string;
};

export type EsploraTx = {
  txid: string;
  vout: EsploraTxVout[];
};

// ---------- Helpers ----------

export const isValidLiquidTestnetAddress = (addr: string): boolean => {
  return /^tex1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/i.test(addr);
};

export const toSats = (amountLbtc: string | number): number => {
  const n = typeof amountLbtc === "string" ? Number(amountLbtc) : amountLbtc;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e8);
};

export const toLbtc = (sats: number): string => {
  return (sats / 1e8).toFixed(8);
};

export const parseAddressFile = async (file: File): Promise<string> => {
  const text = (await file.text()).trim();
  if (!isValidLiquidTestnetAddress(text)) {
    throw new Error("File does not contain a valid Liquid Testnet address (tex1…).");
  }
  return text;
};

// ---------- Esplora calls ----------

const esplora = axios.create({
  baseURL: ESPLORA_BASE_URL,
  timeout: 15000,
});

export const fetchAddressUtxos = async (address: string): Promise<EsploraUtxo[]> => {
  const { data } = await esplora.get<EsploraUtxo[]>(`/address/${address}/utxo`);
  return data.filter((u) => u.status?.confirmed);
};

export const fetchTx = async (txid: string): Promise<EsploraTx> => {
  const { data } = await esplora.get<EsploraTx>(`/tx/${txid}`);
  return data;
};

export const getAddressLbtcBalanceSats = async (address: string): Promise<number> => {
  const utxos = await fetchAddressUtxos(address);
  if (utxos.length === 0) return 0;

  let total = 0;

  const direct = utxos.filter((u) => typeof u.value === "number" && typeof u.asset === "string");
  for (const u of direct) {
    if (u.asset === LBTC_ASSET) total += u.value as number;
  }

  const missing = utxos.filter((u) => !(typeof u.value === "number" && typeof u.asset === "string"));
  if (missing.length > 0) {
    const txMap = new Map<string, EsploraTx>();
    for (const u of missing) {
      let tx = txMap.get(u.txid);
      if (!tx) {
        tx = await fetchTx(u.txid);
        txMap.set(u.txid, tx);
      }
      const out = tx.vout[u.vout];
      if (out?.asset === LBTC_ASSET && typeof out.value === "number") {
        total += out.value;
      }
    }
  }

  return total;
};

// ---------- PSBT builder ----------

export type BuildFundingPsbtParams = {
  fromAddress: string;
  toAddress: string;
  amountSats: number;
  feeSats?: number;
};

export const buildFundingPsbtBase64 = async (params: BuildFundingPsbtParams): Promise<string> => {
  const { fromAddress, toAddress, amountSats, feeSats = 500 } = params;

  if (!isValidLiquidTestnetAddress(fromAddress)) {
    throw new Error("fromAddress must be a valid Liquid Testnet address (tex1…).");
  }
  if (!isValidLiquidTestnetAddress(toAddress)) {
    throw new Error("toAddress must be a valid Liquid Testnet address (tex1…).");
  }
  if (!Number.isFinite(amountSats) || amountSats <= 0) {
    throw new Error("amountSats must be > 0.");
  }
  if (!Number.isFinite(feeSats) || feeSats < 0) {
    throw new Error("feeSats must be >= 0.");
  }

  const utxos = await fetchAddressUtxos(fromAddress);
  if (utxos.length === 0) {
    throw new Error("No confirmed UTXOs found for the sender address.");
  }

  const lbtcUtxos: Array<EsploraUtxo & { value: number; asset: string }> = [];

  for (const u of utxos) {
    if (typeof u.value === "number" && typeof u.asset === "string" && u.asset === LBTC_ASSET) {
      lbtcUtxos.push(u as any);
    }
  }

  const missing = utxos.filter((u) => !(typeof u.value === "number" && typeof u.asset === "string"));
  if (missing.length > 0) {
    const txCache = new Map<string, EsploraTx>();
    for (const u of missing) {
      let tx = txCache.get(u.txid);
      if (!tx) {
        tx = await fetchTx(u.txid);
        txCache.set(u.txid, tx);
      }
      const vout = tx.vout[u.vout];
      if (vout?.asset === LBTC_ASSET && typeof vout.value === "number") {
        lbtcUtxos.push({
          ...u,
          value: vout.value,
          asset: vout.asset!,
        } as any);
      }
    }
  }

  if (lbtcUtxos.length === 0) {
    throw new Error("No L-BTC UTXOs available to fund the PSBT.");
  }

  const target = amountSats + feeSats;
  const selected: Array<EsploraUtxo & { value: number; asset: string }> = [];
  let totalSelected = 0;
  for (const u of lbtcUtxos.sort((a, b) => (a.value! - b.value!))) {
    selected.push(u);
    totalSelected += u.value!;
    if (totalSelected >= target) break;
  }
  if (totalSelected < target) {
    throw new Error("Insufficient L-BTC to cover amount + fee.");
  }

  // PSETv2 builder
  const pset = new Pset();
  const updater = new Updater(pset);

  const txCache = new Map<string, EsploraTx>();
  const inputs = [] as Parameters<Updater["addInputs"]>[0];
  for (const u of selected) {
    let tx = txCache.get(u.txid);
    if (!tx) {
      tx = await fetchTx(u.txid);
      txCache.set(u.txid, tx);
    }
    const out = tx.vout[u.vout];
    if (!out || typeof out.value !== "number" || !out.asset || !out.scriptpubkey) {
      throw new Error(`Missing UTXO detail for ${u.txid}:${u.vout}`);
    }
    inputs.push({
      txid: u.txid,
      txIndex: u.vout,
      witnessUtxo: {
        script: Buffer.from(out.scriptpubkey, "hex"),
        value: ElementsValue.fromNumber(out.value).bytes,
        asset: AssetHash.fromHex(out.asset).bytes,
        nonce: Buffer.alloc(1, 0),
      },
    });
  }
  updater.addInputs(inputs);

  const outputs = [] as Parameters<Updater["addOutputs"]>[0];
  // contract destination
  outputs.push({
    asset: LBTC_ASSET,
    amount: amountSats,
    script: liquidAddress.toOutputScript(toAddress, NETWORK),
  });
  const change = totalSelected - amountSats - feeSats;
  if (change > 0) {
    outputs.push({
      asset: LBTC_ASSET,
      amount: change,
      script: liquidAddress.toOutputScript(fromAddress, NETWORK),
    });
  }
  updater.addOutputs(outputs);

  return pset.toBase64();
};

// ---------- Broadcast ----------

export const broadcastSignedTransactionHex = async (txHex: string): Promise<string> => {
  const { data } = await esplora.post<string>("/tx", txHex, {
    headers: { "Content-Type": "text/plain" },
  });
  return data;
};


