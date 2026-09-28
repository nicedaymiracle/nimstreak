import * as Nimiq from "@nimiq/core";
import dotenv from "dotenv";

dotenv.config();

const NIMIQ_NETWORK = (process.env.NIMIQ_NETWORK || "mainnet").toLowerCase();
const defaultRpcUrl = NIMIQ_NETWORK === "testnet"
  ? "https://rpc.testnet.nimiqwatch.com"
  : "https://rpc.nimiqwatch.com";
const defaultNetworkId = NIMIQ_NETWORK === "testnet" ? 5 : 24;

const NIMIQ_RPC_URL = process.env.NIMIQ_RPC_URL || defaultRpcUrl;
export const TREASURY_ADDRESS = (process.env.NIMIQ_TREASURY_ADDRESS || "NQ68 LS47 5LF6 C7CU MVB6 KL55 YSFG PEXJ ADJ0").trim();
const TREASURY_PRIVATE_KEY = (process.env.NIMIQ_TREASURY_PRIVATE_KEY || "").trim();
const TREASURY_FEE_PERCENT = parseInt(process.env.TREASURY_FEE_PERCENT || "10", 10);
export const NIMIQ_NETWORK_ID = parseInt(process.env.NIMIQ_NETWORK_ID || String(defaultNetworkId), 10); // 24 = mainnet, 5 = testnet

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
 *
 * Challenge type determines the reward model:
 * - "solo": Protected stake on failure (stake returned, no bonus, no quitter pool)
 * - "public" / "group": Communal forfeiture (failed stakes enter quitter pool for finishers)
 * - If challengeType is not provided, defaults to communal forfeiture (defensive fallback).
 */
export const MAX_INDIVIDUAL_BONUS_LUNA = 500000n; // 5 NIM individual cap
export const MAX_NIMSTREAK_BONUS_LUNA = 500000n; // Backwards compatible alias
export const CHALLENGE_MAX_BONUS_LUNA = 2000000n; // 20 NIM challenge budget cap

