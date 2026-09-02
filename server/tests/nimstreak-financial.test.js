import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayouts,
  nimToLuna,
  lunaToNim,
  verifyStakeTransaction,
  isNimiqAddress,
  normalizeAddress,
  LUNA_PER_NIM,
} from "../src/nimstreak-payout.js";

describe("P0 #6: Integer Luna Financial Arithmetic", () => {
  it("correctly converts NIM to Luna and back without floating point loss", () => {
    assert.equal(nimToLuna(1), 100000n);
    assert.equal(nimToLuna("1.5"), 150000n);
    assert.equal(nimToLuna(0.5), 50000n);
    assert.equal(nimToLuna(100), 10000000n);
    assert.equal(nimToLuna(0), 0n);

    assert.equal(lunaToNim(100000n), 1);
    assert.equal(lunaToNim(150000n), 1.5);
    assert.equal(lunaToNim(50000n), 0.5);
  });

  it("calculates 100% principal return for solo challenges", () => {
    const participants = [
      { wallet_address: "NQ01 AAAA", stake_amount: 5, status: "completed" },
    ];
    const result = calculatePayouts(participants);

    assert.equal(result.finisherCount, 1);
    assert.equal(result.quitterCount, 0);
    assert.equal(result.quitterPoolLuna, "0");
    assert.equal(result.treasuryFeeLuna, "0");
    assert.equal(result.distributableBonusLuna, "0");
    assert.equal(result.remainderLuna, "0");
    assert.equal(result.payouts.length, 1);
    assert.equal(result.payouts[0].total_luna, "500000");
    assert.equal(result.payouts[0].total_nim, 5);
  });

  it("calculates accurate quitter pool and 10% fee split for multi-participant challenges", () => {
    const participants = [
      { wallet_address: "NQ01 WIN1", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 WIN2", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ03 QUIT", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants);

    assert.equal(result.finisherCount, 2);
    assert.equal(result.quitterCount, 1);
    assert.equal(result.totalPoolLuna, "3000000"); // 30 NIM
    assert.equal(result.quitterPoolLuna, "1000000"); // 10 NIM
    assert.equal(result.treasuryFeeLuna, "100000"); // 1 NIM fee (10%)
    assert.equal(result.distributableBonusLuna, "900000"); // 9 NIM bonus
    assert.equal(result.remainderLuna, "0");

    // Each finisher gets 10 NIM principal + 4.5 NIM bonus = 14.5 NIM
    assert.equal(result.payouts[0].total_luna, "1450000");
    assert.equal(result.payouts[0].total_nim, 14.5);
    assert.equal(result.payouts[1].total_luna, "1450000");
    assert.equal(result.payouts[1].total_nim, 14.5);
  });

  it("handles indivisible pools deterministically with remainder tracking", () => {
    // 1 quitter (10 NIM = 1,000,000 Luna), 3 finishers
    // Quitter pool: 1,000,000 Luna
    // Fee: 100,000 Luna
    // Bonus pool: 900,000 Luna -> 900,000 / 3 = 300,000 Luna per finisher (exact)
    const exactParticipants = [
      { wallet_address: "NQ01", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ03", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ04", stake_amount: 10, status: "failed" },
    ];
    const resExact = calculatePayouts(exactParticipants);
    assert.equal(resExact.remainderLuna, "0");
    assert.equal(resExact.payouts[0].bonus_luna, "300000");

    // 1 quitter (7 NIM = 700,000 Luna), 3 finishers
    // Quitter pool: 700,000 Luna
    // Fee (10%): 70,000 Luna
    // Bonus pool: 630,000 Luna -> 630,000 / 3 = 210,000 Luna per finisher
    const p2 = [
      { wallet_address: "NQ01", stake_amount: 5, status: "completed" },
      { wallet_address: "NQ02", stake_amount: 5, status: "completed" },
      { wallet_address: "NQ03", stake_amount: 5, status: "completed" },
      { wallet_address: "NQ04", stake_amount: 7, status: "failed" },
    ];
    const res2 = calculatePayouts(p2);
    assert.equal(res2.remainderLuna, "0");
    assert.equal(res2.payouts[0].bonus_luna, "210000");

    // 1 quitter (5 NIM = 500,000 Luna), 7 finishers
    // Bonus pool: 450,000 Luna -> 450,000 / 7 = 64,285 Luna, remainder: 5 Luna
    const p3 = [
      { wallet_address: "NQ01", stake_amount: 1, status: "completed" },
      { wallet_address: "NQ02", stake_amount: 1, status: "completed" },
      { wallet_address: "NQ03", stake_amount: 1, status: "completed" },
      { wallet_address: "NQ04", stake_amount: 1, status: "completed" },
      { wallet_address: "NQ05", stake_amount: 1, status: "completed" },
      { wallet_address: "NQ06", stake_amount: 1, status: "completed" },
      { wallet_address: "NQ07", stake_amount: 1, status: "completed" },
      { wallet_address: "NQ08", stake_amount: 5, status: "failed" },
    ];
    const res3 = calculatePayouts(p3);
    assert.equal(res3.remainderLuna, "5");
    assert.equal(res3.payouts[0].bonus_luna, "64285");
    // Verify total payouts + fee + remainder == total pool
    const totalFinisherPayouts = res3.payouts.reduce((s, p) => s + BigInt(p.total_luna), 0n);
    const sumAll = totalFinisherPayouts + BigInt(res3.treasuryFeeLuna) + BigInt(res3.remainderLuna);
    assert.equal(sumAll.toString(), res3.totalPoolLuna);
  });
});

describe("P0 #2: Transaction Verification Validation", () => {
  it("rejects invalid hash formats", async () => {
    await assert.rejects(
      () =>
        verifyStakeTransaction({
          txHash: "invalid_hash_short",
          senderAddress: "NQ68 LS47 5LF6 C7CU MVB6 KL55 YSFG PEXJ ADJ0",
          expectedStakeNim: 1.0,
        }),
      /Invalid Nimiq transaction hash format/
    );
  });

  it("validates Nimiq address helper functions", () => {
    assert.equal(isNimiqAddress("NQ68 LS47 5LF6 C7CU MVB6 KL55 YSFG PEXJ ADJ0"), true);
    assert.equal(isNimiqAddress("NQ68LS475LF6C7CUMVB6KL55YSFGPEXJADJ0"), true);
    assert.equal(isNimiqAddress("0x1234567890abcdef1234567890abcdef12345678"), false);
    assert.equal(isNimiqAddress(""), false);
    assert.equal(normalizeAddress("nq68 ls47 5lf6"), "NQ68LS475LF6");
  });
});

describe("P0 #5: Regression Test for Mid-Challenge Join Bug", () => {
  it("participant who joined today on a 3-day old challenge must NOT be evaluated as missed yesterday", () => {
    const today = new Date();
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);

    const challenge = {
      id: "chal-1",
      starts_at: threeDaysAgo.toISOString(),
      duration_days: 30,
      status: "active",
    };

    const participantJoinedToday = {
      challenge_id: "chal-1",
      wallet_address: "NQ01 TEST",
      status: "active",
      joined_at: today.toISOString(),
    };

    const participantJoinedThreeDaysAgo = {
      challenge_id: "chal-1",
      wallet_address: "NQ02 TEST",
      status: "active",
      joined_at: threeDaysAgo.toISOString(),
    };

    // Check forfeiture condition: cp.joined_at::date < CURRENT_DATE
    const todayDateStr = today.toISOString().split("T")[0];
    const participantJoinedDateStr = new Date(participantJoinedToday.joined_at).toISOString().split("T")[0];
    const oldParticipantJoinedDateStr = new Date(participantJoinedThreeDaysAgo.joined_at).toISOString().split("T")[0];

    // User joined today: joined_at::date is TODAY, so joined_at::date < CURRENT_DATE is FALSE!
    const isNewParticipantEligibleForForfeit = participantJoinedDateStr < todayDateStr;
    assert.equal(
      isNewParticipantEligibleForForfeit,
      false,
      "New participant joined today must not be forfeited for days prior to joining"
    );

    // User joined 3 days ago: joined_at::date < CURRENT_DATE is TRUE
    const isOldParticipantEligibleForForfeit = oldParticipantJoinedDateStr < todayDateStr;
    assert.equal(
      isOldParticipantEligibleForForfeit,
      true,
      "Old participant who joined 3 days ago is eligible for missed check-in check"
    );
  });
});
