import { useState, useEffect, useCallback, useRef } from "react";
import { init as initMiniAppSdk } from "@nimiq/mini-app-sdk";
import HubApi from "@nimiq/hub-api";
import {
  NIMIQ_HUB_URL,
  DEFAULT_TREASURY_ADDRESS,
  NIM_STAKE_LUNA,
  NIMSTREAK_STORAGE_KEY,
} from "../config/nimiq.js";
import {
  formatNimiqAddress,
  shortenNimiqAddress,
  isNimiqAddress,
  getNimiqAvatar,
} from "../utils/ui-helpers.js";

const STORAGE_KEY = NIMSTREAK_STORAGE_KEY || "nimstreak_wallet_address";

function getStoredWalletAddress() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persistWalletAddress(address) {
  try {
    if (address) {
      localStorage.setItem(STORAGE_KEY, address);
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
        const rawAddr = Array.isArray(accounts) && accounts.length > 0
          ? (typeof accounts[0] === "string" ? accounts[0] : accounts[0]?.address)
          : null;

        if (rawAddr && isNimiqAddress(rawAddr)) {
          const formatted = formatNimiqAddress(rawAddr);
          persistWalletAddress(formatted);
          setWalletAddress(formatted);
          setIsNimiqPay(true);
          setWalletStatus(`Connected via Nimiq Pay as ${shortenNimiqAddress(formatted)}`);
          await fetchBalance(formatted);
          setIsConnecting(false);
          return formatted;
        }
      }

      // 2. Injected window.nimiq Provider
      const injectedNimiq = getNimiqProvider();
      if (injectedNimiq) {
        let addr = "";
        if (typeof injectedNimiq.listAccounts === "function") {
          const accounts = await injectedNimiq.listAccounts();
          addr = Array.isArray(accounts) && accounts.length > 0
            ? (accounts[0]?.address || accounts[0])
            : "";
        } else if (typeof injectedNimiq.request === "function") {
          const accounts = await injectedNimiq.request({ method: "nimiq_requestAccounts" }).catch(() => null);
          addr = Array.isArray(accounts) ? accounts[0] : accounts || "";
        } else if (typeof injectedNimiq.connect === "function") {
          const res = await injectedNimiq.connect();
          addr = res?.address || res?.account || res || "";
        }

        if (addr && isNimiqAddress(addr)) {
          const formatted = formatNimiqAddress(addr);
          persistWalletAddress(formatted);
          setWalletAddress(formatted);
          // Do NOT set isNimiqPay here — window.nimiq may exist outside Nimiq Pay
          setWalletStatus(`Connected as ${shortenNimiqAddress(formatted)}`);
          await fetchBalance(formatted);
          setIsConnecting(false);
          return formatted;
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
        if (message && typeof sdk.sendBasicTransactionWithData === "function") {
          const txHash = await sdk.sendBasicTransactionWithData({
            recipient: targetRecipient,
            value: valueLuna,
            data: message,
            fee: 0,
          });
          if (txHash) return { hash: txHash };
        } else if (typeof sdk.sendBasicTransaction === "function") {
          const txHash = await sdk.sendBasicTransaction({
            recipient: targetRecipient,
            value: valueLuna,
            fee: 0,
          });
          if (txHash) return { hash: txHash };
        }
      }

      // 2. Try Injected window.nimiq Provider
      const injectedNimiq = getNimiqProvider();
      if (injectedNimiq) {
        if (message && typeof injectedNimiq.sendBasicTransactionWithData === "function") {
          const txHash = await injectedNimiq.sendBasicTransactionWithData({
            recipient: targetRecipient,
            value: valueLuna,
            data: message,
            fee: 0,
          });
          if (txHash) return { hash: txHash };
        } else if (typeof injectedNimiq.sendBasicTransaction === "function") {
          const txHash = await injectedNimiq.sendBasicTransaction({
            recipient: targetRecipient,
            value: valueLuna,
            fee: 0,
          });
          if (txHash) return { hash: txHash };
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

        if (hash) return { hash };
      }

      throw new Error(
        "Nimiq payment provider not available. Please open inside Nimiq Pay or connect a Nimiq wallet to stake."
      );
    },
    [getSdkProvider, getNimiqProvider]
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