export function calculatePayouts(participants = [], totalPoolInput = null, maxChallengeBonusInput = null, challengeType = null) {
  const isSolo = challengeType === "solo";

  const quitters = participants.filter((p) => p.status === "failed");
  const finishers = participants.filter((p) => p.status === "completed" || p.status === "active");

  const totalPoolLuna = totalPoolInput !== null
    ? nimToLuna(totalPoolInput)
    : participants.reduce(
        (sum, p) => sum + (p.stake_luna ? BigInt(p.stake_luna) : nimToLuna(p.stake_amount || p.stake_nim || 0)),
        0n
      );

  // Solo challenges: no quitter pool (stakes are protected)
  // Public/Group challenges: failed stakes form the quitter pool
  const quitterPoolLuna = isSolo
    ? 0n
    : quitters.reduce(
        (sum, p) => sum + (p.stake_luna ? BigInt(p.stake_luna) : nimToLuna(p.stake_amount || p.stake_nim || 0)),
        0n
      );

  // Treasury fee is 0% in the NimStreak reward model (100% of forfeited pool goes to finishers)
  const treasuryFeeLuna = 0n;
  const distributableBonusLuna = quitterPoolLuna;

  const finisherCount = BigInt(finishers.length);
  const baseForfeitedRewardLuna = finisherCount > 0n ? distributableBonusLuna / finisherCount : 0n;
  const remainderLuna = finisherCount > 0n ? distributableBonusLuna % finisherCount : 0n;

  // 1. Calculate theoretical individual bonus for each finisher: min(stake * 50%, 5 NIM)
  const theoreticalBonusesLuna = finishers.map((p) => {
    const stakeLuna = p.stake_luna ? BigInt(p.stake_luna) : nimToLuna(p.stake_amount || p.stake_nim || 0);
    const bonus50Percent = (stakeLuna * 50n) / 100n;
    return bonus50Percent > MAX_INDIVIDUAL_BONUS_LUNA ? MAX_INDIVIDUAL_BONUS_LUNA : bonus50Percent;
  });

  const totalTheoreticalBonusLuna = theoreticalBonusesLuna.reduce((sum, b) => sum + b, 0n);
  const challengeMaxBonusLuna = maxChallengeBonusInput !== null && maxChallengeBonusInput !== undefined
    ? (typeof maxChallengeBonusInput === "bigint" ? maxChallengeBonusInput : nimToLuna(maxChallengeBonusInput))
    : CHALLENGE_MAX_BONUS_LUNA;

  // 2. Scale bonus if theoretical total exceeds challenge bonus budget (20 NIM)
  let actualBonusesLuna = [];
  if (totalTheoreticalBonusLuna <= challengeMaxBonusLuna || challengeMaxBonusLuna <= 0n) {
    actualBonusesLuna = theoreticalBonusesLuna;
  } else {
    // Proportional integer scaling with deterministic remainder distribution in Luna
    const baseScaled = theoreticalBonusesLuna.map((tb) => (tb * challengeMaxBonusLuna) / totalTheoreticalBonusLuna);
    const sumScaled = baseScaled.reduce((sum, b) => sum + b, 0n);
    const remainderBonusLuna = challengeMaxBonusLuna - sumScaled;

    actualBonusesLuna = baseScaled.map((sb, idx) => {
      const extra = BigInt(idx) < remainderBonusLuna ? 1n : 0n;
      return sb + extra;
    });
  }

  let totalNimStreakBonusLuna = 0n;
  let distributedForfeitedLuna = 0n;

  // Build finisher payouts
  const payouts = finishers.map((p, idx) => {
    const stakeLuna = p.stake_luna ? BigInt(p.stake_luna) : nimToLuna(p.stake_amount || p.stake_nim || 0);

    // Deterministic remainder distribution: first `remainderLuna` finishers get +1 Luna
    const extraRemainderLuna = BigInt(idx) < remainderLuna ? 1n : 0n;
    const forfeitedRewardLuna = baseForfeitedRewardLuna + extraRemainderLuna;
    distributedForfeitedLuna += forfeitedRewardLuna;

    const bonusLuna = actualBonusesLuna[idx] || 0n;
    totalNimStreakBonusLuna += bonusLuna;

    const totalLuna = stakeLuna + forfeitedRewardLuna + bonusLuna;

    return {
      wallet_address: p.wallet_address,
      stake_return_luna: stakeLuna.toString(),
      stake_return_nim: lunaToNim(stakeLuna),
      forfeited_reward_luna: forfeitedRewardLuna.toString(),
      forfeited_reward_nim: lunaToNim(forfeitedRewardLuna),
      bonus_luna: bonusLuna.toString(),
      bonus_nim: lunaToNim(bonusLuna),
      nimstreak_bonus_luna: bonusLuna.toString(),
      nimstreak_bonus_nim: lunaToNim(bonusLuna),
      theoretical_bonus_luna: theoreticalBonusesLuna[idx].toString(),
      theoretical_bonus_nim: lunaToNim(theoreticalBonusesLuna[idx]),
      total_luna: totalLuna.toString(),
      total_nim: lunaToNim(totalLuna),
      payout_type: "stake_return_plus_bonus",
    };
  });

  // Solo challenges: failed participants receive their protected stake back (no bonus, no pool share)
  if (isSolo) {
    for (const p of quitters) {
      const stakeLuna = p.stake_luna ? BigInt(p.stake_luna) : nimToLuna(p.stake_amount || p.stake_nim || 0);
      payouts.push({
        wallet_address: p.wallet_address,
        stake_return_luna: stakeLuna.toString(),
        stake_return_nim: lunaToNim(stakeLuna),
        forfeited_reward_luna: "0",
        forfeited_reward_nim: 0,
        bonus_luna: "0",
        bonus_nim: 0,
        nimstreak_bonus_luna: "0",
        nimstreak_bonus_nim: 0,
        theoretical_bonus_luna: "0",
        theoretical_bonus_nim: 0,
        total_luna: stakeLuna.toString(),
        total_nim: lunaToNim(stakeLuna),
        payout_type: "solo_stake_return",
      });
    }
  }

  return {
    payouts,
    challengeType: challengeType || null,
    totalPoolLuna: totalPoolLuna.toString(),
    totalPoolNim: lunaToNim(totalPoolLuna),
    quitterPoolLuna: quitterPoolLuna.toString(),
    quitterPoolNim: lunaToNim(quitterPoolLuna),
    forfeitedPoolLuna: quitterPoolLuna.toString(),
    forfeitedPoolNim: lunaToNim(quitterPoolLuna),
    treasuryFeeLuna: treasuryFeeLuna.toString(),
    treasuryFeeNim: lunaToNim(treasuryFeeLuna),
    distributableBonusLuna: distributableBonusLuna.toString(),
    distributableBonusNim: lunaToNim(distributableBonusLuna),
    remainderLuna: remainderLuna.toString(),
    distributedForfeitedLuna: distributedForfeitedLuna.toString(),
    totalNimStreakBonusLuna: totalNimStreakBonusLuna.toString(),
    totalNimStreakBonusNim: lunaToNim(totalNimStreakBonusLuna),
    totalTheoreticalBonusLuna: totalTheoreticalBonusLuna.toString(),
    totalTheoreticalBonusNim: lunaToNim(totalTheoreticalBonusLuna),
    challengeMaxBonusLuna: challengeMaxBonusLuna.toString(),
    challengeMaxBonusNim: lunaToNim(challengeMaxBonusLuna),
    isBonusScaled: totalTheoreticalBonusLuna > challengeMaxBonusLuna,
    finisherCount: finishers.length,
    quitterCount: quitters.length,
    estimatedBonusPerFinisher: finishers.length > 0 ? lunaToNim(baseForfeitedRewardLuna) : 0,
    estimatedForfeitedRewardPerFinisher: finishers.length > 0 ? lunaToNim(baseForfeitedRewardLuna) : 0,
  };
}

