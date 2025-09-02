import React, { useCallback, useMemo, useState } from "react";
import {
  getAddressLbtcBalanceSats,
  buildFundingPsbtBase64,
  broadcastSignedTransactionHex,
  parseAddressFile,
  toLbtc,
  toSats,
  NETWORK,
  LBTC_ASSET,
  isValidLiquidTestnetAddress,
} from "@/lib/liquid";

type Props = {
  defaultContractAddress?: string;
};

const WalletConnect: React.FC<Props> = ({ defaultContractAddress }) => {
  const [address, setAddress] = useState<string>("");
  const [addressError, setAddressError] = useState<string>("");

  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

  const [contractAddress, setContractAddress] = useState<string>(defaultContractAddress || "");
  const [amountLbtc, setAmountLbtc] = useState<string>("0.001");
  const [feeSats, setFeeSats] = useState<string>("500");

  const [psbtBase64, setPsbtBase64] = useState<string>("");
  const [signedTxHex, setSignedTxHex] = useState<string>("");

  const hasValidAddress = useMemo(() => {
    if (!address) return false;
    return isValidLiquidTestnetAddress(address);
  }, [address]);

  const onPasteAddress = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    if (pasted) {
      setAddress(pasted);
      setAddressError("");
    }
  }, []);

  const onUploadAddressFile = useCallback(async (file: File) => {
    try {
      const addr = await parseAddressFile(file);
      setAddress(addr);
      setAddressError("");
    } catch (err: any) {
      setAddressError(err?.message || "Failed to parse address file.");
    }
  }, []);

  const handleFetchBalance = useCallback(async () => {
    if (!hasValidAddress) {
      setAddressError("Please provide a valid Liquid Testnet address (tex1...).");
      return;
    }
    setIsLoadingBalance(true);
    try {
      const sats = await getAddressLbtcBalanceSats(address);
      setBalanceSats(sats);
    } catch (err: any) {
      setBalanceSats(null);
      setAddressError(err?.message || "Failed to fetch balance.");
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address, hasValidAddress]);

  const handleGeneratePsbt = useCallback(async () => {
    setPsbtBase64("");
    setAddressError("");

    if (!hasValidAddress) {
      setAddressError("Sender address invalid. Use a Liquid Testnet unconfidential address (tex1...).");
      return;
    }
    if (!isValidLiquidTestnetAddress(contractAddress)) {
      setAddressError("Contract address invalid. Must be Liquid Testnet unconfidential (tex1...).");
      return;
    }

    const amountSats = toSats(amountLbtc);
    const fee = Number(feeSats);
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      setAddressError("Enter a positive L-BTC amount.");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      setAddressError("Enter a non-negative fee (sats).");
      return;
    }

    try {
      const base64 = await buildFundingPsbtBase64({
        fromAddress: address,
        toAddress: contractAddress,
        amountSats,
        feeSats: fee,
      });
      setPsbtBase64(base64);
    } catch (err: any) {
      setAddressError(err?.message || "Failed to create PSBT.");
    }
  }, [address, contractAddress, amountLbtc, feeSats, hasValidAddress]);

  const handleDownloadPsbt = useCallback(() => {
    if (!psbtBase64) return;
    const blob = new Blob([psbtBase64], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fund-contract.psbt";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [psbtBase64]);

  const handleCopyPsbt = useCallback(async () => {
    if (!psbtBase64) return;
    await navigator.clipboard.writeText(psbtBase64);
    alert("PSBT (Base64) copied. Import into Sideswap to sign.");
  }, [psbtBase64]);

  const handleUploadSignedTxHex = useCallback(async (file: File) => {
    const text = await file.text();
    setSignedTxHex(text.trim());
  }, []);

  const handleBroadcast = useCallback(async () => {
    if (!signedTxHex) {
      alert("Paste or upload a signed transaction hex first.");
      return;
    }
    const txid = await broadcastSignedTransactionHex(signedTxHex);
    alert(`Broadcasted successfully.\nTXID: ${txid}`);
    setSignedTxHex("");
  }, [signedTxHex]);

  return (
    <section className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Wallet Connection (Liquid Testnet)</h2>
        <p className="text-sm text-gray-600">
          Read-only: provide a public address to view balance. Write/sign: export a PSBT, sign in Sideswap, then broadcast.
        </p>
        <p className="text-xs text-gray-500">
          Network: {NETWORK.bech32} | Asset (L-BTC): {LBTC_ASSET.slice(0, 8)}…{LBTC_ASSET.slice(-8)}
        </p>
      </header>

      <div className="space-y-3 border rounded-md p-4">
        <h3 className="font-medium">1) Provide your Liquid Testnet address (tex1…)</h3>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            className="border rounded px-3 py-2"
            placeholder="tex1qq…"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value.trim());
              setAddressError("");
            }}
            onPaste={onPasteAddress}
            spellCheck={false}
          />

          <div className="flex items-center gap-3">
            <label className="text-sm">
              Or upload a text file containing your address:
              <input
                className="ml-2"
                type="file"
                accept=".txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadAddressFile(f);
                }}
              />
            </label>
            <button
              className="ml-auto bg-gray-900 text-white rounded px-3 py-2 disabled:opacity-50"
              onClick={handleFetchBalance}
              disabled={!hasValidAddress || isLoadingBalance}
            >
              {isLoadingBalance ? "Fetching…" : "Fetch Balance"}
            </button>
          </div>

          {addressError && <p className="text-sm text-red-600">{addressError}</p>}

          {balanceSats !== null && (
            <div className="text-sm">
              <span className="font-mono">
                {toLbtc(balanceSats)} L-BTC ({balanceSats} sats)
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border rounded-md p-4">
        <h3 className="font-medium">2) Generate PSBT to fund a contract</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3">
            <label className="text-sm">Contract address (recipient, tex1…)</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              placeholder="tex1q… (unconfidential)"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value.trim())}
              spellCheck={false}
            />
          </div>
          <div>
            <label className="text-sm">Amount (L-BTC)</label>
            <input
              type="number"
              min="0"
              step="0.00000001"
              className="w-full border rounded px-3 py-2"
              value={amountLbtc}
              onChange={(e) => setAmountLbtc(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm">Fee (sats)</label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full border rounded px-3 py-2"
              value={feeSats}
              onChange={(e) => setFeeSats(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              className="bg-emerald-600 text-white rounded px-3 py-2 w-full"
              onClick={handleGeneratePsbt}
            >
              Create PSBT
            </button>
          </div>
        </div>

        {psbtBase64 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Export the PSBT and sign it in Sideswap (import PSBT from Base64 or file).
            </p>
            <textarea
              className="w-full border rounded p-2 font-mono text-xs"
              rows={6}
              readOnly
              value={psbtBase64}
            />
            <div className="flex gap-2">
              <button className="border rounded px-3 py-2" onClick={handleCopyPsbt}>
                Copy Base64
              </button>
              <button className="border rounded px-3 py-2" onClick={handleDownloadPsbt}>
                Download .psbt
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 border rounded-md p-4">
        <h3 className="font-medium">3) Broadcast signed transaction</h3>
        <p className="text-sm text-gray-600">
          After signing the PSBT in Sideswap, export the final transaction (raw hex) and paste or upload it:
        </p>
        <div className="flex flex-col gap-2">
          <textarea
            className="w-full border rounded p-2 font-mono text-xs"
            rows={5}
            placeholder="Paste signed raw transaction hex"
            value={signedTxHex}
            onChange={(e) => setSignedTxHex(e.target.value.trim())}
          />
          <label className="text-sm">
            Or upload a text file containing the signed transaction hex:
            <input
              className="ml-2"
              type="file"
              accept=".txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadSignedTxHex(f);
              }}
            />
          </label>
          <div>
            <button className="bg-gray-900 text-white rounded px-3 py-2" onClick={handleBroadcast}>
              Broadcast
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WalletConnect;


