import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as db from "../src/db.js";
import { app } from "../src/index.js";
import * as payoutModule from "../src/nimstreak-payout.js";

describe("Production Payout Recipient & Wallet Identity Verification Regression", () => {
  let serverInstance;
  let serverBaseUrl;
  const originalFetch = globalThis.fetch;
  let sendStreakPayoutSpy = null;
  const origSendStreakPayout = payoutModule.sendStreakPayout;

  // Real addresses from production incident
  const profileWallet = "NQ59 SBB2 631Q X85Y 3X25 S586 XGM1 VY9P Q2X6";
  const fundingWallet = "NQ29 GT4G PPLK LD1P YUVK BRB3 AM55 N3KA B1NS";
  const normProfile = db.normalizeAddress(profileWallet);
  const normFunding = db.normalizeAddress(fundingWallet);

  // Other test identities
  const creatorWallet = "NQ11 AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH";
  const normCreator = db.normalizeAddress(creatorWallet);
  const maliciousWallet = "NQ33 9999 8888 7777 6666 5555 4444 3333 2222";
  const normMalicious = db.normalizeAddress(maliciousWallet);

  before(async () => {
    await db.initDb();
    serverInstance = http.createServer(app);
    await new Promise((resolve) => {
      serverInstance.listen(0, () => {
        const port = serverInstance.address().port;
        serverBaseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (serverInstance) {
      serverInstance.close();
    }
  });

  beforeEach(() => {
    sendStreakPayoutSpy = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Helper to mock on-chain transactions and sendStreakPayout
  function setupMockBlockchain({ stakeSender = normFunding, payoutTxHash = "feed000100020003000400050006000700080009000a000b000c000d000e000f" } = {}) {
    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url || "");
      if (urlStr.startsWith("http://127.0.0.1") || urlStr.startsWith("http://localhost")) {
        return originalFetch(url, opts);
      }
      const bodyStr = opts?.body || "";

      // Mock Nimiq JSON-RPC for getTransactionByHash or getAccount
      if (urlStr.includes("rpc") || bodyStr.includes("jsonrpc")) {
        try {
          const json = JSON.parse(bodyStr);
          if (json.method === "getTransactionByHash") {
            const hash = json.params?.[0];
            return {
              ok: true,
              json: async () => ({
                jsonrpc: "2.0",
                result: {
                  data: {
                    hash,
                    from: stakeSender,
                    to: payoutModule.TREASURY_ADDRESS,
                    value: 500000, // 5 NIM
                    executionResult: true,
                    blockNumber: 123456,
                  },
                },
                id: json.id || 1,
              }),
            };
          }
          if (json.method === "getAccountByAddress") {
            return {
              ok: true,
              json: async () => ({
                jsonrpc: "2.0",
                result: {
                  data: {
                    balance: 1000000000, // 10,000 NIM balance
                  },
                },
                id: json.id || 1,
              }),
            };
          }
        } catch (_) {}
      }

      // REST fallback
      if (urlStr.includes("/transaction/")) {
        return {
          ok: true,
          json: async () => ({
            from: stakeSender,
            to: payoutModule.TREASURY_ADDRESS,
            value: 500000,
            executionResult: true,
            blockNumber: 123456,
          }),
        };
      }

      return { ok: false, json: async () => ({}) };
    };
  }

  // ── TEST A: profile wallet != funding wallet ─────────────────────────
  it("A. profile wallet != funding wallet: Claim must pay funding wallet (NQ29), not profile wallet (NQ59)", async () => {
    const challengeId = `ch_test_a_${Date.now()}`;
    const stakeTxHash = "aa00000100020003000400050006000700080009000a000b000c000d000e000f";
    setupMockBlockchain({ stakeSender: normFunding });

    // Create completed challenge
    await db.createChallenge(
      {
        id: challengeId,
        title: "Test A Challenge",
        type: "solo",
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normFunding,
        profile_wallet: normProfile,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normProfile }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 200, `Claim failed: ${JSON.stringify(json)}`);
    assert.strictEqual(json.success, true);
    // Must pay NQ29 (funding wallet), NOT NQ59
    assert.strictEqual(json.fundingAddress, normFunding);
    assert.strictEqual(json.recipient, normFunding);
    assert.strictEqual(json.profileWallet, normProfile);

    // Verify persisted payout record in database
    const payout = await db.getPayout(challengeId, normFunding);
    assert.ok(payout);
    assert.strictEqual(payout.wallet_address, normFunding);
    assert.strictEqual(payout.profile_wallet, normProfile);
    assert.strictEqual(payout.status, "sent");
  });

  // ── TEST B: frontend sends NQ59 while stored funding wallet is NQ29 ──
  it("B. frontend sends NQ59 while stored funding wallet is NQ29: Claim must STILL pay NQ29", async () => {
    const challengeId = `ch_test_b_${Date.now()}`;
    const stakeTxHash = "bb00000100020003000400050006000700080009000a000b000c000d000e000f";
    setupMockBlockchain({ stakeSender: normFunding });

    await db.createChallenge(
      {
        id: challengeId,
        title: "Test B Challenge",
        type: "solo",
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normFunding,
        profile_wallet: normProfile,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    // Frontend passes walletAddress: NQ59 AND an attempted destination: NQ59
    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: normProfile,
        recipient: normProfile,
        destination: normProfile,
      }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 200, `Claim failed: ${JSON.stringify(json)}`);
    assert.strictEqual(json.recipient, normFunding);
    assert.strictEqual(json.fundingAddress, normFunding);

    // Stored payout must be for funding wallet NQ29
    const payout = await db.getPayout(challengeId, normProfile);
    assert.ok(payout);
    assert.strictEqual(payout.wallet_address, normFunding);
  });

  // ── TEST C: challenge creator differs from participant funding wallet ─
  it("C. challenge creator differs from participant funding wallet: Claim must pay participant's verified funding wallet, not creator wallet", async () => {
    const challengeId = `ch_test_c_${Date.now()}`;
    const stakeTxHash = "cc00000100020003000400050006000700080009000a000b000c000d000e000f";
    setupMockBlockchain({ stakeSender: normFunding });

    // Challenge created by creator NQ11, but participant joined with funding wallet NQ29
    await db.createChallenge(
      {
        id: challengeId,
        title: "Test C Public Challenge",
        type: "public",
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normCreator, // Creator is NQ11
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normCreator,
        profile_wallet: normCreator,
        stake_tx_hash: "00".repeat(32),
        stake_amount: 5,
        status: "completed",
      }
    );

    // Add participant with funding wallet NQ29 and profile NQ59
    await db.addParticipant(challengeId, {
      wallet_address: normFunding,
      profile_wallet: normProfile,
      stake_tx_hash: stakeTxHash,
      stake_amount: 5,
      stake_luna: "500000",
      status: "completed",
    });

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normProfile }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 200, `Claim failed: ${JSON.stringify(json)}`);
    assert.strictEqual(json.recipient, normFunding);
    assert.notStrictEqual(json.recipient, normCreator);

    const payout = await db.getPayout(challengeId, normFunding);
    assert.strictEqual(payout.wallet_address, normFunding);
    assert.notStrictEqual(payout.wallet_address, normCreator);
  });

  // ── TEST D: participant funding wallet matches stake transaction sender
  it("D. participant funding wallet matches stake transaction sender: Claim uses that verified wallet", async () => {
    const challengeId = `ch_test_d_${Date.now()}`;
    const stakeTxHash = "dd00000100020003000400050006000700080009000a000b000c000d000e000f";
    setupMockBlockchain({ stakeSender: normFunding });

    await db.createChallenge(
      {
        id: challengeId,
        title: "Test D Challenge",
        type: "solo",
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normFunding,
        profile_wallet: normProfile,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normFunding }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(json.fundingAddress, normFunding);
    assert.strictEqual(json.recipient, normFunding);
  });

  // ── TEST E: mismatched participant/stake identity ─────────────────────
  it("E. mismatched participant/stake identity: The system refuses payout rather than silently paying an unverified address", async () => {
    const challengeId = `ch_test_e_${Date.now()}`;
    const stakeTxHash = "ee00000100020003000400050006000700080009000a000b000c000d000e000f";
    // Blockchain returns malicious sender NQ33, while participant record had NQ29
    setupMockBlockchain({ stakeSender: normMalicious });

    await db.createChallenge(
      {
        id: challengeId,
        title: "Test E Challenge Mismatched Identity",
        type: "solo",
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normFunding, // Record claims NQ29
        profile_wallet: normProfile,
        stake_tx_hash: stakeTxHash, // But stake tx was sent by NQ33!
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normProfile }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(json.error.includes("Mismatched participant funding identity"), `Expected mismatch error but got: ${json.error}`);

    // Verify NO payout record was created
    const payout = await db.getPayout(challengeId, normFunding);
    assert.strictEqual(payout, null, "Payout record must NOT be created when identity check fails");
  });

  // ── TEST F: duplicate claim remains protected ─────────────────────────
  it("F. duplicate claim remains protected: Second claim attempt is rejected", async () => {
    const challengeId = `ch_test_f_${Date.now()}`;
    const stakeTxHash = "ff00000100020003000400050006000700080009000a000b000c000d000e000f";
    setupMockBlockchain({ stakeSender: normFunding });

    await db.createChallenge(
      {
        id: challengeId,
        title: "Test F Duplicate Claim",
        type: "solo",
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normFunding,
        profile_wallet: normProfile,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    // 1st claim succeeds
    const res1 = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normProfile }),
    });
    assert.strictEqual(res1.status, 200);

    // 2nd claim fails with 400
    const res2 = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normProfile }),
    });
    const json2 = await res2.json();
    assert.strictEqual(res2.status, 400);
    assert.ok(json2.error.includes("already been claimed"));

    // 3rd claim using funding address directly also fails with 400
    const res3 = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normFunding }),
    });
    const json3 = await res3.json();
    assert.strictEqual(res3.status, 400);
    assert.ok(json3.error.includes("already been claimed"));
  });

  // ── TEST G: confirmed payout remains protected from duplicate payout ─
  it("G. confirmed payout remains protected from duplicate payout", async () => {
    const challengeId = `ch_test_g_${Date.now()}`;
    const confirmedTxHash = "11".repeat(32);
    setupMockBlockchain({ stakeSender: normFunding });

    await db.createChallenge(
      {
        id: challengeId,
        title: "Test G Confirmed Payout",
        type: "solo",
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normFunding,
        profile_wallet: normProfile,
        stake_tx_hash: "22".repeat(32),
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    // Seed confirmed payout
    await db.recordPayout({
      challenge_id: challengeId,
      wallet_address: normFunding,
      profile_wallet: normProfile,
      amount_nim: 7.5,
      amount_luna: "750000",
      payout_type: "stake_return_plus_bonus",
      status: "sent",
      tx_hash: confirmedTxHash,
    });

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normProfile }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(json.error.includes("already been claimed"));
    assert.ok(json.error.includes(confirmedTxHash));
  });

  // ── TEST H: Real incident reproduction ───────────────────────────────
  it("H. Real incident reproduction: Expected profile NQ59 vs actual funding wallet NQ29", async () => {
    const realChallengeId = "ch_1789445466445_334a52";
    const realStakeTxHash = "78764d8e04524b02fbb03a6fa0810c9b6d4937ecc8fc14a3cf72de1f5bace266";
    setupMockBlockchain({ stakeSender: normFunding });

    // 1. Participant is stored with profile_wallet: NQ59 and wallet_address: NQ29
    await db.createChallenge(
      {
        id: realChallengeId,
        title: "7 Days of Early Rising",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile, // NQ59
        status: "completed",
        starts_at: "2026-09-15T04:11:06.000Z",
        ends_at: "2026-09-22T04:11:06.000Z",
      },
      {
        wallet_address: normFunding, // NQ29 (actual stake sender)
        profile_wallet: normProfile, // NQ59 (user's profile identity)
        stake_tx_hash: realStakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    // 2. User claims via profile wallet NQ59
    const res = await fetch(`${serverBaseUrl}/api/challenges/${realChallengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normProfile }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 200, `Claim failed: ${JSON.stringify(json)}`);

    // Demonstrates why NQ29 was selected:
    // NQ29 is the authoritative funding identity that signed and sent the original stake transaction!
    assert.strictEqual(json.fundingAddress, normFunding, "Must pay authoritative funding wallet NQ29");
    assert.strictEqual(json.recipient, normFunding, "Recipient must be NQ29");
    assert.strictEqual(json.profileWallet, normProfile, "Profile wallet must be recorded as NQ59");
    assert.strictEqual(json.amountNim, 7.5, "Solo 5 NIM stake + 50% bonus = 7.5 NIM");

    // 3. Demonstrates that getUserTransactions for NQ59 now retrieves the payout to NQ29!
    const userTxs = await db.getUserTransactions(normProfile);
    const payoutTx = userTxs.find((tx) => tx.challenge_id === realChallengeId && tx.type === "payout");
    assert.ok(payoutTx, "User with profile NQ59 must see their payout in their transaction history");
    assert.strictEqual(payoutTx.amount, 7.5);
    assert.strictEqual(payoutTx.status, "confirmed");
  });
});