/**
 * Canonical resolver for determining the true funding wallet from an on-chain Nimiq stake transaction.
 *
 * Rules:
 * 1. If fromType is NOT 2 (not an HTLC):
 *    use the normal transaction sender: tx.from or tx.sender
 * 2. If fromType === 2 (HTLC):
 *    DO NOT use tx.from as the funding wallet.
 *    Decode the HTLC proof using Nimiq.HashedTimeLockedContract.proofToPlain.
 *    Extract: proof.creator
 *    Normalize proof.creator. That creator is the verified funding wallet.
 * 3. If the HTLC proof cannot be decoded or has no valid creator:
 *    FAIL CLOSED. Do NOT fall back to tx.from. Do NOT use profile_wallet.
 * 4. Return:
 *    {
 *      fundingAddress: string,      // actual human/user funding wallet
 *      transactionAddress: string,  // raw tx.from / HTLC contract address
 *      transactionType: number,     // tx.fromType
 *      isHtlc: boolean,             // whether tx is an HTLC
 *      htlcProofType?: string       // e.g. "early-resolve", "timeout-resolve"
 *    }
 */
export function resolveVerifiedFundingAddress(txData) {
  if (!txData) {
    throw new Error("Cannot resolve funding address: Transaction data is missing.");
  }

  const rawFrom = normalizeAddress(txData.from || txData.sender);
  if (!rawFrom || !isNimiqAddress(rawFrom)) {
    throw new Error(`Invalid transaction sender address: "${txData.from || txData.sender}"`);
  }

  const fromType = Number(txData.fromType !== undefined ? txData.fromType : 0);

  // If fromType is NOT 2: standard basic account transaction
  if (fromType !== 2) {
    return {
      fundingAddress: rawFrom,
      transactionAddress: rawFrom,
      transactionType: fromType,
      isHtlc: false,
      resolutionSource: "onchain_basic_sender",
    };
  }

  // If fromType === 2: HTLC Transaction.
  // rawFrom is the HTLC contract address, NOT the funding wallet.
  const proofHex = typeof txData.proof === "string" ? txData.proof.trim() : "";
  if (!proofHex) {
    throw new Error(
      `HTLC transaction (${txData.hash || "unknown"}) contains no proof data. Cannot verify funding wallet. Payout aborted.`
    );
  }

  let decodedProof = null;
  try {
    const proofBytes = Buffer.from(proofHex, "hex");
    decodedProof = Nimiq.HashedTimeLockedContract.proofToPlain(proofBytes);
  } catch (err) {
    throw new Error(
      `Failed to decode HTLC proof for transaction (${txData.hash || "unknown"}): ${err.message || err}`
    );
  }

  if (!decodedProof) {
    throw new Error(
      `HTLC proof decoding returned empty result for transaction (${txData.hash || "unknown"}).`
    );
  }

  const creatorRaw = decodedProof.creator;
  const creator = normalizeAddress(creatorRaw);

  if (!creator || !isNimiqAddress(creator)) {
    throw new Error(
      `HTLC proof (${decodedProof.type || "unknown"}) has no valid creator address for transaction (${txData.hash || "unknown"}).`
    );
  }

  if (creator === rawFrom) {
    throw new Error(
      `HTLC proof creator cannot be identical to the HTLC contract address (${rawFrom}). Cannot verify funding wallet.`
    );
  }

  return {
    fundingAddress: creator,
    transactionAddress: rawFrom,
    transactionType: fromType,
    isHtlc: true,
    htlcProofType: decodedProof.type,
    resolutionSource: "onchain_htlc_proof",
  };
}

