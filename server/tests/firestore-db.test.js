import { describe, it, before } from "node:test";
import assert from "node:assert";
import * as db from "../src/db.js";

describe("NimStreak Persistence Layer (Firestore & In-Memory Fallback)", () => {
  const testWallet = "NQ07 1111 2222 3333 4444 5555 6666 7777 8888";
  const normalizedTestWallet = db.normalizeAddress(testWallet);

  before(async () => {
    await db.initDb();
  });

  it("normalizes Nimiq addresses consistently", () => {
    assert.strictEqual(
      db.normalizeAddress("nq07 1111 2222 3333 4444 5555 6666 7777 8888"),
      "NQ0711112222333344445555666677778888"
    );
  });

  it("retrieves global platform statistics", async () => {
    const stats = await db.getGlobalStats();
    assert.ok(typeof stats.totalUsers === "number");
    assert.ok(typeof stats.totalNimStaked === "number");
    assert.ok(typeof stats.activeChallenges === "number");
    assert.ok(typeof stats.totalCheckins === "number");
    assert.ok(typeof stats.totalNimPaid === "number");
  });

  it("creates and updates user profiles", async () => {
    const profile = await db.getProfile(testWallet);
    assert.strictEqual(profile.wallet_address, normalizedTestWallet);
    assert.ok(profile.display_name.startsWith("Streaker_"));

    const updated = await db.updateProfile(testWallet, { display_name: "MasterStreaker" });
    assert.strictEqual(updated.display_name, "MasterStreaker");

    const fetchedAgain = await db.getProfile(testWallet);
    assert.strictEqual(fetchedAgain.display_name, "MasterStreaker");
  });

  it("creates a new challenge with creator as active participant", async () => {
    const challengeData = {
      id: "test-challenge-persistence-1",
      title: "Test 7-Day Pushup Sprint",
      description: "Do 50 pushups daily",
      category: "fitness",
      type: "public",
      duration_days: 7,
      stake_nim: 5,
      stake_luna: "500000",
      checkin_type: "tap",
      created_by: testWallet,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      status: "active",
      max_participants: 25,
      invite_code: "PUSH7",
    };

    const participantData = {
      stake_tx_hash: "a".repeat(64),
      stake_amount: 5,
      stake_luna: "500000",
      status: "active",
      current_streak: 0,
      longest_streak: 0,
      total_checkins: 0,
    };

    const created = await db.createChallenge(challengeData, participantData);
    assert.strictEqual(created.id, "test-challenge-persistence-1");
    assert.strictEqual(created.status, "active");

    const fetched = await db.getChallengeById("test-challenge-persistence-1");
    assert.strictEqual(fetched.title, "Test 7-Day Pushup Sprint");

    const creatorPart = await db.getParticipant("test-challenge-persistence-1", testWallet);
    assert.ok(creatorPart);
    assert.strictEqual(creatorPart.status, "active");
  });

  it("detects and prevents replay of stake transaction hashes", async () => {
    const txHash = "a".repeat(64);
    const isUsed = await db.checkReplayStakeTxHash(txHash);
    assert.strictEqual(isUsed, true);

    const isUnused = await db.checkReplayStakeTxHash("b".repeat(64));
    assert.strictEqual(isUnused, false);
  });

  it("records a daily check-in and updates streaks and badges", async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const checkinData = {
      challenge_id: "test-challenge-persistence-1",
      wallet_address: testWallet,
      day_number: 1,
      checkin_date: todayStr,
      proof_text: "Completed 50 pushups this morning!",
    };

    const streakUpdate = {
      current_streak: 7,
      longest_streak: 7,
      total_checkins: 1,
    };

    const res = await db.recordCheckin(checkinData, streakUpdate);
    assert.strictEqual(res.checkin.day_number, 1);
    assert.ok(res.earnedBadges.includes("streak_7"));

    const checkedAgain = await db.getCheckin("test-challenge-persistence-1", testWallet, todayStr);
    assert.ok(checkedAgain);
    assert.strictEqual(checkedAgain.proof_text, "Completed 50 pushups this morning!");

    const part = await db.getParticipant("test-challenge-persistence-1", testWallet);
    assert.strictEqual(part.current_streak, 7);
  });

  it("generates participant calendar with day statuses", async () => {
    const calendarData = await db.getParticipantCalendar("test-challenge-persistence-1", testWallet);
    assert.ok(calendarData);
    assert.strictEqual(calendarData.duration, 7);
    assert.strictEqual(calendarData.calendar.length, 7);
    assert.strictEqual(calendarData.calendar[0].checkedIn, true);
    assert.strictEqual(calendarData.calendar[0].status, "checked_in");
  });

  it("records and fetches payouts with idempotency", async () => {
    const payoutData = {
      challenge_id: "test-challenge-persistence-1",
      wallet_address: testWallet,
      amount_nim: 10,
      amount_luna: "1000000",
      payout_type: "stake_return_plus_bonus",
      status: "pending",
    };

    await db.recordPayout(payoutData);
    const fetched = await db.getPayout("test-challenge-persistence-1", testWallet, "stake_return_plus_bonus");
    assert.ok(fetched);
    assert.strictEqual(fetched.status, "pending");

    // Complete payout
    await db.recordPayout({
      ...payoutData,
      status: "sent",
      tx_hash: "c".repeat(64),
      bonus_nim: 5,
    });

    const updatedPayout = await db.getPayout("test-challenge-persistence-1", testWallet, "stake_return_plus_bonus");
    assert.strictEqual(updatedPayout.status, "sent");
    assert.strictEqual(updatedPayout.tx_hash, "c".repeat(64));
  });

  it("retrieves leaderboard rankings", async () => {
    const leaderboard = await db.getLeaderboard(10);
    assert.ok(Array.isArray(leaderboard));
    assert.ok(leaderboard.length > 0);
    assert.strictEqual(leaderboard[0].rank, 1);
  });
});
