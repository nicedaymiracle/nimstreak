import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import db, { memoryStore, normalizeAddress } from "../src/db.js";
import {
  getVapidPublicKey,
  sendWebPush,
  runNotificationScheduler,
  VAPID_PUBLIC_KEY,
} from "../src/notification-scheduler.js";

describe("Device Notifications & Background Push Scheduler", () => {
  const TEST_WALLET_1 = "NQ48 ARHS XLJJ X9D1 9LGL 07YS DTK9 2THB 48Y2";
  const TEST_WALLET_2 = "NQ33 TEST WALLET ADDR 1234 5678 90AB CDEF GHIJ";
  const NORM_WALLET_1 = normalizeAddress(TEST_WALLET_1);
  const NORM_WALLET_2 = normalizeAddress(TEST_WALLET_2);

  const FAKE_ENDPOINT_1 = "https://fcm.googleapis.com/fcm/send/fake-sub-token-1";
  const FAKE_ENDPOINT_2 = "https://fcm.googleapis.com/fcm/send/fake-sub-token-2";

  beforeEach(() => {
    // Clear test maps
    memoryStore.challenges.clear();
    memoryStore.participants.clear();
    memoryStore.checkins.clear();
    memoryStore.payouts.clear();
    memoryStore.pushSubscriptions.clear();
    memoryStore.notificationPreferences.clear();
    memoryStore.pushSentLog.clear();
  });

  test("1. VAPID public key is properly configured and retrieved", () => {
    const key = getVapidPublicKey();
    assert.ok(key, "VAPID public key should exist");
    assert.strictEqual(typeof key, "string");
    assert.ok(key.length >= 60, "VAPID public key must be valid length");
    assert.strictEqual(key, VAPID_PUBLIC_KEY);
  });

  test("2. Push subscription persistence, retrieval, and removal with address normalization", async () => {
    const sub = await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key-p256dh", auth: "auth-secret" },
      userAgent: "TestBrowser/1.0",
    });

    assert.ok(sub);
    assert.strictEqual(sub.wallet_address, NORM_WALLET_1);
    assert.strictEqual(sub.endpoint, FAKE_ENDPOINT_1);

    // Retrieve by unnormalized or normalized address
    const retrieved = await db.getPushSubscriptions(TEST_WALLET_1);
    assert.strictEqual(retrieved.length, 1);
    assert.strictEqual(retrieved[0].endpoint, FAKE_ENDPOINT_1);

    // Remove subscription
    await db.removePushSubscription(FAKE_ENDPOINT_1);
    const afterRemoval = await db.getPushSubscriptions(TEST_WALLET_1);
    assert.strictEqual(afterRemoval.length, 0);
  });

  test("3. Notification preferences saving, retrieval, and default fallback", async () => {
    // Default preferences
    const defaults = await db.getNotificationPreferences(TEST_WALLET_1);
    assert.strictEqual(defaults.dailyReminders, true);
    assert.strictEqual(defaults.challengeUpdates, true);
    assert.strictEqual(defaults.rewardUpdates, true);
    assert.strictEqual(defaults.preferredReminderTime, "20:00");

    // Custom preferences
    await db.saveNotificationPreferences(TEST_WALLET_1, {
      dailyReminders: false,
      preferredReminderTime: "09:00",
    });

    const updated = await db.getNotificationPreferences(TEST_WALLET_1);
    assert.strictEqual(updated.dailyReminders, false);
    assert.strictEqual(updated.preferredReminderTime, "09:00");
    assert.strictEqual(updated.rewardUpdates, true); // preserved
  });

  test("4. Daily check-in reminder timing: triggers when current hour >= preferredReminderTime", async () => {
    // Register subscription for Wallet 1
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    // Create an active challenge
    const challengeId = "chal-daily-1";
    memoryStore.challenges.set(challengeId, {
      id: challengeId,
      title: "7 Days of Coding",
      status: "active",
      stake_amount: 5,
      duration_days: 7,
      starts_at: "2026-09-01T00:00:00.000Z",
    });

    // Add participant who has NOT checked in today
    memoryStore.participants.set(`${challengeId}_${NORM_WALLET_1}`, {
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      profile_wallet: NORM_WALLET_1,
      status: "active",
      current_streak: 2,
      last_checkin_date: "2026-09-16T20:00:00.000Z", // Yesterday
    });

    const dispatched = [];
    const mockSend = async (sub, payload) => {
      dispatched.push({ sub, payload: JSON.parse(payload) });
      return { statusCode: 201 };
    };

    // 1. Simulation at 14:00 (before 20:00 reminder) -> 0 sent
    const earlyTime = new Date("2026-09-17T14:00:00.000Z");
    const resEarly = await runNotificationScheduler({ now: earlyTime, sendNotificationFn: mockSend });
    assert.strictEqual(resEarly.dailyRemindersSent, 0);
    assert.strictEqual(dispatched.length, 0);

    // 2. Simulation at 20:15 (after 20:00 reminder) -> 1 sent
    const reminderTime = new Date("2026-09-17T20:15:00.000Z");
    const resReminder = await runNotificationScheduler({ now: reminderTime, sendNotificationFn: mockSend });
    assert.strictEqual(resReminder.dailyRemindersSent, 1);
    assert.strictEqual(dispatched.length, 1);

    const sentPayload = dispatched[0].payload;
    assert.ok(sentPayload.title.includes("Time to check in"));
    assert.strictEqual(sentPayload.data.challengeId, challengeId);
    assert.strictEqual(sentPayload.data.url, `/?challenge=${challengeId}`);
  });

  test("5. STRICT RULE: User who already checked in today NEVER receives a reminder", async () => {
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    const challengeId = "chal-already-checked";
    memoryStore.challenges.set(challengeId, {
      id: challengeId,
      title: "Daily Fitness",
      status: "active",
      stake_amount: 10,
      duration_days: 14,
    });

    // Participant checked in today (2026-09-17)
    memoryStore.participants.set(`${challengeId}_${NORM_WALLET_1}`, {
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      profile_wallet: NORM_WALLET_1,
      status: "active",
      current_streak: 5,
      last_checkin_date: "2026-09-17T11:00:00.000Z", // Today!
    });

    const dispatched = [];
    const mockSend = async (sub, payload) => {
      dispatched.push(JSON.parse(payload));
    };

    // Even in the late evening, no reminder is allowed!
    const eveningTime = new Date("2026-09-17T21:30:00.000Z");
    const res = await runNotificationScheduler({ now: eveningTime, sendNotificationFn: mockSend });

    assert.strictEqual(res.dailyRemindersSent, 0);
    assert.strictEqual(res.streakAtRiskSent, 0);
    assert.strictEqual(dispatched.length, 0, "No notifications should be sent to user who checked in");
  });

  test("6. Streak at Risk: evening notification when approaching cutoff and not checked in", async () => {
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    const challengeId = "chal-risk-1";
    memoryStore.challenges.set(challengeId, {
      id: challengeId,
      title: "Meditation Daily",
      status: "active",
      stake_amount: 5,
      duration_days: 7,
    });

    // Participant not checked in today
    memoryStore.participants.set(`${challengeId}_${NORM_WALLET_1}`, {
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      profile_wallet: NORM_WALLET_1,
      status: "active",
      current_streak: 4,
      last_checkin_date: "2026-09-16T18:00:00.000Z",
    });

    const dispatched = [];
    const mockSend = async (sub, payload) => {
      dispatched.push(JSON.parse(payload));
    };

    // Late evening: 22:00
    const lateEvening = new Date("2026-09-17T22:00:00.000Z");
    const res = await runNotificationScheduler({ now: lateEvening, sendNotificationFn: mockSend });

    assert.strictEqual(res.streakAtRiskSent, 1);
    assert.strictEqual(dispatched.length, 1);
    assert.ok(dispatched[0].title.includes("Streak at Risk"));
    assert.strictEqual(dispatched[0].data.type, "streak_at_risk");
    assert.strictEqual(dispatched[0].data.url, `/?challenge=${challengeId}`);
  });

  test("7. Challenge starting notification sent to participants on start date", async () => {
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    const challengeId = "chal-start-today";
    memoryStore.challenges.set(challengeId, {
      id: challengeId,
      title: "30-Day Sprint",
      status: "active",
      starts_at: "2026-09-17T08:00:00.000Z", // Starts today
      duration_days: 30,
    });

    memoryStore.participants.set(`${challengeId}_${NORM_WALLET_1}`, {
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      profile_wallet: NORM_WALLET_1,
      status: "active",
      current_streak: 0,
    });

    const dispatched = [];
    const mockSend = async (sub, payload) => {
      dispatched.push(JSON.parse(payload));
    };

    const now = new Date("2026-09-17T09:00:00.000Z");
    const res = await runNotificationScheduler({ now, sendNotificationFn: mockSend });

    assert.strictEqual(res.challengeStartsSent, 1);
    assert.strictEqual(dispatched.length, 1);
    assert.ok(dispatched[0].title.includes("Challenge Started"));
  });

  test("8. Challenge completion notification sent when challenge finishes", async () => {
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    const challengeId = "chal-completed-1";
    memoryStore.challenges.set(challengeId, {
      id: challengeId,
      title: "7-Day Hydration",
      status: "completed",
      duration_days: 7,
    });

    memoryStore.participants.set(`${challengeId}_${NORM_WALLET_1}`, {
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      profile_wallet: NORM_WALLET_1,
      status: "completed",
      current_streak: 7,
    });

    const dispatched = [];
    const mockSend = async (sub, payload) => {
      dispatched.push(JSON.parse(payload));
    };

    const now = new Date("2026-09-17T12:00:00.000Z");
    const res = await runNotificationScheduler({ now, sendNotificationFn: mockSend });

    assert.strictEqual(res.challengeCompletedSent, 1);
    assert.strictEqual(dispatched.length, 1);
    assert.ok(dispatched[0].title.includes("Challenge Completed"));
    assert.ok(dispatched[0].data.url.includes("view=results"));
  });

  test("9. Reward confirmed notification triggers ONLY after payout confirmed on-chain", async () => {
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    const challengeId = "chal-payout-test";
    const CONFIRMED_TX = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

    // Unconfirmed / Pending payout: MUST NOT notify
    memoryStore.payouts.set(`${challengeId}_${NORM_WALLET_1}_principal`, {
      id: "pay-1",
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      amount_nim: 5,
      payout_type: "principal",
      status: "pending", // NOT confirmed yet
      tx_hash: null,
    });

    const dispatched = [];
    const mockSend = async (sub, payload) => {
      dispatched.push(JSON.parse(payload));
    };

    const now = new Date("2026-09-17T15:00:00.000Z");
    const resPending = await runNotificationScheduler({ now, sendNotificationFn: mockSend });
    assert.strictEqual(resPending.rewardsConfirmedSent, 0);
    assert.strictEqual(dispatched.length, 0);

    // Confirm payout on-chain
    memoryStore.payouts.set(`${challengeId}_${NORM_WALLET_1}_principal`, {
      id: "pay-1",
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      amount_nim: 5,
      payout_type: "principal",
      status: "sent", // Confirmed on blockchain!
      tx_hash: CONFIRMED_TX,
    });

    const resConfirmed = await runNotificationScheduler({ now, sendNotificationFn: mockSend });
    assert.strictEqual(resConfirmed.rewardsConfirmedSent, 1);
    assert.strictEqual(dispatched.length, 1);
    assert.ok(dispatched[0].title.includes("Reward Confirmed"));
    assert.strictEqual(dispatched[0].data.txHash, CONFIRMED_TX);
    assert.strictEqual(dispatched[0].data.url, "/?screen=profile&tab=transactions");
  });

  test("10. Deduplication: repeated scheduler runs NEVER produce duplicate device alerts", async () => {
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    const challengeId = "chal-dedup-1";
    memoryStore.challenges.set(challengeId, {
      id: challengeId,
      title: "Dedup Test Challenge",
      status: "active",
      duration_days: 7,
    });

    memoryStore.participants.set(`${challengeId}_${NORM_WALLET_1}`, {
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      profile_wallet: NORM_WALLET_1,
      status: "active",
      current_streak: 1,
      last_checkin_date: "2026-09-16T12:00:00.000Z",
    });

    let sendCount = 0;
    const mockSend = async () => {
      sendCount++;
    };

    const reminderTime = new Date("2026-09-17T20:30:00.000Z");

    // First run: sends 1
    const run1 = await runNotificationScheduler({ now: reminderTime, sendNotificationFn: mockSend });
    assert.strictEqual(run1.dailyRemindersSent, 1);
    assert.strictEqual(sendCount, 1);

    // Second run 10 minutes later: dedup suppresses it completely
    const laterTime = new Date("2026-09-17T20:40:00.000Z");
    const run2 = await runNotificationScheduler({ now: laterTime, sendNotificationFn: mockSend });
    assert.strictEqual(run2.dailyRemindersSent, 0);
    assert.strictEqual(sendCount, 1, "Must remain strictly 1 notification sent");
  });

  test("11. User preference suppression: disabled notification categories are strictly respected", async () => {
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    // Disable daily reminders
    await db.saveNotificationPreferences(TEST_WALLET_1, { dailyReminders: false });

    const challengeId = "chal-suppress-1";
    memoryStore.challenges.set(challengeId, {
      id: challengeId,
      title: "No Reminders Challenge",
      status: "active",
      duration_days: 7,
    });

    memoryStore.participants.set(`${challengeId}_${NORM_WALLET_1}`, {
      challenge_id: challengeId,
      wallet_address: NORM_WALLET_1,
      profile_wallet: NORM_WALLET_1,
      status: "active",
      current_streak: 1,
    });

    let sendCount = 0;
    const mockSend = async () => {
      sendCount++;
    };

    const reminderTime = new Date("2026-09-17T20:30:00.000Z");
    const res = await runNotificationScheduler({ now: reminderTime, sendNotificationFn: mockSend });

    assert.strictEqual(res.dailyRemindersSent, 0);
    assert.strictEqual(res.streakAtRiskSent, 0);
    assert.strictEqual(sendCount, 0);
  });

  test("12. Dead endpoint automatic cleanup: HTTP 410 / 404 removes expired subscriptions", async () => {
    await db.savePushSubscription({
      walletAddress: TEST_WALLET_1,
      endpoint: FAKE_ENDPOINT_1,
      keys: { p256dh: "key1", auth: "auth1" },
    });

    // Verify present
    const subsBefore = await db.getPushSubscriptions(TEST_WALLET_1);
    assert.strictEqual(subsBefore.length, 1);

    // Mock send returning 410 Gone (user revoked permission in browser)
    const deadSendFn = async () => {
      const err = new Error("Subscription expired or gone");
      err.statusCode = 410;
      throw err;
    };

    const result = await sendWebPush(subsBefore[0], { title: "Test" }, deadSendFn);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 410);

    // Verify subscription was automatically cleaned up from database
    const subsAfter = await db.getPushSubscriptions(TEST_WALLET_1);
    assert.strictEqual(subsAfter.length, 0, "Dead endpoint must be deleted automatically");
  });
});