/**
 * Verify a client-submitted stake transaction on the Nimiq network.
 * Verifies on-chain existence, sender, recipient, value, and execution status.
 */
export async function verifyStakeTransaction({
  txHash,
  senderAddress = null,
  expectedStakeNim,
  expectedStakeLuna = null,
  treasuryAddress = TREASURY_ADDRESS,
}) {
  const cleanHash = String(txHash || "").trim().toLowerCase();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHash)) {
    throw new Error(`Invalid Nimiq transaction hash format: "${txHash}"`);
  }

  const expectedLuna = expectedStakeLuna !== null ? BigInt(expectedStakeLuna) : nimToLuna(expectedStakeNim);
  const normalizedSender = senderAddress ? normalizeAddress(senderAddress) : null;
  const normalizedTreasury = normalizeAddress(treasuryAddress);

  // Development bypass ONLY if explicitly enabled in environment
  if (process.env.SKIP_TX_VERIFICATION === "true") {
    console.warn(`[verification:bypass] WARNING: SKIP_TX_VERIFICATION is enabled. Accepting tx ${cleanHash}`);
    return {
      verified: true,
      txHash: cleanHash,
      from: normalizedSender || "NQ0000000000000000000000000000000000",
      rawFrom: normalizedSender || "NQ0000000000000000000000000000000000",
      isHtlc: false,
      to: normalizedTreasury,
      valueLuna: Number(expectedLuna),
      bypassed: true,
    };
  }

  // Fetch transaction details from Nimiq blockchain
  const txData = await getOnChainTransaction(cleanHash);

  if (!txData) {
    throw new Error(`Transaction ${cleanHash} not found on the Nimiq network. Please wait for confirmation.`);
  }

  // Canonical resolution of the true funding wallet
  const resolvedFunding = resolveVerifiedFundingAddress(txData);
  const actualFundingAddress = resolvedFunding.fundingAddress;
  const actualTransactionAddress = resolvedFunding.transactionAddress;
  const actualTo = normalizeAddress(txData.to || txData.recipient);
  const actualValueLuna = BigInt(txData.value || 0);
  const executionResult = txData.executionResult !== undefined ? txData.executionResult : true;

  if (!executionResult) {
    throw new Error(`Transaction ${cleanHash} failed execution on the blockchain.`);
  }

  if (normalizedSender && actualFundingAddress !== normalizedSender) {
    throw new Error(
      `Transaction sender mismatch: Expected ${normalizedSender}, but transaction was funded by ${actualFundingAddress}${resolvedFunding.isHtlc ? ` (via HTLC contract ${actualTransactionAddress})` : ""}.`
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
    from: actualFundingAddress,
    rawFrom: actualTransactionAddress,
    isHtlc: resolvedFunding.isHtlc,
    to: actualTo,
    valueLuna: Number(actualValueLuna),
    blockNumber: txData.blockNumber,
  };
}

