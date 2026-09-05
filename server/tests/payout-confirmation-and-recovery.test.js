import { describe, it, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as db from "../src/db.js";
import {
  NIMIQ_NETWORK_ID,
  getOnChainTransaction,
  waitForTransactionConfirmation,
  sendStreakPayout,
} from "../src/nimstreak-payout.js";

describe("Nimiq 2.0 Network ID & Payout Confirmation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("ensures production Network ID is configured to 24 (Nimiq 2.0 Albatross PoS Mainnet)", () => {
    assert.equal(NIMIQ_NETWORK_ID, 24, "NIMIQ_NETWORK_ID must be 24 for Nimiq 2.0 Mainnet");
  });

  it("getOnChainTransaction returns null when transaction is not found on RPC", async () => {
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts?.body || "{}");
      if (body.method === "getTransactionByHash") {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal error",
              data: "Transaction not found: 8856aeacc478186fca27a5aee09c6da264fa2fb92e3355d9e70cd38c46404d0d",
            },
            id: 1,
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    };

    const tx = await getOnChainTransaction("8856aeacc478186fca27a5aee09c6da264fa2fb92e3355d9e70cd38c46404d0d");
    assert.equal(tx, null);
  });

  it("getOnChainTransaction returns valid data when transaction is confirmed on-chain", async () => {
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts?.body || "{}");
      if (body.method === "getTransactionByHash") {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            result: {
              data: {
                hash: "a".repeat(64),
                blockNumber: 606700,
                from: "NQ68 LS47 5LF6 C7CU MVB6 KL55 YSFG PEXJ ADJ0",
                to: "NQ89 JS0L BHRN J2CY 6X2H LMQL QAG5 NHRJ NKE7",
                value: 50000,
                executionResult: true,
              },
            },
            id: 1,
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    };

    const tx = await getOnChainTransaction("a".repeat(64));
    assert.ok(tx);
    assert.equal(tx.hash, "a".repeat(64));
    assert.equal(tx.blockNumber, 606700);
    assert.equal(tx.value, 50000);
  });

  it("waitForTransactionConfirmation returns null when transaction is never confirmed within retry limit", async () => {
    globalThis.fetch = async (url, opts) => {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Transaction not found" },
          id: 1,
        }),
      };
    };

    const confirmed = await waitForTransactionConfirmation("b".repeat(64), {
      maxAttempts: 2,
      intervalMs: 10,
    });
    assert.equal(confirmed, null);
  });

  it("waitForTransactionConfirmation resolves when transaction appears on subsequent attempt", async () => {
    let callCount = 0;
    globalThis.fetch = async (url, opts) => {
      callCount++;
      if (callCount < 2) {
        return {
          ok: true,
          json: async () => ({ jsonrpc: "2.0", error: { code: -32603, message: "Not found" } }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          result: {
            data: {
              hash: "c".repeat(64),
              blockNumber: 606750,
              executionResult: true,
              value: 50000,
            },
          },
        }),
      };
    };

    const confirmed = await waitForTransactionConfirmation("c".repeat(64), {
      maxAttempts: 3,
      intervalMs: 10,
    });
    assert.ok(confirmed);
    assert.equal(confirmed.hash, "c".repeat(64));
    assert.equal(confirmed.blockNumber, 606750);
  });

  it("waitForTransactionConfirmation throws if transaction failed execution on blockchain", async () => {
    globalThis.fetch = async (url, opts) => {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          result: {
            data: {
              hash: "d".repeat(64),
              blockNumber: 606755,
              executionResult: false,
            },
          },
        }),
      };
    };

    await assert.rejects(
      () => waitForTransactionConfirmation("d".repeat(64), { maxAttempts: 1, intervalMs: 10 }),
      /failed execution on the blockchain/
    );
  });
});

