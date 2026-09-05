import { useState, useEffect, useCallback, useRef } from "react";
import { init as initMiniAppSdk } from "@nimiq/mini-app-sdk";
import HubApi from "@nimiq/hub-api";
import {
  NIMIQ_HUB_URL,
  DEFAULT_TREASURY_ADDRESS,
  NIM_STAKE_LUNA,
  NIMSTREAK_STORAGE_KEY,
  NIMIQ_NETWORK,
} from "../config/nimiq.js";
import {
  formatNimiqAddress,
  shortenNimiqAddress,
  isNimiqAddress,
  getNimiqAvatar,
} from "../utils/ui-helpers.js";

const RPC_URL =
  NIMIQ_NETWORK === "testnet"
    ? "https://rpc.testnet.nimiqwatch.com"
    : "https://rpc.nimiqwatch.com";

const WATCH_API_URL =
  NIMIQ_NETWORK === "testnet"
    ? "https://api.testnet.nimiq.watch"
    : "https://api.nimiq.watch";

async function fetchTransactionData(txHash, maxAttempts = 6, delayMs = 600) {
  const cleanHash = String(txHash || "").trim().toLowerCase();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHash)) return null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. Try Nimiq JSON-RPC
    try {
      const rpcRes = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "getTransactionByHash",
          params: [cleanHash],
          id: Date.now(),
        }),
      });
      if (rpcRes.ok) {
        const json = await rpcRes.json();
        if (json?.result?.data) {
          return json.result.data;
        }
      }
    } catch (rpcErr) {
      console.debug(`[useNimiqWallet] RPC attempt ${attempt} notice:`, rpcErr?.message || rpcErr);
    }

    // 2. Try api.nimiq.watch REST endpoint
    try {
      const restRes = await fetch(`${WATCH_API_URL}/transaction/${cleanHash}`);
      if (restRes.ok) {
        const json = await restRes.json();
        if (json && !json.error && (json.from || json.sender)) {
          return json;
        }
      }
    } catch (restErr) {
      console.debug(`[useNimiqWallet] REST attempt ${attempt} notice:`, restErr?.message || restErr);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

const STORAGE_KEY = NIMSTREAK_STORAGE_KEY || "nimstreak_wallet_address";
const PREFERRED_WALLET_KEY = "nimstreak_preferred_wallet";

function getStoredWalletAddress() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function getPreferredWalletAddress() {
  try {
    return localStorage.getItem(PREFERRED_WALLET_KEY) || "";
  } catch {
    return "";
  }
}

function persistWalletAddress(address) {
  try {
    if (address) {
      localStorage.setItem(STORAGE_KEY, address);
      localStorage.setItem(PREFERRED_WALLET_KEY, address);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

function clearStoredWalletAddress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

let hubApiInstance = null;
function getHubApi() {
  if (typeof window === "undefined") return null;
  if (!hubApiInstance) {
    try {
      hubApiInstance = new HubApi(NIMIQ_HUB_URL || "https://hub.nimiq.com");
    } catch (err) {
      console.warn("Could not instantiate Nimiq HubApi:", err);
      hubApiInstance = null;
    }
  }
  return hubApiInstance;
}

export function useNimiqWallet() {
  const [walletAddress, setWalletAddress] = useState(getStoredWalletAddress);
  const [nimBalance, setNimBalance] = useState(0);
  const [walletStatus, setWalletStatus] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isNimiqPay, setIsNimiqPay] = useState(false);
  const sdkProviderRef = useRef(null);

  // Initialize and get the official Mini App SDK provider
  // window.nimiqPay is injected by Nimiq Pay before page scripts run.
  // If it's absent we know we're in a regular browser and can skip the
  // 10-second init() timeout for an instant Hub fallback.
  const getSdkProvider = useCallback(async () => {
    if (sdkProviderRef.current) return sdkProviderRef.current;
    if (typeof window === "undefined") return null;
    if (!window.nimiqPay) return null; // Not inside Nimiq Pay — skip SDK

    try {
      const sdk = await initMiniAppSdk();
      if (sdk && typeof sdk.listAccounts === "function") {
        sdkProviderRef.current = sdk;
        setIsNimiqPay(true);
        return sdk;
      }
    } catch (err) {
      // Inside Nimiq Pay but SDK init failed — log and fall through
      console.debug("Mini App SDK init notice:", err?.message || err);
    }
    return null;
  }, []);

  const getNimiqProvider = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (window.nimiq && typeof window.nimiq === "object") return window.nimiq;
    return null;
  }, []);

  const fetchBalance = useCallback(async (address) => {
    if (!address || !isNimiqAddress(address)) return;
    try {
      const cleanAddress = address.replace(/\s+/g, "");
      const res = await fetch(`https://api.nimiq.watch/account/${cleanAddress}`);
      if (res.ok) {
        const data = await res.json();
        const balanceLuna = typeof data?.balance === "number" ? data.balance : 0;
        const balanceNim = balanceLuna / NIM_STAKE_LUNA;
        setNimBalance(Number(balanceNim.toFixed(2)));
      }
    } catch {
      // Keep previous balance on network hiccup
    }
  }, []);

  // Check stored address on mount
  useEffect(() => {
    const stored = getStoredWalletAddress();
    if (stored && isNimiqAddress(stored)) {
      setWalletAddress(stored);
      fetchBalance(stored);
    }
  }, [fetchBalance]);

  // Connect Wallet Action (Requests explicit user approval)
  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setWalletStatus("Connecting to Nimiq...");

    try {
      // 1. Official Nimiq Mini App SDK (inside Nimiq Pay WebView)
      const sdk = await getSdkProvider();
      if (sdk && typeof sdk.listAccounts === "function") {
        const accounts = await sdk.listAccounts();
        if (Array.isArray(accounts) && accounts.length > 0) {
          // Read previously stored / preferred account
          const candidateStored = getStoredWalletAddress() || getPreferredWalletAddress();
          const cleanStored = candidateStored ? candidateStored.replace(/\s+/g, "").toUpperCase() : "";

          let selectedRawAddr = null;

          // If a stored wallet exists and is a valid Nimiq address, check if it matches an account in Nimiq Pay
          if (cleanStored && isNimiqAddress(cleanStored)) {
            const matchingAcc = accounts.find((acc) => {
              const accStr = typeof acc === "string" ? acc : acc?.address || "";
              return accStr.replace(/\s+/g, "").toUpperCase() === cleanStored;
            });
            if (matchingAcc) {
              selectedRawAddr = typeof matchingAcc === "string" ? matchingAcc : matchingAcc?.address;
            }
          }

          // Fall back to accounts[0] if no stored address or stored address no longer in accounts
          if (!selectedRawAddr) {
            selectedRawAddr = typeof accounts[0] === "string" ? accounts[0] : accounts[0]?.address;
          }

          if (selectedRawAddr && isNimiqAddress(selectedRawAddr)) {
            const formatted = formatNimiqAddress(selectedRawAddr);
            persistWalletAddress(formatted);
            setWalletAddress(formatted);
            setIsNimiqPay(true);
            setWalletStatus(`Connected via Nimiq Pay as ${shortenNimiqAddress(formatted)}`);
            await fetchBalance(formatted);
            setIsConnecting(false);
            return formatted;
          }
        }
      }

      // 2. Injected window.nimiq Provider
      const injectedNimiq = getNimiqProvider();
      if (injectedNimiq) {
        let rawAccounts = [];
        if (typeof injectedNimiq.listAccounts === "function") {
          const accs = await injectedNimiq.listAccounts();
          if (Array.isArray(accs)) rawAccounts = accs;
        } else if (typeof injectedNimiq.request === "function") {
          const accs = await injectedNimiq.request({ method: "nimiq_requestAccounts" }).catch(() => null);
          if (Array.isArray(accs)) rawAccounts = accs;
          else if (accs) rawAccounts = [accs];
        } else if (typeof injectedNimiq.connect === "function") {
          const res = await injectedNimiq.connect();
          const resAddr = res?.address || res?.account || res || "";
          if (resAddr) rawAccounts = [resAddr];
        }

        if (rawAccounts.length > 0) {
          const candidateStored = getStoredWalletAddress() || getPreferredWalletAddress();
          const cleanStored = candidateStored ? candidateStored.replace(/\s+/g, "").toUpperCase() : "";

          let selectedAddr = null;
          if (cleanStored && isNimiqAddress(cleanStored)) {
            const matching = rawAccounts.find((acc) => {
              const str = typeof acc === "string" ? acc : acc?.address || "";
              return str.replace(/\s+/g, "").toUpperCase() === cleanStored;
            });
            if (matching) {
              selectedAddr = typeof matching === "string" ? matching : matching?.address;
            }
          }

          if (!selectedAddr) {
            selectedAddr = typeof rawAccounts[0] === "string" ? rawAccounts[0] : rawAccounts[0]?.address;
          }

          if (selectedAddr && isNimiqAddress(selectedAddr)) {
            const formatted = formatNimiqAddress(selectedAddr);
            persistWalletAddress(formatted);
            setWalletAddress(formatted);
            // Do NOT set isNimiqPay here — window.nimiq may exist outside Nimiq Pay
            setWalletStatus(`Connected as ${shortenNimiqAddress(formatted)}`);
            await fetchBalance(formatted);
            setIsConnecting(false);
            return formatted;
          }
        }
      }

      // 3. Official Nimiq Hub API (External / Browser fallback)
      const hub = getHubApi();
      if (hub && typeof hub.chooseAddress === "function") {
        setWalletStatus("Opening Nimiq Hub sign in...");
        const result = await hub.chooseAddress({ appName: "NimStreak" });
        const addr =
          result?.address ||
          result?.account?.address ||
          (Array.isArray(result?.addresses) && result.addresses[0]?.address) ||
          "";

        if (addr && isNimiqAddress(addr)) {
          const formatted = formatNimiqAddress(addr);
          persistWalletAddress(formatted);
          setWalletAddress(formatted);
          setWalletStatus(`Signed in as ${shortenNimiqAddress(formatted)}`);
          await fetchBalance(formatted);
          setIsConnecting(false);
          return formatted;
        }
      }

      setWalletStatus("Wallet connection cancelled or unavailable.");
      setIsConnecting(false);
      return null;
    } catch (err) {
      console.warn("Wallet sign-in cancelled or error:", err);
      setWalletStatus(err.message || "Wallet sign-in cancelled.");
      setIsConnecting(false);
      return null;
    }
  }, [fetchBalance, getNimiqProvider, getSdkProvider]);

  // Real Nimiq Staking / Payment Execution
  const sendPayment = useCallback(
    async ({ recipient, amountNim, message }) => {
      const targetRecipient = (recipient || DEFAULT_TREASURY_ADDRESS).replace(/\s+/g, "");
      const valueLuna = Math.round(Number(amountNim) * NIM_STAKE_LUNA);

      if (!valueLuna || valueLuna <= 0) {
        throw new Error("Invalid stake amount: must be greater than 0");
      }
      if (!isNimiqAddress(targetRecipient)) {
        throw new Error(`Invalid recipient address: ${targetRecipient}`);
      }

      // 1. Try Official Mini App SDK Provider
      const sdk = await getSdkProvider();
      if (sdk) {
        let txResult = null;
        if (message && typeof sdk.sendBasicTransactionWithData === "function") {
          txResult = await sdk.sendBasicTransactionWithData({
            recipient: targetRecipient,
            value: valueLuna,
            data: message,
            fee: 0,
          });
        } else if (typeof sdk.sendBasicTransaction === "function") {
          txResult = await sdk.sendBasicTransaction({
            recipient: targetRecipient,
            value: valueLuna,
            fee: 0,
          });
        }

        if (txResult) {
          if (typeof txResult === "object" && txResult.error) {
            throw new Error(txResult.error.message || "Transaction rejected by Nimiq Pay.");
          }
          const cleanTxHash = String(typeof txResult === "string" ? txResult : txResult.hash || "").trim();
          if (!cleanTxHash) {
            throw new Error("No transaction hash returned from Nimiq Pay.");
          }

          // Fetch on-chain transaction details to determine the true sender account
          const txData = await fetchTransactionData(cleanTxHash);

          let actualSender = null;
          if (txData) {
            const rawSender = txData.from || txData.sender;
            if (rawSender && isNimiqAddress(rawSender)) {
              const formattedSender = formatNimiqAddress(rawSender);
              const cleanActual = formattedSender.replace(/\s+/g, "").toUpperCase();

              // Verify that the actual sender belongs to accounts returned by sdk.listAccounts()
              let accounts = [];
              try {
                const listRes = await sdk.listAccounts();
                if (Array.isArray(listRes)) {
                  accounts = listRes;
                }
              } catch (listErr) {
                console.warn("[useNimiqWallet] Could not retrieve accounts list for verification:", listErr);
              }

              const accountMatches = accounts.some((acc) => {
                const cleanAcc = (typeof acc === "string" ? acc : acc?.address || "")
                  .replace(/\s+/g, "")
                  .toUpperCase();
                return cleanAcc === cleanActual;
              });

              if (!accountMatches) {
                throw new Error(
                  `Payment transaction sender (${formattedSender}) does not match any connected Nimiq Pay account.`
                );
              }

              actualSender = formattedSender;

              // Reconcile hook state and localStorage with actual paying account
              persistWalletAddress(actualSender);
              setWalletAddress(actualSender);
              setWalletStatus(`Connected via Nimiq Pay as ${shortenNimiqAddress(actualSender)}`);

              // Refresh wallet balance using actual sender
              await fetchBalance(actualSender);
            }
          }

          return {
            hash: cleanTxHash,
            sender: actualSender || walletAddress,
          };
        }
      }

      // 2. Try Injected window.nimiq Provider
      const injectedNimiq = getNimiqProvider();
      if (injectedNimiq) {
        let txResult = null;
        if (message && typeof injectedNimiq.sendBasicTransactionWithData === "function") {
          txResult = await injectedNimiq.sendBasicTransactionWithData({
            recipient: targetRecipient,
            value: valueLuna,
            data: message,
            fee: 0,
          });
        } else if (typeof injectedNimiq.sendBasicTransaction === "function") {
          txResult = await injectedNimiq.sendBasicTransaction({
            recipient: targetRecipient,
            value: valueLuna,
            fee: 0,
          });
        }
        if (txResult) {
          const cleanTxHash = String(typeof txResult === "string" ? txResult : txResult.hash || "").trim();
          return { hash: cleanTxHash, sender: walletAddress };
        }
      }

      // 3. Try Nimiq Hub Checkout (Desktop / Browser)
      const hub = getHubApi();
      if (hub && typeof hub.checkout === "function") {
        const checkoutRes = await hub.checkout({
          appName: "NimStreak",
          recipient: targetRecipient,
          value: valueLuna,
          fee: 0,
          extraData: message || undefined,
        });

        const hash =
          checkoutRes?.hash ||
          checkoutRes?.transactionHash ||
          checkoutRes?.serializedTx;

        if (hash) {
          const cleanHash = String(hash).trim();
          const hubSender = checkoutRes?.address || checkoutRes?.account?.address;
          const finalSender = hubSender && isNimiqAddress(hubSender)
            ? formatNimiqAddress(hubSender)
            : walletAddress;
          return { hash: cleanHash, sender: finalSender };
        }
      }

      throw new Error(
        "Nimiq payment provider not available. Please open inside Nimiq Pay or connect a Nimiq wallet to stake."
      );
    },
    [getSdkProvider, getNimiqProvider, fetchBalance, walletAddress]
  );

  // Connect with manual / pasted Nimiq address
  const setManualAddress = useCallback(
    (address) => {
      if (!address || !isNimiqAddress(address)) {
        throw new Error("Invalid Nimiq address. Format: NQxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx");
      }
      const formatted = formatNimiqAddress(address);
      persistWalletAddress(formatted);
      setWalletAddress(formatted);
      setWalletStatus(`Connected as ${shortenNimiqAddress(formatted)}`);
      fetchBalance(formatted);
      return formatted;
    },
    [fetchBalance]
  );

  // Disconnect Wallet Action
  const disconnectWallet = useCallback(() => {
    setWalletAddress("");
    setNimBalance(0);
    setWalletStatus("Wallet disconnected.");
    clearStoredWalletAddress();
  }, []);

  return {
    address: walletAddress,
    walletAddress,
    formattedAddress: formatNimiqAddress(walletAddress),
    shortenedAddress: shortenNimiqAddress(walletAddress),
    avatarUrl: getNimiqAvatar(walletAddress),
    balance: nimBalance,
    nimBalance,
    walletStatus,
    isNimiqPay,
    isConnecting,
    walletReady: Boolean(walletAddress),
    connect: connectWallet,
    connectWallet,
    disconnect: disconnectWallet,
    disconnectWallet,
    setManualAddress,
    pay: sendPayment,
    sendPayment,
    refetchBalance: () => fetchBalance(walletAddress),
  };
}