/**
 * Query on-chain transaction data by hash using RPC with REST fallback.
 * Returns the transaction data object if found and valid, or null if not found.
 */
export async function getOnChainTransaction(txHash) {
  const cleanHash = String(txHash || "").trim().toLowerCase();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHash)) {
    return null;
  }

  let txData = null;

  // 1. Try Nimiq JSON-RPC getTransactionByHash
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

    if (rpcRes.ok) {
      const json = await rpcRes.json();
      if (json && json.result) {
        txData = json.result.data || json.result;
      }
    }
  } catch (rpcErr) {
    console.warn(`[onchain:query] RPC getTransactionByHash notice (${rpcErr.message})`);
  }

  // 2. Fallback: try api.nimiq.watch REST endpoint
  if (!txData) {
    try {
      const restRes = await fetch(`https://api.nimiq.watch/transaction/${cleanHash}`);
      if (restRes.ok) {
        const json = await restRes.json();
        if (json && !json.error) {
          txData = {
            ...json,
            from: json.sender_address || json.from,
            to: json.receiver_address || json.to,
          };
        }
      }
    } catch (restErr) {
      console.warn(`[onchain:query] REST fallback notice (${restErr.message})`);
    }
  }

  if (txData && (txData.hash || txData.blockNumber !== undefined || txData.value !== undefined)) {
    return txData;
  }

  return null;
}

/**
 * Query on-chain account info by address using JSON-RPC with REST fallback.
 * Returns account object or null if query failed.
 */
export async function getAccountInfo(address) {
  const cleanAddress = normalizeAddress(address);
  if (!cleanAddress) return null;

  try {
    const rpcRes = await fetch(NIMIQ_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getAccountByAddress",
        params: [cleanAddress],
        id: Date.now(),
      }),
    });

    if (rpcRes.ok) {
      const json = await rpcRes.json();
      if (json && json.result) {
        return json.result.data || json.result;
      }
    }
  } catch (_) {}

  try {
    const restRes = await fetch(`https://api.nimiq.watch/account/${cleanAddress}`);
    if (restRes.ok) {
      const json = await restRes.json();
      if (json && !json.error) {
        return json;
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Poll getOnChainTransaction until the transaction appears on-chain,
 * or until the bounded retry window is reached.
 */
export async function waitForTransactionConfirmation(txHash, { maxAttempts = 6, intervalMs = 1500 } = {}) {
  const cleanHash = String(txHash || "").trim().toLowerCase();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHash)) {
    return null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const txData = await getOnChainTransaction(cleanHash);
    if (txData) {
      const executionResult = txData.executionResult !== undefined ? txData.executionResult : true;
      if (!executionResult) {
        throw new Error(`Transaction ${cleanHash} failed execution on the blockchain.`);
      }
      return txData;
    }
  }

  return null;
}

/**
 * Query on-chain balance of an address in Luna using Nimiq JSON-RPC getAccountByAddress with REST fallback.
 * Returns BigInt balance in Luna if found, or null if query failed.
 */
export async function getTreasuryBalance(treasuryAddress = TREASURY_ADDRESS) {
  const cleanAddress = normalizeAddress(treasuryAddress);
  if (!cleanAddress) return null;

  // 1. Try Nimiq JSON-RPC getAccountByAddress
  try {
    const rpcRes = await fetch(NIMIQ_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getAccountByAddress",
        params: [cleanAddress],
        id: Date.now(),
      }),
    });

    if (rpcRes.ok) {
      const json = await rpcRes.json();
      if (json && json.result) {
        const acc = json.result.data || json.result;
        const bal = acc.balance !== undefined ? acc.balance : acc.value;
        if (bal !== undefined) {
          return BigInt(bal);
        }
      }
    }
  } catch (rpcErr) {
    console.warn(`[treasury:balance] RPC getAccountByAddress notice (${rpcErr.message})`);
  }

  // 2. Fallback: try api.nimiq.watch REST endpoint
  try {
    const restRes = await fetch(`https://api.nimiq.watch/account/${cleanAddress}`);
    if (restRes.ok) {
      const json = await restRes.json();
      if (json && json.balance !== undefined && !json.error) {
        return BigInt(json.balance);
      }
    }
  } catch (restErr) {
    console.warn(`[treasury:balance] REST fallback notice (${restErr.message})`);
  }

  return null;
}

