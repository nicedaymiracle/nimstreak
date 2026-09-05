import { describe, it, before } from "node:test";
import assert from "node:assert";
import * as db from "../src/db.js";
import { verifyStakeTransaction } from "../src/nimstreak-payout.js";

describe("Minimal Stable Wallet Identity Architecture", () => {
  const profileWallet = "NQ48 ARHS XLJJ X9D1 9LGL 07YS DTK9 2THB 48Y2";
  const fundingWallet = "NQ77 C3P5 CTMY N3BB K15K GB5G C4EB HGM5 NPAN";
  const legacyWallet = "NQ11 1111 2222 3333 4444 5555 6666 7777 8888";

  const normProfile = db.normalizeAddress(profileWallet);
  const normFunding = db.normalizeAddress(fundingWallet);
  const normLegacy = db.normalizeAddress(legacyWallet);

  before(async () => {
    await db.initDb();
  });

  it("1. verifyStakeTransaction derives actual sender when senderAddress is omitted", async () => {
    // In bypass mode, verifyStakeTransaction returns a clean verification receipt with actual sender
    const origSkip = process.env.SKIP_TX_VERIFICATION;
    process.env.SKIP_TX_VERIFICATION = "true";

    try {
      const res = await verifyStakeTransaction({
        txHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        expectedStakeNim: 0.5,
      });

      assert.strictEqual(res.verified, true);
      assert.ok(res.from, "Should return actual sender address");
    } finally {
      process.env.SKIP_TX_VERIFICATION = origSkip;
    }
  });

  it("2. createChallenge stores profile_wallet=NQ48 and wallet_address=NQ77", async () => {
    const challengeId = `ch_test_identity_${Date.now()}`;
    const fullChallenge = await db.createChallenge(
      {
        id: challengeId,
        title: "Stable Profile Test Challenge",
        description: "Test description",
        category: "coding",
        type: "public",
        duration_days: 7,
        stake_nim: 0.5,
        stake_luna: "50000",
        checkin_type: "tap",
        created_by: normProfile,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: "active",
      },
      {
        stake_tx_hash: "abcd567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        wallet_address: normFunding, // funding account
        profile_wallet: normProfile, // stable profile
        stake_amount: 0.5,
        stake_luna: "50000",
        status: "active",
      }
    );

    assert.strictEqual(fullChallenge.id, challengeId);
    assert.strictEqual(fullChallenge.created_by, normProfile);

    // Participant lookup by funding address
    const partByFunding = await db.getParticipant(challengeId, normFunding);
    assert.ok(partByFunding, "Must find participant by funding address NQ77");
    assert.strictEqual(partByFunding.wallet_address, normFunding);
    assert.strictEqual(partByFunding.profile_wallet, normProfile);

    // Participant lookup by profile address
    const partByProfile = await db.getParticipant(challengeId, normProfile);
    assert.ok(partByProfile, "Must find participant by profile address NQ48");
    assert.strictEqual(partByProfile.wallet_address, normFunding);
    assert.strictEqual(partByProfile.profile_wallet, normProfile);
  });

  it("3. getUserChallenges retrieves the challenge under stable profile NQ48", async () => {
    const userChallenges = await db.getUserChallenges(normProfile);
    assert.ok(Array.isArray(userChallenges.all));
    const match = userChallenges.all.find((c) => c.title === "Stable Profile Test Challenge");
    assert.ok(match, "Challenge created with NQ77 funding must be visible to NQ48 profile");
    assert.strictEqual(match.profile_wallet, normProfile);
    assert.strictEqual(match.wallet_address, normFunding);
  });

  it("4. recordCheckin records checkin for NQ77 participant while updating NQ48 profile stats", async () => {
    const userChallenges = await db.getUserChallenges(normProfile);
    const challenge = userChallenges.all.find((c) => c.title === "Stable Profile Test Challenge");
    assert.ok(challenge);

    const todayStr = new Date().toISOString().split("T")[0];
    const { checkin } = await db.recordCheckin(
      {
        challenge_id: challenge.challenge_id,
        wallet_address: normFunding,
        profile_wallet: normProfile,
        day_number: 1,
        checkin_date: todayStr,
        proof_text: "Checked in via NQ48 profile",
      },
      {
        current_streak: 1,
        longest_streak: 1,
        total_checkins: 1,
      }
    );

    assert.strictEqual(checkin.wallet_address, normFunding);
    assert.strictEqual(checkin.profile_wallet, normProfile);

    // Calendar check returns checked in for NQ48
    const calendar = await db.getParticipantCalendar(challenge.challenge_id, normProfile);
    assert.ok(calendar);
    const todayCal = calendar.calendar.find((d) => d.date === todayStr);
    assert.ok(todayCal && todayCal.checkedIn === true);

    // Profile gamification streak belongs to NQ48
    const profile = await db.getProfile(normProfile);
    assert.ok((profile.current_active_streak || 0) >= 1);
  });

  it("5. claim / payout records target the actual funding address NQ77", async () => {
    const userChallenges = await db.getUserChallenges(normProfile);
    const challenge = userChallenges.all.find((c) => c.title === "Stable Profile Test Challenge");

    // Record payout record for the funding wallet NQ77
    const payoutRecord = await db.recordPayout({
      challenge_id: challenge.challenge_id,
      wallet_address: normFunding, // Payout goes to NQ77
      amount_nim: 0.5,
      amount_luna: 50000,
      payout_type: "stake_return_plus_bonus",
      tx_hash: "fedc567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      status: "sent",
    });

    assert.strictEqual(payoutRecord.wallet_address, normFunding);

    // Get payout by funding address
    const fetchedPayout = await db.getPayout(challenge.challenge_id, normFunding, "stake_return_plus_bonus");
    assert.ok(fetchedPayout);
    assert.strictEqual(fetchedPayout.wallet_address, normFunding);
    assert.strictEqual(fetchedPayout.status, "sent");
  });

  it("6. Legacy challenges without profile_wallet remain fully compatible", async () => {
    const legacyChallengeId = `ch_legacy_${Date.now()}`;
    await db.createChallenge(
      {
        id: legacyChallengeId,
        title: "Legacy Challenge Without Profile Wallet",
        created_by: normLegacy,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: "active",
      },
      {
        stake_tx_hash: "9999567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        wallet_address: normLegacy,
        // No profile_wallet provided (legacy format)
        stake_amount: 1.0,
        status: "active",
      }
    );

    const legacyPart = await db.getParticipant(legacyChallengeId, normLegacy);
    assert.ok(legacyPart, "Must find legacy participant by wallet_address");
    assert.strictEqual(legacyPart.wallet_address, normLegacy);

    const legacyChallenges = await db.getUserChallenges(normLegacy);
    const legacyMatch = legacyChallenges.all.find((c) => c.challenge_id === legacyChallengeId);
    assert.ok(legacyMatch, "Legacy challenge must be returned in getUserChallenges");
  });

  it("7. /sync-accounts endpoint does not exist in server code", async () => {
    const fs = await import("node:fs");
    const serverFile = new URL("../src/index.js", import.meta.url);
    const content = fs.readFileSync(serverFile, "utf-8");
    assert.strictEqual(content.includes("sync-accounts"), false, "/sync-accounts must not exist in server/src/index.js");
  });
});
