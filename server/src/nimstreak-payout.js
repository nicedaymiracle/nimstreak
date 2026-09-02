import * as Nimiq from "@nimiq/core";
import dotenv from "dotenv";

dotenv.config();

const NIMIQ_NETWORK = (process.env.NIMIQ_NETWORK || "mainnet").toLowerCase();
const defaultRpcUrl = NIMIQ_NETWORK === "testnet"
  ? "https://rpc.testnet.nimiqwatch.com"
  : "https://rpc.nimiqwatch.com";
const defaultNetworkId = NIMIQ_NETWORK === "testnet" ? 5 : 1;

const NIMIQ_RPC_URL = process.env.NIMIQ_RPC_URL || defaultRpcUrl;
const TREASURY_ADDRESS = (process.env.NIMIQ_TREASURY_ADDRESS || "NQ68 LS47 5LF6 C7CU MVB6 KL55 YSFG PEXJ ADJ0").trim();
const TREASURY_PRIVATE_KEY = (process.env.NIMIQ_TREASURY_PRIVATE_KEY || "").trim();
const TREASURY_FEE_PERCENT = parseInt(process.env.TREASURY_FEE_PERCENT || "10", 10);
const NIMIQ_NETWORK_ID = parseInt(process.env.NIMIQ_NETWORK_ID || String(defaultNetworkId), 10); // 1 = mainnet, 5 = testnet

export const LUNA_PER_NIM = 100000n;

export function isNimiqAddress(value) {
  const v = String(value || "").trim().replace(/\s+/g, "").toUpperCase();
  return /^NQ[0-9A-Z]{34}$/.test(v);
}

export function normalizeAddress(addr) {
  return String(addr || "").trim().replace(/\s+/g, "").toUpperCase();
}

export function nimToLuna(nim) {
  const num = Number(nim);
  if (isNaN(num) || num < 0) return 0n;
  return BigInt(Math.round(num * 100000));
}

export function lunaToNim(luna) {
  const bi = typeof luna === "bigint" ? luna : BigInt(luna || 0);
  return Number(bi) / 100000;
}

/**
 * Pure integer Luna calculation for challenge forfeiture and finisher payouts.
 * Uses deterministic integer arithmetic with explicit remainder handling.
 */
export function calculatePayouts(participants = [], totalPoolInput = null) {
  const quitters = participants.filter((p) => p.status === "failed");
  const finishers = participants.filter((p) => p.status === "completed" || p.status === "active");

  const totalPoolLuna = totalPoolInput !== null
    ? nimToLuna(totalPoolInput)
    : participants.reduce(
        (sum, p) => sum + (p.stake_luna ? BigInt(p.stake_luna) : nimToLuna(p.stake_amount || p.stake_nim || 0)),
        0n
      );

  const quitterPoolLuna = quitters.reduce(
    (sum, p) => sum + (p.stake_luna ? BigInt(p.stake_luna) : nimToLuna(p.stake_amount || p.stake_nim || 0)),
    0n
  );

  const feePercentBig = BigInt(Math.max(0, Math.min(100, TREASURY_FEE_PERCENT)));
  const treasuryFeeLuna = (quitterPoolLuna * feePercentBig) / 100n;
  const distributableBonusLuna = quitterPoolLuna - treasuryFeeLuna;

  const finisherCount = BigInt(finishers.length);
  const bonusPerFinisherLuna = finisherCount > 0n ? distributableBonusLuna / finisherCount : 0n;
  const remainderLuna = finisherCount > 0n ? distributableBonusLuna % finisherCount : 0n;

  const payouts = finishers.map((p) => {
    const stakeLuna = p.stake_luna ? BigInt(p.stake_luna) : nimToLuna(p.stake_amount || p.stake_nim || 0);
    const totalLuna = stakeLuna + bonusPerFinisherLuna;

    return {
      wallet_address: p.wallet_address,
      stake_return_luna: stakeLuna.toString(),
      stake_return_nim: lunaToNim(stakeLuna),
      bonus_luna: bonusPerFinisherLuna.toString(),
      bonus_nim: lunaToNim(bonusPerFinisherLuna),
      total_luna: totalLuna.toString(),
      total_nim: lunaToNim(totalLuna),
      payout_type: "stake_return_plus_bonus",
    };
  });

  return {
    payouts,
    totalPoolLuna: totalPoolLuna.toString(),
    totalPoolNim: lunaToNim(totalPoolLuna),
    quitterPoolLuna: quitterPoolLuna.toString(),
    quitterPoolNim: lunaToNim(quitterPoolLuna),
    treasuryFeeLuna: treasuryFeeLuna.toString(),
    treasuryFeeNim: lunaToNim(treasuryFeeLuna),
    distributableBonusLuna: distributableBonusLuna.toString(),
    distributableBonusNim: lunaToNim(distributableBonusLuna),
    remainderLuna: remainderLuna.toString(),
    finisherCount: finishers.length,
    quitterCount: quitters.length,
    estimatedBonusPerFinisher: lunaToNim(bonusPerFinisherLuna),
  };
}

