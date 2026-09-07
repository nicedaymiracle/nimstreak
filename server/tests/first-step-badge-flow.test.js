import { describe, it, before } from "node:test";
import assert from "node:assert";
import * as db from "../src/db.js";
import { verifyStakeTransaction } from "../src/nimstreak-payout.js";

describe("First Step Badge Awarding and Retrieval Flow", () => {
  const profileWallet = "NQ48 ARHS XLJJ X9D1 9LGL 07YS DTK9 2THB 48Y2";
  const fundingWallet = "NQ77 C3P5 CTMY N3BB K15K GB5G C4EB HGM5 NPAN";

  const normProfile = db.normalizeAddress(profileWallet);
  const normFunding = db.normalizeAddress(fundingWallet);

  before(async () => {
    // In local test mode without production firestore credentials, this uses persistent memoryStore
    await db.initDb();
  });

  it("completes verified challenge creation and awards First Step badge strictly to NQ48", async () => {
    // 1. Successful verified stake transaction
    const origSkip = process.env.SKIP_TX_VERIFICATION;
    process.env.SKIP_TX_VERIFICATION = "true";

    let onChainTx;
    try {
      onChainTx = await verifyStakeTransaction({
        txHash: "ba00000100020003000400050006000700080009000a000b000c000d000e000f",
        senderAddress: normFunding,
        expectedStakeNim: 1.0,
      });
    } finally {
      process.env.SKIP_TX_VERIFICATION = origSkip;
    }

    assert.strictEqual(onChainTx.verified, true);
    assert.strictEqual(onChainTx.from, normFunding);

    // 2. Challenge successfully created
    const challengeId = `ch_badge_test_${Date.now()}`;
    const createdChallenge = await db.createChallenge(
      {
        id: challengeId,
        title: "Morning Habit Challenge",
        description: "Test daily morning habit",
        category: "health",
        type: "public",
        duration_days: 14,
        stake_nim: 1.0,
        stake_luna: "100000",
        checkin_type: "tap",
        created_by: normProfile,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        status: "active",
      },
      {
        stake_tx_hash: "ba00000100020003000400050006000700080009000a000b000c000d000e000f",
        wallet_address: onChainTx.from, // NQ77 funding wallet
        profile_wallet: normProfile,     // NQ48 profile identity
        stake_amount: 1.0,
        stake_luna: "100000",
        status: "active",
        current_streak: 0,
        longest_streak: 0,
        total_checkins: 0,
      }
    );

    // Assert: challenge exists
    assert.ok(createdChallenge, "Challenge must be created");
    const retrievedChallenge = await db.getChallengeById(challengeId);
    assert.ok(retrievedChallenge, "Challenge must exist in database");
    assert.strictEqual(retrievedChallenge.id, challengeId);

    // Assert: participant exists
    const participant = await db.getParticipant(challengeId, normFunding);
    assert.ok(participant, "Participant must exist in database");

    // Assert: profile_wallet = NQ48
    assert.strictEqual(participant.profile_wallet, normProfile, "Participant profile_wallet must be NQ48");

    // Assert: wallet_address = NQ77
    assert.strictEqual(participant.wallet_address, normFunding, "Participant wallet_address must be NQ77");

    // Assert: First Step badge exists for NQ48
    const profileBadges = await db.getBadges(normProfile);
    const firstStepBadge = profileBadges.find((b) => b.badge_type === "first_challenge");
    assert.ok(firstStepBadge, "First Step badge must exist for NQ48");
    assert.strictEqual(firstStepBadge.wallet_address, normProfile, "Badge wallet_address must strictly be NQ48");
    assert.strictEqual(firstStepBadge.badge_type, "first_challenge");

    // Assert: First Step badge does NOT get created for NQ77 (it resolves to NQ48 or returns the profile's badge without a separate NQ77 doc)
    let nq77DirectBadge = null;
    for (const b of db.memoryStore.badges.values()) {
      if (b.wallet_address === normFunding && b.badge_type === "first_challenge") {
        nq77DirectBadge = b;
      }
    }
    assert.strictEqual(nq77DirectBadge, null, "First Step badge must NOT get created directly for NQ77");

    // Assert: creating/joining another challenge does NOT create a duplicate First Step badge
    const secondChallengeId = `ch_badge_test_2_${Date.now()}`;
    await db.createChallenge(
      {
        id: secondChallengeId,
        title: "Evening Meditation Challenge",
        description: "Second challenge test",
        category: "mindfulness",
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
        stake_tx_hash: "ba00222200020003000400050006000700080009000a000b000c000d000e000f",
        wallet_address: normFunding,
        profile_wallet: normProfile,
        stake_amount: 0.5,
        stake_luna: "50000",
        status: "active",
        current_streak: 0,
        longest_streak: 0,
        total_checkins: 0,
      }
    );

    const badgesAfterSecond = await db.getBadges(normProfile);
    const firstStepBadges = badgesAfterSecond.filter((b) => b.badge_type === "first_challenge");
    assert.strictEqual(firstStepBadges.length, 1, "Creating another challenge must NOT create a duplicate First Step badge");

    // Joining another challenge also does not duplicate
    const thirdChallengeId = `ch_badge_test_3_${Date.now()}`;
    await db.createChallenge(
      {
        id: thirdChallengeId,
        title: "Third Challenge",
        description: "Third challenge test",
        category: "coding",
        type: "public",
        duration_days: 7,
        stake_nim: 0.5,
        stake_luna: "50000",
        checkin_type: "tap",
        created_by: "NQ99TESTCREATOR999999999999999999999999999",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: "active",
      },
      {
        stake_tx_hash: "ba00333300020003000400050006000700080009000a000b000c000d000e000f",
        wallet_address: "NQ99TESTCREATOR999999999999999999999999999",
        profile_wallet: "NQ99TESTCREATOR999999999999999999999999999",
        stake_amount: 0.5,
        stake_luna: "50000",
        status: "active",
        current_streak: 0,
        longest_streak: 0,
        total_checkins: 0,
      }
    );

    await db.addParticipant(thirdChallengeId, {
      wallet_address: normFunding,
      profile_wallet: normProfile,
      stake_amount: 0.5,
      stake_luna: "50000",
      status: "active",
    });

    const badgesAfterJoin = await db.getBadges(normProfile);
    const firstStepBadgesAfterJoin = badgesAfterJoin.filter((b) => b.badge_type === "first_challenge");
    assert.strictEqual(firstStepBadgesAfterJoin.length, 1, "Joining another challenge must NOT create a duplicate First Step badge");
  });
});