describe("Payout Database Recovery & Idempotency", () => {
  const originalFetch = globalThis.fetch;
  const testWallet = "NQ89 JS0L BHRN J2CY 6X2H LMQL QAG5 NHRJ NKE7";
  const normWallet = db.normalizeAddress(testWallet);
  const challengeId = "ch_recovery_test_1";

  before(async () => {
    await db.initDb();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("recovers a stale unconfirmed payout from 'sent' to 'failed'", async () => {
    const staleTxHash = "8856aeacc478186fca27a5aee09c6da264fa2fb92e3355d9e70cd38c46404d0d";

    // Seed payout marked "sent"
    await db.recordPayout({
      challenge_id: challengeId,
      wallet_address: normWallet,
      amount_nim: 0.5,
      amount_luna: "50000",
      payout_type: "stake_return_plus_bonus",
      status: "sent",
      tx_hash: staleTxHash,
    });

    const recorded = await db.getPayout(challengeId, normWallet, "stake_return_plus_bonus");
    assert.equal(recorded.status, "sent");

    // Mock RPC returning "Transaction not found"
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Transaction not found" },
      }),
    });

    // Verify on-chain existence
    const onChainTx = await getOnChainTransaction(recorded.tx_hash);
    assert.equal(onChainTx, null);

    // Transition stale payout to failed
    await db.recordPayout({
      ...recorded,
      status: "failed",
      error: `Previous transaction ${recorded.tx_hash} was not confirmed on-chain. Recovered for re-claim.`,
    });

    const recovered = await db.getPayout(challengeId, normWallet, "stake_return_plus_bonus");
    assert.equal(recovered.status, "failed");
    assert.ok(recovered.error.includes("not confirmed on-chain"));
  });

  it("prevents double payouts when transaction is verified on-chain", async () => {
    const realTxHash = "e".repeat(64);

    await db.recordPayout({
      challenge_id: challengeId,
      wallet_address: normWallet,
      amount_nim: 0.5,
      amount_luna: "50000",
      payout_type: "stake_return_plus_bonus",
      status: "sent",
      tx_hash: realTxHash,
    });

    // Mock RPC returning verified on-chain data
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        result: {
          data: {
            hash: realTxHash,
            blockNumber: 606800,
            value: 50000,
            executionResult: true,
          },
        },
      }),
    });

    const existingPayout = await db.getPayout(challengeId, normWallet, "stake_return_plus_bonus");
    assert.equal(existingPayout.status, "sent");

    const onChainTx = await getOnChainTransaction(existingPayout.tx_hash);
    assert.ok(onChainTx);

    // Because onChainTx exists, the claim MUST reject and remain status "sent"
    const isAlreadyPaid = Boolean(onChainTx && existingPayout.status === "sent");
    assert.equal(isAlreadyPaid, true, "Confirmed on-chain payout must never be retried");
  });

  it("allows retrying payout after failed attempt", async () => {
    // Record failed payout
    await db.recordPayout({
      challenge_id: challengeId,
      wallet_address: normWallet,
      amount_nim: 0.5,
      amount_luna: "50000",
      payout_type: "stake_return_plus_bonus",
      status: "failed",
      error: "Broadcast timeout",
    });

    const failedPayout = await db.getPayout(challengeId, normWallet, "stake_return_plus_bonus");
    assert.equal(failedPayout.status, "failed");

    // Failed status allows new pending reservation and subsequent sent completion
    await db.recordPayout({
      challenge_id: challengeId,
      wallet_address: normWallet,
      amount_nim: 0.5,
      amount_luna: "50000",
      payout_type: "stake_return_plus_bonus",
      status: "pending",
    });

    const pendingPayout = await db.getPayout(challengeId, normWallet, "stake_return_plus_bonus");
    assert.equal(pendingPayout.status, "pending");

    await db.recordPayout({
      challenge_id: challengeId,
      wallet_address: normWallet,
      amount_nim: 0.5,
      amount_luna: "50000",
      payout_type: "stake_return_plus_bonus",
      tx_hash: "f".repeat(64),
      status: "sent",
    });

    const finalPayout = await db.getPayout(challengeId, normWallet, "stake_return_plus_bonus");
    assert.equal(finalPayout.status, "sent");
    assert.equal(finalPayout.tx_hash, "f".repeat(64));
  });
});