/**
 * Verify a client-submitted stake transaction on the Nimiq network.
 * Verifies on-chain existence, sender, recipient, value, and execution status.
 */
export async function verifyStakeTransaction({
  txHash,
  senderAddress,
  expectedStakeNim,
  expectedStakeLuna = null,
  treasuryAddress = TREASURY_ADDRESS,
}) {
  const cleanHash = String(txHash || "").trim().toLowerCase();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHash)) {
    throw new Error(`Invalid Nimiq transaction hash format: "${txHash}"`);
  }

  const expectedLuna = expectedStakeLuna !== null ? BigInt(expectedStakeLuna) : nimToLuna(expectedStakeNim);
  const normalizedSender = normalizeAddress(senderAddress);
  const normalizedTreasury = normalizeAddress(treasuryAddress);

  // Development bypass ONLY if explicitly enabled in environment
  if (process.env.SKIP_TX_VERIFICATION === "true") {
    console.warn(`[verification:bypass] WARNING: SKIP_TX_VERIFICATION is enabled. Accepting tx ${cleanHash}`);
    return {
      verified: true,
      txHash: cleanHash,
      from: normalizedSender,
      to: normalizedTreasury,
      valueLuna: Number(expectedLuna),
      bypassed: true,
    };
  }

  // Fetch transaction details from Nimiq JSON-RPC
  let txData = null;
  try {
    const rpcRes = await fetch(NIMIQ_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getTransactionByHash",
        params: [cleanHash],
        id: Date.now(),
      }),
    });

    const json = await rpcRes.json();
    if (json.result && json.result.data) {
      txData = json.result.data;
    }
  } catch (rpcErr) {
    console.warn(`[verification] RPC getTransactionByHash notice (${rpcErr.message})`);
  }

  // Fallback: try api.nimiq.watch REST endpoint
  if (!txData) {
    try {
      const restRes = await fetch(`https://api.nimiq.watch/transaction/${cleanHash}`);
      if (restRes.ok) {
        const json = await restRes.json();
        if (json && !json.error) {
          txData = json;
        }
      }
    } catch (restErr) {
      console.warn(`[verification] REST fallback notice (${restErr.message})`);
    }
  }

  if (!txData) {
    throw new Error(`Transaction ${cleanHash} not found on the Nimiq network. Please wait for confirmation.`);
  }

  const actualFrom = normalizeAddress(txData.from || txData.sender);
  const actualTo = normalizeAddress(txData.to || txData.recipient);
  const actualValueLuna = BigInt(txData.value || 0);
  const executionResult = txData.executionResult !== undefined ? txData.executionResult : true;

  if (!executionResult) {
    throw new Error(`Transaction ${cleanHash} failed execution on the blockchain.`);
  }

  if (actualFrom !== normalizedSender) {
    throw new Error(
      `Transaction sender mismatch: Expected ${normalizedSender}, but transaction was sent from ${actualFrom}.`
    );
  }

  if (actualTo !== normalizedTreasury) {
    throw new Error(
      `Transaction recipient mismatch: Expected treasury ${normalizedTreasury}, but transaction was sent to ${actualTo}.`
    );
  }

  if (actualValueLuna < expectedLuna) {
    throw new Error(
      `Transaction amount insufficient: Expected ${expectedLuna} Luna (${lunaToNim(expectedLuna)} NIM), but transaction transferred ${actualValueLuna} Luna.`
    );
  }

  return {
    verified: true,
    txHash: cleanHash,
    from: actualFrom,
    to: actualTo,
    valueLuna: Number(actualValueLuna),
    blockNumber: txData.blockNumber,
  };
}