let payoutQueueTail = Promise.resolve();

/**
 * Execute an async task within an exclusive in-memory sequential payout lock.
 * Ensures balance verification, transaction construction, network broadcast,
 * and on-chain confirmation execute strictly one-at-a-time.
 * Guarantees release in a finally block to prevent queue deadlocks.
 */
export async function withPayoutLock(taskFn) {
  const previous = payoutQueueTail;
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  payoutQueueTail = current;

  try {
    await previous;
  } catch {
    // Ignore previous queue failures to prevent queue deadlock
  }

  try {
    return await taskFn();
  } finally {
    release();
  }
}

/**
 * Construct, sign with treasury keypair, broadcast, and verify on-chain confirmation.
 * Wrapped in withPayoutLock for exclusive sequential execution.
 *
 * Implements strict lowest-level broadcast guards:
 * - verifiedFundingAddress must be provided and must match 'to'
 * - 'to' cannot be in disallowedAddresses (rejects known HTLC contract addresses)
 * - 'to' cannot be an on-chain HTLC contract account (type: 2)
 */
export async function sendStreakPayout({
  to,
  amountNim,
  amountLuna = null,
  payoutType = "stake_return_plus_bonus",
  verifiedFundingAddress = null,
  disallowedAddresses = [],
}) {
  return withPayoutLock(async () => {
    const normalizedTo = normalizeAddress(to);
    if (!normalizedTo || !isNimiqAddress(normalizedTo)) {
      throw new Error(`Invalid Nimiq recipient address: "${to}". Aborting broadcast.`);
    }

    // FINAL GUARD 1: Verified funding address match
    if (!verifiedFundingAddress) {
      throw new Error(
        "CRITICAL PAYOUT INVARIANT VIOLATION: verifiedFundingAddress is required to broadcast a payout. Aborting broadcast."
      );
    }
    const normalizedVerified = normalizeAddress(verifiedFundingAddress);
    if (!normalizedVerified || !isNimiqAddress(normalizedVerified)) {
      throw new Error(
        `CRITICAL PAYOUT INVARIANT VIOLATION: Verified funding address "${verifiedFundingAddress}" is invalid. Aborting broadcast.`
      );
    }
    if (normalizedTo !== normalizedVerified) {
      throw new Error(
        `CRITICAL PAYOUT INVARIANT VIOLATION: Recipient address "${normalizedTo}" does not match verified funding address "${normalizedVerified}". Aborting broadcast.`
      );
    }

    // FINAL GUARD 2: Explicitly reject known or passed HTLC contract addresses
    const normalizedDisallowed = (Array.isArray(disallowedAddresses) ? disallowedAddresses : [disallowedAddresses])
      .filter(Boolean)
      .map(normalizeAddress);

    if (normalizedDisallowed.includes(normalizedTo)) {
      throw new Error(
        `CRITICAL PAYOUT INVARIANT VIOLATION: Recipient address "${normalizedTo}" is an HTLC contract or disallowed address. Aborting broadcast.`
      );
    }

    // FINAL GUARD 3: Specifically reject on-chain HTLC contract accounts (type: 2)
    if (process.env.SKIP_TX_VERIFICATION !== "true") {
      try {
        const accountInfo = await getAccountInfo(normalizedTo);
        if (accountInfo && (accountInfo.type === 2 || accountInfo.accountType === "htlc" || accountInfo.isHtlc)) {
          throw new Error(
            `CRITICAL PAYOUT INVARIANT VIOLATION: Recipient address "${normalizedTo}" is an on-chain HTLC contract (type: 2). Cannot pay into an HTLC contract. Aborting broadcast.`
          );
        }
      } catch (accErr) {
        if (accErr.message && accErr.message.includes("CRITICAL PAYOUT INVARIANT VIOLATION")) {
          throw accErr;
        }
      }
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

    console.log(`[treasury:payout] Preparing payout of ${finalLuna} Luna (${lunaToNim(finalLuna)} NIM) to ${normalizedTo} (${payoutType})`);

    // 1. Derive treasury KeyPair
    const cleanPrivKeyHex = TREASURY_PRIVATE_KEY.replace(/^0x/, "").trim();
    const privKey = Nimiq.PrivateKey.fromHex(cleanPrivKeyHex);
    const keyPair = Nimiq.KeyPair.derive(privKey);
    const senderAddress = keyPair.toAddress();
    const senderUserFriendly = senderAddress.toUserFriendlyAddress();

    // 1b. Pre-flight Treasury Balance Guard: verify available balance before constructing & broadcasting payout
    if (process.env.SKIP_TX_VERIFICATION !== "true") {
      const availableBalanceLuna = await getTreasuryBalance(senderUserFriendly);
      if (availableBalanceLuna === null) {
        throw new Error(
          "Unable to verify treasury balance. Payout was not broadcast and can be retried."
        );
      }
      if (availableBalanceLuna < finalLuna) {
        throw new Error(
          `Treasury balance (${lunaToNim(availableBalanceLuna)} NIM) is insufficient to fund this payout of ${lunaToNim(finalLuna)} NIM. Payout is preserved and can be retried once the treasury is funded.`
        );
      }
    }

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

    // 3. Construct and sign transaction using configured network ID
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
    console.log(`[treasury:payout] Broadcast accepted into mempool. Tx Hash: ${broadcastResultHash}`);

    // 5. Poll for on-chain confirmation before treating as successful
    const maxAttempts = parseInt(process.env.PAYOUT_CONFIRM_ATTEMPTS || "6", 10);
    const intervalMs = parseInt(process.env.PAYOUT_CONFIRM_INTERVAL_MS || "1500", 10);
    console.log(`[treasury:payout] Awaiting on-chain confirmation for ${broadcastResultHash} (${maxAttempts} attempts @ ${intervalMs}ms)...`);

    const confirmedTx = await waitForTransactionConfirmation(broadcastResultHash, {
      maxAttempts,
      intervalMs,
    });

    if (!confirmedTx) {
      throw new Error(
        `Payout transaction ${broadcastResultHash} was broadcast, but failed to confirm on-chain within timeout. Treasury balance unchanged.`
      );
    }

    console.log(`[treasury:payout] Confirmed on-chain! Block: ${confirmedTx.blockNumber || "confirmed"}`);

    return {
      txHash: broadcastResultHash,
      amountLuna: finalLuna.toString(),
      amountNim: lunaToNim(finalLuna),
      confirmed: true,
      blockNumber: confirmedTx.blockNumber || null,
    };
  });
}
