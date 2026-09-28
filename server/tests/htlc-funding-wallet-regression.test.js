import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as db from "../src/db.js";
import { app } from "../src/index.js";
import {
  resolveVerifiedFundingAddress,
  verifyStakeTransaction,
  sendStreakPayout,
  TREASURY_ADDRESS,
} from "../src/nimstreak-payout.js";

// Ensure test environment is forced
process.env.NODE_ENV = "test";

describe("HTLC Funding Wallet Resolution & Payout Identity Regression Suite", () => {
  let serverInstance;
  let serverBaseUrl;
  const originalFetch = globalThis.fetch;

  // Real addresses from production incident
  const userFunderWallet = "NQ59 SBB2 631Q X85Y 3X25 S586 XGM1 VY9P Q2X6";
  const normUserFunder = db.normalizeAddress(userFunderWallet);

  const htlcContractAddress = "NQ25 422M B53U AHRN LLL5 26RJ 4N0Y JSXT 5MJN";
  const normHtlcContract = db.normalizeAddress(htlcContractAddress);

  const htlcContractAddressNQ29 = "NQ29 GT4G PPLK LD1P YUVK BRB3 AM55 N3KA B1NS";
  const normHtlcContractNQ29 = db.normalizeAddress(htlcContractAddressNQ29);

  const otherWallet = "NQ48 ARHS XLJJ X9D1 9LGL 07YS DTK9 2THB 48Y2";
  const normOther = db.normalizeAddress(otherWallet);

  const profileWallet = "NQ78 R5YX QCJJ EBLP XMG1 44S8 MJXH NV9R HHAU";
  const normProfile = db.normalizeAddress(profileWallet);

  const attackerWallet = "NQ33 9999 8888 7777 6666 5555 4444 3333 2222";
  const normAttacker = db.normalizeAddress(attackerWallet);

  const creatorWallet = "NQ11 AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH";
  const normCreator = db.normalizeAddress(creatorWallet);

  // Authentic on-chain early-resolve HTLC proof from production transaction b0c3605c58...
  // Decodes to creator: NQ59 SBB2 631Q X85Y 3X25 S586 XGM1 VY9P Q2X6
  const VALID_HTLC_PROOF_HEX =
    "010091b21f4b100273bd7034f6369c29d1f7ba72dba7de6720ad3cd8b8191621891300e8c02d999697560096b8f88188f5f087074dbe4d765a3aed83f9ad17bbe518eb4c0ea1e4a1d55f59048e1b1675089ce041863a8a3e72b54e8ff30381609cd20000150fdee099d12e37901cf7a40ea321cdcc368260ad5fc633bc39b6e70575bcf700bf3420ec6d97b5892e44012194c7d8b6d41728c219987ac9d16b8918f4bf75e1a5fee157d639d09b8c168f47a0b124f8f83b6a820d48a3b56567a3cc45a9b100";

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

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setupMockBlockchain({
    txData = null,
    payoutConfirmedHash = "728d2ed6510527b8b86c1d1bf75dc12a0c6c8e84ea81087be4b8dda40b3d08fd",
  } = {}) {
    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url || "");
      if (urlStr.startsWith("http://127.0.0.1") || urlStr.startsWith("http://localhost")) {
        return originalFetch(url, opts);
      }

      const bodyStr = opts?.body || "";
      if (urlStr.includes("rpc") || bodyStr.includes("jsonrpc")) {
        try {
          const json = JSON.parse(bodyStr);
          if (json.method === "getTransactionByHash") {
            const hash = json.params?.[0];
            // If querying the newly broadcast payout
            if (hash === payoutConfirmedHash) {
              return {
                ok: true,
                json: async () => ({
                  jsonrpc: "2.0",
                  result: {
                    data: {
                      hash,
                      from: TREASURY_ADDRESS,
                      to: normUserFunder,
                      value: 750000,
                      executionResult: true,
                      blockNumber: 62601997,
                    },
                  },
                  id: json.id || 1,
                }),
              };
            }

            // Return custom mock txData if provided
            if (txData) {
              return {
                ok: true,
                json: async () => ({
                  jsonrpc: "2.0",
                  result: {
                    data: {
                      hash,
                      ...txData,
                    },
                  },
                  id: json.id || 1,
                }),
              };
            }
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

          if (json.method === "getBlockByNumber") {
            return {
              ok: true,
              json: async () => ({
                jsonrpc: "2.0",
                result: {
                  data: {
                    number: 62601990,
                  },
                },
                id: json.id || 1,
              }),
            };
          }

          if (json.method === "sendRawTransaction") {
            return {
              ok: true,
              json: async () => ({
                jsonrpc: "2.0",
                result: {
                  data: payoutConfirmedHash,
                },
                id: json.id || 1,
              }),
            };
          }
        } catch (_) {}
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    };
  }

  // ── TEST 1: BASIC TRANSACTION ──────────────────────────────────────────────
  it("TEST 1: Basic transaction (fromType=0) resolves normal sender as funding wallet", () => {
    const basicTx = {
      hash: "1111111111111111111111111111111111111111111111111111111111111111",
      from: normUserFunder,
      fromType: 0,
      to: TREASURY_ADDRESS,
      value: 500000,
    };

    const resolved = resolveVerifiedFundingAddress(basicTx);
    assert.strictEqual(resolved.isHtlc, false);
    assert.strictEqual(resolved.transactionType, 0);
    assert.strictEqual(resolved.fundingAddress, normUserFunder, "Funding wallet must be the direct sender NQ_USER");
    assert.strictEqual(resolved.transactionAddress, normUserFunder);
  });

  // ── TEST 2: HTLC TRANSACTION ───────────────────────────────────────────────
  it("TEST 2: HTLC transaction (fromType=2) resolves decoded proof.creator as funding wallet, NOT tx.from", () => {
    const htlcTx = {
      hash: "b0c3605c5820de2c861d57753be189f91f2c075cdf117ef0573087e39727f60a",
      from: normHtlcContract,
      fromType: 2,
      to: TREASURY_ADDRESS,
      value: 500000,
      proof: VALID_HTLC_PROOF_HEX,
    };

    const resolved = resolveVerifiedFundingAddress(htlcTx);
    assert.strictEqual(resolved.isHtlc, true);
    assert.strictEqual(resolved.transactionType, 2);
    assert.strictEqual(resolved.transactionAddress, normHtlcContract, "Raw tx address is the HTLC contract NQ25");
    assert.strictEqual(resolved.fundingAddress, normUserFunder, "True funding address must be the decoded proof.creator NQ59");
    assert.notStrictEqual(resolved.fundingAddress, normHtlcContract, "Funding address must NEVER be tx.from");
  });

  // ── TEST 3: HTLC CHALLENGE CREATION ────────────────────────────────────────
  it("TEST 3: Challenge creation with HTLC stake stores proof.creator in participant.wallet_address (NOT tx.from)", async () => {
    const stakeTxHash = "2222222222222222222222222222222222222222222222222222222222222222";
    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract,
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX,
        executionResult: true,
      },
    });

    const res = await fetch(`${serverBaseUrl}/api/challenges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test HTLC Challenge",
        description: "Testing HTLC creation storage",
        category: "fitness",
        type: "public",
        durationDays: 7,
        stakeNim: 5,
        stakeTxHash,
        walletAddress: normProfile,
        fundingAddress: normUserFunder,
      }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 201, `Challenge creation must succeed: ${JSON.stringify(json)}`);
    const createdChallenge = json;

    const participant = await db.getParticipant(createdChallenge.id, normUserFunder);
    assert.ok(participant, "Participant record must exist for the creator");
    assert.strictEqual(
      participant.wallet_address,
      normUserFunder,
      "participant.wallet_address MUST equal proof.creator (NQ59)"
    );
    assert.notStrictEqual(
      participant.wallet_address,
      normHtlcContract,
      "participant.wallet_address must NEVER be stored as HTLC contract (NQ25)"
    );
    assert.strictEqual(participant.profile_wallet, normProfile, "profile_wallet must remain separate");
  });

  // ── TEST 4: HTLC CLAIM ─────────────────────────────────────────────────────
  it("TEST 4: Claim on HTLC challenge sends payout to decoded proof.creator (NQ_USER)", async () => {
    const challengeId = `ch_htlc_claim_${Date.now()}`;
    const stakeTxHash = "3333333333333333333333333333333333333333333333333333333333333333";
    const payoutTxHash = "aaaa000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract,
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX,
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    // Create challenge and participant where participant.wallet_address = proof.creator (NQ59)
    await db.createChallenge(
      {
        id: challengeId,
        title: "HTLC Payout Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normUserFunder, // Correctly stored as proof.creator
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
    assert.strictEqual(res.status, 200, `Claim must succeed: ${JSON.stringify(json)}`);
    assert.strictEqual(json.fundingAddress, normUserFunder, "Claim fundingAddress must be NQ_USER (NQ59)");
    assert.strictEqual(json.recipient, normUserFunder, "Payout recipient must be NQ_USER (NQ59)");
    assert.notStrictEqual(json.recipient, normHtlcContract, "Payout recipient must NEVER be HTLC contract (NQ25)");
  });

  // ── TEST 5: HTLC MISMATCH ──────────────────────────────────────────────────
  it("TEST 5: Claim is rejected when stored participant.wallet_address does not match HTLC proof.creator", async () => {
    const challengeId = `ch_htlc_mismatch_${Date.now()}`;
    const stakeTxHash = "4444444444444444444444444444444444444444444444444444444444444444";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract,
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX, // Decodes to creator = NQ59
        executionResult: true,
      },
    });

    // Participant was wrongly stored with a different wallet (e.g. the HTLC contract NQ25 or an unrelated address)
    await db.createChallenge(
      {
        id: challengeId,
        title: "HTLC Mismatch Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normOther,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normOther, // NQ48 != NQ59
        profile_wallet: normOther,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normOther }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 400, "Claim must be rejected due to identity mismatch");
    assert.ok(json.error.includes("Mismatched participant funding identity"), "Error must clearly cite mismatch");
  });

  // ── TEST 6: PROFILE WALLET MUST NOT CONTROL PAYOUT ─────────────────────────
  it("TEST 6: Payout recipient is strictly proof.creator (NQ_FUNDER), ignoring profile_wallet", async () => {
    const challengeId = `ch_profile_ignore_${Date.now()}`;
    const stakeTxHash = "5555555555555555555555555555555555555555555555555555555555555555";
    const payoutTxHash = "bbbb000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract,
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX, // Decodes to creator = NQ59
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    // profile_wallet is NQ78, but proof.creator is NQ59
    await db.createChallenge(
      {
        id: challengeId,
        title: "Profile Wallet Ignore Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile, // NQ78
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normUserFunder, // NQ59
        profile_wallet: normProfile,    // NQ78
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
    assert.strictEqual(res.status, 200);
    assert.strictEqual(json.recipient, normUserFunder, "Recipient must be NQ_FUNDER (NQ59), not NQ_PROFILE (NQ78)");
  });

  // ── TEST 7: CONNECTED WALLET MUST NOT CONTROL PAYOUT ───────────────────────
  it("TEST 7: Currently connected wallet in claim request body cannot hijack payout recipient", async () => {
    const challengeId = `ch_attacker_ignore_${Date.now()}`;
    const stakeTxHash = "6666666666666666666666666666666666666666666666666666666666666666";
    const payoutTxHash = "cccc000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract,
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX, // Decodes to creator = NQ59
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    await db.createChallenge(
      {
        id: challengeId,
        title: "Attacker Hijack Resistance Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normUserFunder,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normUserFunder,
        profile_wallet: normUserFunder,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    // If an attacker calls claim specifying their own wallet:
    // Because the participant is indexed under NQ59, querying for NQ33 returns 404
    const resAttacker = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normAttacker }),
    });
    assert.strictEqual(resAttacker.status, 404, "Attacker cannot claim participant not associated with their wallet");

    // And even if the user claims through their profile:
    const resUser = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normUserFunder }),
    });
    const jsonUser = await resUser.json();
    assert.strictEqual(resUser.status, 200);
    assert.strictEqual(jsonUser.recipient, normUserFunder, "Recipient remains strictly the verified funder");
  });

  // ── TEST 8: CREATOR WALLET MUST NOT CONTROL PAYOUT ─────────────────────────
  it("TEST 8: Challenge creator wallet does not divert payout if participant is funded by a different wallet", async () => {
    const challengeId = `ch_creator_ignore_${Date.now()}`;
    const stakeTxHash = "7777777777777777777777777777777777777777777777777777777777777777";
    const payoutTxHash = "dddd000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract,
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX, // Decodes to creator = NQ59
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    // Challenge creator is NQ11, but participant is funded by NQ59
    await db.createChallenge(
      {
        id: challengeId,
        title: "Creator Diversion Resistance Test",
        type: "public",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normCreator, // NQ11
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normUserFunder, // NQ59
        profile_wallet: normUserFunder,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normUserFunder }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(json.recipient, normUserFunder, "Recipient must be NQ_FUNDER (NQ59), NOT NQ_CREATOR (NQ11)");
    assert.notStrictEqual(json.recipient, normCreator);
  });

  // ── TEST 9: HTLC DECODE FAILURE FAILS CLOSED ───────────────────────────────
  it("TEST 9: HTLC decode failure fails closed without falling back to tx.from or guessing", () => {
    const corruptHtlcTx = {
      hash: "8888888888888888888888888888888888888888888888888888888888888888",
      from: normHtlcContract,
      fromType: 2,
      to: TREASURY_ADDRESS,
      value: 500000,
      proof: "01badbeefdeadbeef1234567890", // Corrupt proof
    };

    assert.throws(
      () => {
        resolveVerifiedFundingAddress(corruptHtlcTx);
      },
      (err) => {
        return err.message.includes("Failed to decode HTLC proof");
      },
      "Must throw an error and fail closed on undecodable HTLC proof"
    );

    const noProofHtlcTx = {
      hash: "9999999999999999999999999999999999999999999999999999999999999999",
      from: normHtlcContract,
      fromType: 2,
      to: TREASURY_ADDRESS,
      value: 500000,
      proof: "",
    };

    assert.throws(
      () => {
        resolveVerifiedFundingAddress(noProofHtlcTx);
      },
      (err) => {
        return err.message.includes("contains no proof data");
      },
      "Must throw an error when HTLC proof is empty"
    );
  });

  // ── TEST 10: DUPLICATE CLAIM REMAINS PROTECTED ─────────────────────────────
  it("TEST 10: Confirmed HTLC payout cannot be claimed twice (duplicate protection)", async () => {
    const challengeId = `ch_htlc_double_${Date.now()}`;
    const stakeTxHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const payoutTxHash = "eeee000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract,
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX,
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    await db.createChallenge(
      {
        id: challengeId,
        title: "HTLC Double Claim Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normUserFunder,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normUserFunder,
        profile_wallet: normUserFunder,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    // First claim attempt: succeeds
    const res1 = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normUserFunder }),
    });
    const json1 = await res1.json();
    assert.strictEqual(res1.status, 200, `First claim must succeed: ${JSON.stringify(json1)}`);
    assert.strictEqual(json1.recipient, normUserFunder);

    // Second claim attempt: rejected
    const res2 = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normUserFunder }),
    });
    const json2 = await res2.json();
    assert.strictEqual(res2.status, 400, "Second claim attempt must be rejected");
    assert.ok(json2.error.includes("already been claimed"), "Error must state that payout was already claimed");
  });

  // ── TEST 11: LEGACY HTLC STATE BACKWARD-COMPATIBILITY ──────────────────────
  it("TEST 11: Legacy challenge with stored HTLC contract in participant.wallet_address claims successfully to proof.creator", async () => {
    const challengeId = `ch_legacy_htlc_${Date.now()}`;
    const stakeTxHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const payoutTxHash = "ffff000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract, // NQ25...
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX, // Decodes to proof.creator = NQ59...
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    // Legacy challenge participant record stored BEFORE the HTLC fix:
    // participant.wallet_address is the temporary HTLC contract address
    await db.createChallenge(
      {
        id: challengeId,
        title: "Legacy HTLC Bridge Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normHtlcContract, // Stored as HTLC contract NQ25... (the old bug!)
        profile_wallet: normProfile,       // NQ59...
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
    assert.strictEqual(res.status, 200, `Claim must succeed for legacy HTLC participant: ${JSON.stringify(json)}`);
    assert.strictEqual(
      json.recipient,
      normUserFunder,
      "Payout recipient must be upgraded to decoded proof.creator (NQ59)"
    );
    assert.notStrictEqual(
      json.recipient,
      normHtlcContract,
      "Payout recipient must NEVER be the temporary HTLC contract address (NQ25)"
    );
  });

  // ── TEST 12: UNRELATED STORED WALLET REJECTION SECURITY TEST ───────────────
  it("TEST 12: Genuine mismatch (stored wallet != HTLC contract AND != proof.creator) is rejected with 400", async () => {
    const challengeId = `ch_genuine_mismatch_${Date.now()}`;
    const stakeTxHash = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

    let payoutBroadcastAttempted = false;
    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContract, // NQ25...
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX, // Decodes to creator = NQ59...
        executionResult: true,
      },
    });

    // Monkey-patch global.fetch to detect any payout broadcast attempt
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (options && options.body && typeof options.body === "string" && options.body.includes("sendRawTransaction")) {
        payoutBroadcastAttempted = true;
      }
      return originalFetch(url, options);
    };

    // Stored participant wallet is an unrelated third-party address (NQ48...)
    await db.createChallenge(
      {
        id: challengeId,
        title: "Genuine Identity Mismatch Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normOther, // NQ48...
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normOther, // NQ48 != NQ25 (contract) AND != NQ59 (creator)
        profile_wallet: normOther,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normOther }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 400, "Claim must be rejected due to genuine identity mismatch");
    assert.ok(
      json.error && json.error.includes("Mismatched participant funding identity"),
      `Error message must cite mismatch: ${json.error}`
    );
    assert.strictEqual(payoutBroadcastAttempted, false, "Payout must NEVER be broadcast when identity mismatches");

    // Restore fetch
    global.fetch = originalFetch;
  });

  // ── TEST 13: HTLC NQ29→NQ59 WITH FORENSIC METADATA ──────────────────────────
  it("TEST 13: HTLC NQ29→NQ59 pays strictly decoded proof.creator (NQ59) and attaches forensic metadata", async () => {
    const challengeId = `ch_htlc_nq29_${Date.now()}`;
    const stakeTxHash = "1212121212121212121212121212121212121212121212121212121212121212";
    const payoutTxHash = "9900000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContractNQ29, // NQ29...
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX, // decodes to proof.creator = NQ59...
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    await db.createChallenge(
      {
        id: challengeId,
        title: "HTLC NQ29 to NQ59 Forensic Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normUserFunder, // NQ59...
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
    assert.strictEqual(res.status, 200, `Claim must succeed: ${JSON.stringify(json)}`);
    assert.strictEqual(json.recipient, normUserFunder, "Recipient must be NQ59");
    assert.notStrictEqual(json.recipient, normHtlcContractNQ29, "Recipient must NEVER be NQ29");

    // Forensic metadata assertions on API response
    assert.ok(json.forensics, "Claim response must contain forensic metadata");
    assert.strictEqual(json.forensics.raw_from, normHtlcContractNQ29, "raw_from must be NQ29");
    assert.strictEqual(json.forensics.from_type, 2, "from_type must be 2");
    assert.strictEqual(json.forensics.resolution_source, "onchain_htlc_proof", "resolution_source must be onchain_htlc_proof");
    assert.strictEqual(json.forensics.verified_funding_address, normUserFunder, "verified_funding_address must be NQ59");
    assert.strictEqual(json.forensics.code_version, "v5.1-htlc-hardened", "code_version must be v5.1-htlc-hardened");

    // Forensic metadata assertions on stored DB record
    const payoutRecord = await db.getPayout(challengeId, normUserFunder, "solo_stake_return");
    assert.ok(payoutRecord, "Payout record must be stored in DB");
    assert.strictEqual(payoutRecord.raw_from, normHtlcContractNQ29);
    assert.strictEqual(payoutRecord.from_type, 2);
    assert.strictEqual(payoutRecord.resolution_source, "onchain_htlc_proof");
    assert.strictEqual(payoutRecord.verified_funding_address, normUserFunder);
    assert.strictEqual(payoutRecord.code_version, "v5.1-htlc-hardened");
  });

  // ── TEST 14: MISSING PROOF → NO BROADCAST ──────────────────────────────────
  it("TEST 14: Missing HTLC proof fails closed and causes NO broadcast", async () => {
    const challengeId = `ch_missing_proof_${Date.now()}`;
    const stakeTxHash = "2323232323232323232323232323232323232323232323232323232323232323";

    let broadcastAttempted = false;
    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url || "");
      if (urlStr.startsWith("http://127.0.0.1") || urlStr.startsWith("http://localhost")) {
        return originalFetch(url, opts);
      }
      const bodyStr = opts?.body || "";
      if (bodyStr.includes("sendRawTransaction")) {
        broadcastAttempted = true;
      }
      if (bodyStr.includes("getTransactionByHash")) {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            result: {
              data: {
                hash: stakeTxHash,
                from: normHtlcContractNQ29,
                fromType: 2,
                to: TREASURY_ADDRESS,
                value: 500000,
                proof: "", // MISSING PROOF DATA
                executionResult: true,
              },
            },
            id: 1,
          }),
        };
      }
      if (bodyStr.includes("getAccountByAddress")) {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            result: { data: { balance: 1000000000 } },
            id: 1,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    await db.createChallenge(
      {
        id: challengeId,
        title: "Missing Proof Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normUserFunder,
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
    assert.strictEqual(res.status, 400, "Claim must fail closed with 400 on missing proof");
    assert.ok(json.error.includes("proof") || json.error.includes("verification failed"));
    assert.strictEqual(broadcastAttempted, false, "Payout must NEVER be broadcast when HTLC proof is missing");
  });

  // ── TEST 15: BASIC TRANSACTION → TX.FROM ───────────────────────────────────
  it("TEST 15: Basic transaction (fromType=0) uses tx.from as verified recipient with basic forensic metadata", async () => {
    const challengeId = `ch_basic_tx_${Date.now()}`;
    const stakeTxHash = "3434343434343434343434343434343434343434343434343434343434343434";
    const payoutTxHash = "8800000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normOther, // NQ48...
        fromType: 0,
        to: TREASURY_ADDRESS,
        value: 500000,
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    await db.createChallenge(
      {
        id: challengeId,
        title: "Basic Transaction Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normOther,
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
    assert.strictEqual(res.status, 200, `Claim must succeed: ${JSON.stringify(json)}`);
    assert.strictEqual(json.recipient, normOther, "Recipient must be basic tx.from (NQ48)");
    assert.strictEqual(json.forensics.resolution_source, "onchain_basic_sender");
    assert.strictEqual(json.forensics.raw_from, normOther);
    assert.strictEqual(json.forensics.from_type, 0);
    assert.strictEqual(json.forensics.verified_funding_address, normOther);
  });

  // ── TEST 16: LEGACY STORED NQ29 → UPGRADED TO NQ59 ────────────────────────
  it("TEST 16: Legacy stored NQ29 upgrades participant record in DB to NQ59 and pays NQ59", async () => {
    const challengeId = `ch_legacy_upgrade_${Date.now()}`;
    const stakeTxHash = "4545454545454545454545454545454545454545454545454545454545454545";
    const payoutTxHash = "7700000100020003000400050006000700080009000a000b000c000d000e000f";

    setupMockBlockchain({
      txData: {
        hash: stakeTxHash,
        from: normHtlcContractNQ29, // NQ29...
        fromType: 2,
        to: TREASURY_ADDRESS,
        value: 500000,
        proof: VALID_HTLC_PROOF_HEX, // decodes to NQ59...
        executionResult: true,
      },
      payoutConfirmedHash: payoutTxHash,
    });

    // Stored BEFORE fix: participant.wallet_address is the disposable HTLC contract NQ29
    await db.createChallenge(
      {
        id: challengeId,
        title: "Legacy Upgrade Bridge Test",
        type: "solo",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: normProfile,
        status: "completed",
        starts_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        wallet_address: normHtlcContractNQ29, // Old bug: stored as HTLC contract
        profile_wallet: normProfile,
        stake_tx_hash: stakeTxHash,
        stake_amount: 5,
        stake_luna: "500000",
        status: "completed",
      }
    );

    // Verify stored participant has old NQ29 wallet
    const beforePart = await db.getParticipant(challengeId, normHtlcContractNQ29);
    assert.ok(beforePart);
    assert.strictEqual(beforePart.wallet_address, normHtlcContractNQ29);

    const res = await fetch(`${serverBaseUrl}/api/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normProfile }),
    });

    const json = await res.json();
    assert.strictEqual(res.status, 200, `Claim must succeed: ${JSON.stringify(json)}`);
    assert.strictEqual(json.recipient, normUserFunder, "Payout recipient must be upgraded NQ59");
    assert.notStrictEqual(json.recipient, normHtlcContractNQ29);

    // Verify participant record was upgraded in DB to NQ59
    const afterPart = await db.getParticipant(challengeId, normUserFunder);
    assert.ok(afterPart, "Participant must be accessible under upgraded NQ59 wallet");
    assert.strictEqual(afterPart.wallet_address, normUserFunder);
    assert.strictEqual(afterPart.legacy_htlc_contract, normHtlcContractNQ29);
  });

  // ── TEST 17: RECIPIENT MISMATCH → LOWEST-LEVEL GUARD ABORTS WITH NO BROADCAST
  it("TEST 17: Lowest-level sendStreakPayout guard rejects recipient mismatch and disallowed HTLC contract addresses", async () => {
    let broadcastCount = 0;
    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url || "");
      if (urlStr.startsWith("http://127.0.0.1") || urlStr.startsWith("http://localhost")) {
        return originalFetch(url, opts);
      }
      const bodyStr = opts?.body || "";
      if (bodyStr.includes("sendRawTransaction")) {
        broadcastCount++;
      }
      if (bodyStr.includes("getAccountByAddress")) {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            result: { data: { type: 2, balance: 1000000 } }, // HTLC contract account type
            id: 1,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    // 17a. Mismatch: to !== verifiedFundingAddress
    await assert.rejects(
      async () => {
        await sendStreakPayout({
          to: normHtlcContractNQ29,
          amountNim: 5,
          verifiedFundingAddress: normUserFunder, // NQ59 != NQ29
        });
      },
      (err) => {
        assert.match(err.message, /CRITICAL PAYOUT INVARIANT VIOLATION/);
        assert.match(err.message, /does not match verified funding address/);
        return true;
      }
    );

    // 17b. Disallowed HTLC contract address
    await assert.rejects(
      async () => {
        await sendStreakPayout({
          to: normHtlcContractNQ29,
          amountNim: 5,
          verifiedFundingAddress: normHtlcContractNQ29,
          disallowedAddresses: [normHtlcContractNQ29],
        });
      },
      (err) => {
        assert.match(err.message, /CRITICAL PAYOUT INVARIANT VIOLATION/);
        assert.match(err.message, /is an HTLC contract or disallowed address/);
        return true;
      }
    );

    // 17c. Missing verifiedFundingAddress
    await assert.rejects(
      async () => {
        await sendStreakPayout({
          to: normUserFunder,
          amountNim: 5,
          verifiedFundingAddress: null,
        });
      },
      (err) => {
        assert.match(err.message, /verifiedFundingAddress is required/);
        return true;
      }
    );

    // 17d. On-chain account has type 2 (HTLC contract)
    await assert.rejects(
      async () => {
        await sendStreakPayout({
          to: normHtlcContractNQ29,
          amountNim: 5,
          verifiedFundingAddress: normHtlcContractNQ29,
        });
      },
      (err) => {
        assert.match(err.message, /is an on-chain HTLC contract \(type: 2\)/);
        return true;
      }
    );

    // Verify 0 broadcasts
    assert.strictEqual(broadcastCount, 0, "No transactions must be broadcast when guard rejects recipient");
  });
});