/**
 * Construct, sign with treasury keypair, and broadcast a real payout transaction.
 */
export async function sendStreakPayout({ to, amountNim, amountLuna = null, payoutType = "stake_return_plus_bonus" }) {
  if (!isNimiqAddress(to)) {
    throw new Error(`Invalid Nimiq recipient address: "${to}"`);
  }

  const finalLuna = amountLuna !== null ? BigInt(amountLuna) : nimToLuna(amountNim);
  if (finalLuna <= 0n) {
    throw new Error(`Payout amount must be greater than zero Luna. Received: ${finalLuna}`);
  }

  if (!TREASURY_PRIVATE_KEY) {
    throw new Error(
      "NIMIQ_TREASURY_PRIVATE_KEY is not configured on the server. Cannot sign and broadcast real payout."
    );
  }

  console.log(`[treasury:payout] Preparing payout of ${finalLuna} Luna (${lunaToNim(finalLuna)} NIM) to ${to} (${payoutType})`);

  // 1. Derive treasury KeyPair
  const cleanPrivKeyHex = TREASURY_PRIVATE_KEY.replace(/^0x/, "").trim();
  const privKey = Nimiq.PrivateKey.fromHex(cleanPrivKeyHex);
  const keyPair = Nimiq.KeyPair.derive(privKey);
  const senderAddress = keyPair.toAddress();

  // 2. Fetch current block height for validityStartHeight
  let blockNumber = 1;
  try {
    const blockRes = await fetch(NIMIQ_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getBlockNumber",
        params: [],
        id: Date.now(),
      }),
    });
    const blockJson = await blockRes.json();
    if (blockJson.result && typeof blockJson.result.data === "number") {
      blockNumber = blockJson.result.data;
    } else if (typeof blockJson.result === "number") {
      blockNumber = blockJson.result;
    }
  } catch (err) {
    console.warn(`[treasury:payout] Could not query block number (${err.message}). Using 1.`);
  }

  // 3. Construct and sign transaction
  const recipientAddress = Nimiq.Address.fromString(to.replace(/\s+/g, ""));
  const tx = Nimiq.TransactionBuilder.newBasic(
    senderAddress,
    recipientAddress,
    finalLuna,
    0n, // fee in Luna
    blockNumber,
    NIMIQ_NETWORK_ID
  );

  tx.sign(keyPair);
  const serializedHex = Nimiq.BufferUtils.toHex(tx.serialize());
  const txHash = tx.hash();

  // 4. Broadcast transaction to Nimiq network via JSON-RPC sendRawTransaction
  const broadcastRes = await fetch(NIMIQ_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "sendRawTransaction",
      params: [serializedHex],
      id: Date.now(),
    }),
  });

  const broadcastJson = await broadcastRes.json();
  if (broadcastJson.error) {
    throw new Error(`Nimiq RPC sendRawTransaction error: ${broadcastJson.error.message || JSON.stringify(broadcastJson.error)}`);
  }

  const broadcastResultHash = broadcastJson.result?.data || broadcastJson.result || txHash;
  console.log(`[treasury:payout] Broadcast success! Real on-chain Tx Hash: ${broadcastResultHash}`);

  return {
    txHash: broadcastResultHash,
    amountLuna: finalLuna.toString(),
    amountNim: lunaToNim(finalLuna),
  };
}
