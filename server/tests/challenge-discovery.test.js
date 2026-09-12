import { describe, it, before } from "node:test";
import assert from "node:assert";
import * as db from "../src/db.js";

describe("Challenge Discovery & Stale Filter Safety Layer", () => {
  const testWallet = "NQ99 1111 2222 3333 4444 5555 6666 7777 8888";
  const now = new Date();

  before(async () => {
    await db.initDb();

    // 1. Active challenge (ends in 14 days)
    await db.createChallenge(
      {
        id: "discovery-chal-active-1",
        title: "Daily Morning Run Sprint",
        description: "Run 5km every morning before work",
        category: "fitness",
        type: "public",
        duration_days: 14,
        stake_nim: 10,
        stake_luna: "1000000",
        created_by: testWallet,
        starts_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
        ends_at: new Date(now.getTime() + 12 * 86400000).toISOString(),
        status: "active",
        invite_code: "RUN14",
      },
      {
        stake_tx_hash: "1".repeat(64),
        stake_amount: 10,
        stake_luna: "1000000",
        status: "active",
      }
    );

    // 2. Expired challenge (ends_at was 2 days ago, still marked 'active')
    await db.createChallenge(
      {
        id: "discovery-chal-expired-1",
        title: "Old Summer Yoga Streak",
        description: "Stretch and hold yoga poses daily",
        category: "wellness",
        type: "public",
        duration_days: 7,
        stake_nim: 5,
        stake_luna: "500000",
        created_by: testWallet,
        starts_at: new Date(now.getTime() - 10 * 86400000).toISOString(),
        ends_at: new Date(now.getTime() - 3 * 86400000).toISOString(),
        status: "active",
        invite_code: "YOGA7",
      },
      {
        stake_tx_hash: "2".repeat(64),
        stake_amount: 5,
        stake_luna: "500000",
        status: "active",
      }
    );

    // 3. Completed challenge (status explicitly 'completed')
    await db.createChallenge(
      {
        id: "discovery-chal-completed-1",
        title: "Finished 30-Day Coding Marathon",
        description: "Commit code every single day",
        category: "coding",
        type: "public",
        duration_days: 30,
        stake_nim: 20,
        stake_luna: "2000000",
        created_by: testWallet,
        starts_at: new Date(now.getTime() - 35 * 86400000).toISOString(),
        ends_at: new Date(now.getTime() - 5 * 86400000).toISOString(),
        status: "completed",
        invite_code: "CODE30",
      },
      {
        stake_tx_hash: "3".repeat(64),
        stake_amount: 20,
        stake_luna: "2000000",
        status: "completed",
      }
    );

    // 4. Inactive / Abandoned challenge (status explicitly 'inactive' or 'abandoned')
    await db.createChallenge(
      {
        id: "discovery-chal-abandoned-1",
        title: "Abandoned Meditation Group",
        description: "Ten minutes of mindfulness",
        category: "mindfulness",
        type: "group",
        duration_days: 21,
        stake_nim: 15,
        stake_luna: "1500000",
        created_by: testWallet,
        starts_at: new Date(now.getTime() - 5 * 86400000).toISOString(),
        ends_at: new Date(now.getTime() + 16 * 86400000).toISOString(),
        status: "abandoned",
        invite_code: "ZEN21",
      },
      {
        stake_tx_hash: "4".repeat(64),
        stake_amount: 15,
        stake_luna: "1500000",
        status: "failed",
      }
    );

    // 5. Another active challenge for category & search testing
    await db.createChallenge(
      {
        id: "discovery-chal-active-2",
        title: "Deep Work Coding Sprint",
        description: "Write TypeScript without distraction for 2 hours",
        category: "coding",
        type: "public",
        duration_days: 7,
        stake_nim: 10,
        stake_luna: "1000000",
        created_by: testWallet,
        starts_at: new Date(now.getTime() - 1 * 86400000).toISOString(),
        ends_at: new Date(now.getTime() + 6 * 86400000).toISOString(),
        status: "active",
        invite_code: "DEEP7",
      },
      {
        stake_tx_hash: "5".repeat(64),
        stake_amount: 10,
        stake_luna: "1000000",
        status: "active",
      }
    );
  });

  it("1. active challenge appears in discovery", async () => {
    const list = await db.getChallenges({ status: "active" });
    const ids = list.map((c) => c.id);
    assert.ok(ids.includes("discovery-chal-active-1"), "Active running challenge must appear");
    assert.ok(ids.includes("discovery-chal-active-2"), "Second active challenge must appear");
  });

  it("2. expired challenge does not appear in active discovery", async () => {
    const list = await db.getChallenges({ status: "active" });
    const ids = list.map((c) => c.id);
    assert.strictEqual(
      ids.includes("discovery-chal-expired-1"),
      false,
      "Expired challenge with past ends_at must NOT appear in active discovery"
    );
  });

  it("3. completed challenge does not appear in active discovery", async () => {
    const list = await db.getChallenges({ status: "active" });
    const ids = list.map((c) => c.id);
    assert.strictEqual(
      ids.includes("discovery-chal-completed-1"),
      false,
      "Completed challenge must NOT appear in active discovery"
    );
  });

  it("4. inactive/abandoned challenge does not appear in active discovery", async () => {
    const list = await db.getChallenges({ status: "active" });
    const ids = list.map((c) => c.id);
    assert.strictEqual(
      ids.includes("discovery-chal-abandoned-1"),
      false,
      "Abandoned/inactive challenge must NOT appear in active discovery"
    );
  });

  it("5. search still finds active challenges and excludes expired ones", async () => {
    // Search matching active challenge
    const activeSearch = await db.getChallenges({ status: "active", search: "Sprint" });
    const activeIds = activeSearch.map((c) => c.id);
    assert.ok(activeIds.includes("discovery-chal-active-1"), "Search finds active challenge 1");
    assert.ok(activeIds.includes("discovery-chal-active-2"), "Search finds active challenge 2");

    // Search matching text in expired challenge must NOT return expired challenge
    const expiredSearch = await db.getChallenges({ status: "active", search: "Yoga" });
    const expiredIds = expiredSearch.map((c) => c.id);
    assert.strictEqual(expiredIds.includes("discovery-chal-expired-1"), false, "Expired challenge excluded from search");
  });

  it("6. category filtering still works and respects active-only rule", async () => {
    // Category 'coding'
    const codingList = await db.getChallenges({ status: "active", category: "coding" });
    const codingIds = codingList.map((c) => c.id);
    assert.ok(codingIds.includes("discovery-chal-active-2"), "Active coding challenge returned");
    assert.strictEqual(codingIds.includes("discovery-chal-completed-1"), false, "Completed coding challenge excluded");

    // Category 'wellness' (which has only expired challenge)
    const wellnessList = await db.getChallenges({ status: "active", category: "wellness" });
    assert.strictEqual(wellnessList.length, 0, "No active challenges in wellness");
  });

  it("7. valid active invite-code resolution still works", async () => {
    // Look up via getChallengeByInviteCode
    const activeChal = await db.getChallengeByInviteCode("RUN14");
    assert.ok(activeChal, "Active invite code resolves challenge");
    assert.strictEqual(activeChal.id, "discovery-chal-active-1");
    assert.strictEqual(db.isChallengeActive(activeChal), true);

    // Look up via search query (used by App.jsx join-by-code stake resolution)
    const searchRes = await db.getChallenges({ status: "active", search: "RUN14" });
    assert.ok(searchRes.some((c) => c.invite_code === "RUN14"), "Search by invite code returns active challenge");

    // Expired invite code is identified as inactive
    const expiredChal = await db.getChallengeByInviteCode("YOGA7");
    assert.ok(expiredChal, "Invite code found in DB");
    assert.strictEqual(db.isChallengeActive(expiredChal), false, "Expired challenge is not active");
    assert.strictEqual(db.isChallengeExpired(expiredChal), true, "Expired challenge correctly marked expired");
  });
});
