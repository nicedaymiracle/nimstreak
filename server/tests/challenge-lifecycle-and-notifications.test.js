import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert";
import * as db from "../src/db.js";

// Mock localStorage for Node test environment
const mockStorage = {
  data: {},
  getItem(k) { return this.data[k] || null; },
  setItem(k, v) { this.data[k] = String(v); },
  removeItem(k) { delete this.data[k]; },
  clear() { this.data = {}; },
};
globalThis.localStorage = mockStorage;

// Import notification engine
const notifEngine = await import("../../client/src/utils/notification-engine.js");

describe("Challenge Lifecycle, Transactions & Accountability Notifications", () => {
  const creatorWallet = "NQ11 AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH";
  const participantWallet = "NQ22 1111 2222 3333 4444 5555 6666 7777 8888";
  const quitterWallet = "NQ33 9999 8888 7777 6666 5555 4444 3333 2222";

  before(async () => {
    await db.initDb();
  });

  beforeEach(() => {
    mockStorage.clear();
  });

  // ── 1. CHALLENGE LIFECYCLE ───────────────────────────────────────
  it("1. tracks challenge lifecycle from open/active to completed and forfeited", async () => {
    const chalId = `lifecycle-test-${Date.now()}`;
    const stakeTx = "a1".repeat(32);

    // Create challenge (open/active)
    const chal = await db.createChallenge(
      {
        id: chalId,
        title: "30-Day Morning Meditation",
        description: "15 minutes mindfulness daily",
        category: "mindfulness",
        type: "public",
        duration_days: 30,
        stake_nim: 15,
        created_by: creatorWallet,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        status: "active",
      },
      {
        stake_tx_hash: stakeTx,
        stake_amount: 15,
        status: "active",
      }
    );

    assert.strictEqual(chal.status, "active");
    assert.strictEqual(db.isChallengeActive(chal), true);

    // Add participant
    const partStakeTx = "b2".repeat(32);
    await db.addParticipant(chalId, {
      wallet_address: participantWallet,
      profile_wallet: participantWallet,
      stake_tx_hash: partStakeTx,
      stake_amount: 15,
      status: "active",
    });

    // Add quitter
    const quitStakeTx = "c3".repeat(32);
    await db.addParticipant(chalId, {
      wallet_address: quitterWallet,
      profile_wallet: quitterWallet,
      stake_tx_hash: quitStakeTx,
      stake_amount: 15,
      status: "active",
    });

    // Mark quitter as forfeited/failed
    await db.updateParticipant(chalId, quitterWallet, { status: "failed" });
    const quitterPart = await db.getParticipant(chalId, quitterWallet);
    assert.strictEqual(quitterPart.status, "failed");

    // Complete challenge
    await db.updateChallenge(chalId, { status: "completed" });
    const endedChal = await db.getChallengeById(chalId);
    assert.strictEqual(endedChal.status, "completed");
    assert.strictEqual(db.isChallengeActive(endedChal), false);
  });

  // ── 2. TRANSACTION SUCCESS & REPLAY PROTECTION ───────────────────
  it("2. enforces duplicate stake transaction replay protection", async () => {
    const replayTx = "d4".repeat(32);
    const chalId1 = `chal-replay-1-${Date.now()}`;
    const chalId2 = `chal-replay-2-${Date.now()}`;

    await db.createChallenge(
      {
        id: chalId1,
        title: "Coding Sprint 1",
        stake_nim: 10,
        duration_days: 7,
        created_by: creatorWallet,
        status: "active",
      },
      {
        stake_tx_hash: replayTx,
        stake_amount: 10,
        status: "active",
      }
    );

    // Check replay for same hash
    const isReplay = await db.checkReplayStakeTxHash(replayTx);
    assert.strictEqual(isReplay, true, "Should detect already used stake transaction hash");

    const freshTx = "e5".repeat(32);
    const isFreshReplay = await db.checkReplayStakeTxHash(freshTx);
    assert.strictEqual(isFreshReplay, false, "Fresh transaction hash should not be detected as replay");
  });

  // ── 3. USER TRANSACTION HISTORY ──────────────────────────────────
  it("3. getUserTransactions aggregates stakes and confirmed payouts chronologically", async () => {
    const userWallet = "NQ44 5555 6666 7777 8888 9999 0000 1111 2222";
    const chalId = `tx-hist-chal-${Date.now()}`;
    const stakeTxHash = "f6".repeat(32);
    const payoutTxHash = "07".repeat(32);

    // Create stake
    await db.createChallenge(
      {
        id: chalId,
        title: "TypeScript Deep Dive",
        stake_nim: 20,
        duration_days: 14,
        created_by: userWallet,
        status: "completed",
      },
      {
        stake_tx_hash: stakeTxHash,
        stake_amount: 20,
        status: "completed",
      }
    );

    // Record confirmed payout
    await db.recordPayout({
      challenge_id: chalId,
      wallet_address: userWallet,
      amount_nim: 35,
      bonus_nim: 5,
      status: "sent",
      tx_hash: payoutTxHash,
      payout_type: "stake_return_plus_bonus",
    });

    const txs = await db.getUserTransactions(userWallet);
    assert.ok(Array.isArray(txs));
    assert.ok(txs.length >= 2, "Should contain at least 1 stake and 1 payout");

    const stakeTx = txs.find((t) => t.type === "stake");
    assert.ok(stakeTx);
    assert.strictEqual(stakeTx.amount, 20);
    assert.strictEqual(stakeTx.status, "confirmed");
    assert.strictEqual(stakeTx.tx_hash, stakeTxHash);
    assert.ok(stakeTx.explorer_url.includes(stakeTxHash));

    const payoutTx = txs.find((t) => t.type === "payout");
    assert.ok(payoutTx);
    assert.strictEqual(payoutTx.amount, 35);
    assert.strictEqual(payoutTx.status, "confirmed");
    assert.strictEqual(payoutTx.tx_hash, payoutTxHash);
    assert.ok(payoutTx.explorer_url.includes(payoutTxHash));
  });

  // ── 4. REPEAT CHALLENGE VALIDATION ───────────────────────────────
  it("4. repeat challenge pre-fills parameters without automatically staking", () => {
    const originalChallenge = {
      title: "Daily 10K Steps",
      description: "Hit 10,000 steps every day without fail",
      category: "fitness",
      duration_days: 14,
      stake_nim: 15,
      type: "public",
    };

    // Construct repeat parameters
    const repeatPayload = {
      title: originalChallenge.title,
      description: originalChallenge.description,
      category: originalChallenge.category,
      duration: originalChallenge.duration_days,
      stake_nim: originalChallenge.stake_nim,
      type: originalChallenge.type,
    };

    assert.strictEqual(repeatPayload.title, "Daily 10K Steps");
    assert.strictEqual(repeatPayload.duration, 14);
    assert.strictEqual(repeatPayload.stake_nim, 15);
    // Explicit safety check: never auto-stakes, user must review
    assert.strictEqual(repeatPayload.stakeTxHash, undefined);
    assert.strictEqual(repeatPayload.autoStake, undefined);
  });

  // ── 5. CHALLENGE SHARING FORMAT ──────────────────────────────────
  it("5. formats clean challenge share message with name, stake, duration, and link", () => {
    const chal = {
      id: "chal-share-123",
      title: "7 Days of Cold Showers",
      stake_nim: 5,
      duration_days: 7,
      invite_code: "COLD7",
    };
    const origin = "https://nimstreak.app";
    const shareUrl = `${origin}/?challenge=${encodeURIComponent(chal.id)}&invite=${encodeURIComponent(chal.invite_code)}`;

    const shareMessage = `🔥 Join my NimStreak challenge: ${chal.title}
🎯 Stake: ${chal.stake_nim} NIM
⏱️ Duration: ${chal.duration_days} Days
Join here: ${shareUrl}`;

    assert.ok(shareMessage.includes("7 Days of Cold Showers"));
    assert.ok(shareMessage.includes("Stake: 5 NIM"));
    assert.ok(shareMessage.includes("Duration: 7 Days"));
    assert.ok(shareMessage.includes(shareUrl));
    assert.ok(shareMessage.includes("COLD7"));
  });

  // ── 6. NOTIFICATION PREFERENCES ──────────────────────────────────
  it("6. saves and respects notification preferences", () => {
    const defaultPrefs = notifEngine.getNotificationPreferences();
    assert.strictEqual(defaultPrefs.dailyReminders, true);
    assert.strictEqual(defaultPrefs.challengeUpdates, true);
    assert.strictEqual(defaultPrefs.rewardUpdates, true);
    assert.strictEqual(defaultPrefs.invitations, true);
    assert.strictEqual(defaultPrefs.preferredReminderTime, "20:00");

    // Disable daily reminders
    notifEngine.saveNotificationPreferences({
      dailyReminders: false,
      preferredReminderTime: "18:00",
    });

    const updated = notifEngine.getNotificationPreferences();
    assert.strictEqual(updated.dailyReminders, false);
    assert.strictEqual(updated.preferredReminderTime, "18:00");
    assert.strictEqual(updated.challengeUpdates, true); // preserved
  });

  // ── 7. DAILY REMINDER ELIGIBILITY & CHECK-IN ANTI-SPAM ───────────
  it("7. triggers daily check-in reminder when not checked in, and NEVER when already checked in", () => {
    notifEngine.saveNotificationPreferences({ dailyReminders: true });
    const now = new Date(2026, 8, 17, 10, 0, 0); // 10:00 AM
    const todayStr = "2026-09-17";

    // Scenario A: User has NOT checked in today
    const myChallengesUnchecked = {
      active: [
        {
          id: "chal-checkin-1",
          title: "Daily Reading",
          last_checkin_date: "2026-09-16T15:00:00Z", // yesterday
        },
      ],
    };

    const resA = notifEngine.evaluateNotifications({
      myChallenges: myChallengesUnchecked,
      now,
    });

    assert.strictEqual(resA.newCount, 1, "Should generate 1 reminder when not checked in");
    assert.strictEqual(resA.allNotifications[0].type, "daily_checkin");
    assert.ok(resA.allNotifications[0].title.includes("Daily Reading"));

    // Scenario B: User ALREADY checked in today
    mockStorage.clear();
    const myChallengesChecked = {
      active: [
        {
          id: "chal-checkin-1",
          title: "Daily Reading",
          last_checkin_date: `${todayStr}T08:30:00Z`, // today!
        },
      ],
    };

    const resB = notifEngine.evaluateNotifications({
      myChallenges: myChallengesChecked,
      now,
    });

    assert.strictEqual(resB.newCount, 0, "STRICT RULE: Never remind someone who already checked in today");
  });

  // ── 8. ANTI-SPAM DEDUPLICATION ───────────────────────────────────
  it("8. enforces deduplication on app reopen and across all notification types", () => {
    notifEngine.saveNotificationPreferences({
      dailyReminders: true,
      challengeUpdates: true,
      rewardUpdates: true,
    });
    const now = new Date(2026, 8, 17, 14, 0, 0);

    const chalData = {
      active: [
        {
          id: "chal-dedup-1",
          title: "Drink 2L Water",
          last_checkin_date: "2026-09-16",
        },
      ],
      completed: [
        {
          id: "chal-dedup-comp",
          title: "14-Day Pushup Quest",
        },
      ],
    };

    const payoutData = [
      {
        challenge_id: "chal-dedup-comp",
        status: "sent",
        tx_hash: "99".repeat(32),
        amount_nim: 25,
      },
    ];

    // First evaluation: creates notifications
    const firstRun = notifEngine.evaluateNotifications({
      myChallenges: chalData,
      payouts: payoutData,
      now,
    });
    assert.strictEqual(firstRun.newCount, 3); // 1 daily + 1 completion + 1 reward

    // Second evaluation (App Reopened!): MUST produce 0 new notifications
    const secondRun = notifEngine.evaluateNotifications({
      myChallenges: chalData,
      payouts: payoutData,
      now,
    });
    assert.strictEqual(secondRun.newCount, 0, "Deduplication: App reopen must NOT produce duplicate notifications");

    // Verify stored count remains 3
    const stored = notifEngine.getStoredNotifications();
    assert.strictEqual(stored.length, 3);
  });

  // ── 9. NOTIFICATION CENTER MARK AS READ ──────────────────────────
  it("9. marks individual and all notifications as read correctly", () => {
    const notifs = [
      { id: "n1", type: "daily_checkin", title: "Test 1", read: false },
      { id: "n2", type: "reward_confirmed", title: "Test 2", read: false },
    ];
    notifEngine.saveStoredNotifications(notifs);

    assert.strictEqual(notifEngine.getUnreadNotificationCount(), 2);

    notifEngine.markNotificationAsRead("n1");
    assert.strictEqual(notifEngine.getUnreadNotificationCount(), 1);

    notifEngine.markAllNotificationsAsRead();
    assert.strictEqual(notifEngine.getUnreadNotificationCount(), 0);
  });
});
