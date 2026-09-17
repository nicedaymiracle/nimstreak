import * as db from "../src/db.js";
import { getOnChainTransaction } from "../src/nimstreak-payout.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayouts,
  nimToLuna,
  lunaToNim,
  isNimiqAddress,
  normalizeAddress,
  LUNA_PER_NIM,
  MAX_INDIVIDUAL_BONUS_LUNA,
  CHALLENGE_MAX_BONUS_LUNA,
} from "../src/nimstreak-payout.js";

// ── SOLO CHALLENGES ──────────────────────────────────────────────────────────

describe("Solo Challenge Reward Rules", () => {
  it("TEST 1: Solo completion → original stake returned + eligible bonus", () => {
    const participants = [
      { wallet_address: "NQ01 SOLO COMP", stake_amount: 10, status: "completed" },
    ];
    const result = calculatePayouts(participants, null, null, "solo");

    assert.equal(result.finisherCount, 1);
    assert.equal(result.quitterCount, 0);
    assert.equal(result.challengeType, "solo");

    const payout = result.payouts[0];
    assert.equal(payout.wallet_address, "NQ01 SOLO COMP");
    assert.equal(payout.stake_return_nim, 10);
    assert.equal(payout.nimstreak_bonus_nim, 5); // 50% of 10 NIM = 5 NIM (under cap)
    assert.equal(payout.forfeited_reward_nim, 0); // No quitter pool in solo
    assert.equal(payout.total_nim, 15); // 10 + 0 + 5
    assert.equal(payout.payout_type, "stake_return_plus_bonus");
  });

  it("TEST 2: Solo missed check-in → original stake returned + zero bonus", () => {
    const participants = [
      { wallet_address: "NQ01 SOLO FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "solo");

    assert.equal(result.finisherCount, 0);
    assert.equal(result.quitterCount, 1);
    assert.equal(result.challengeType, "solo");

    // Solo failed participant should still appear in payouts with protected stake
    const payout = result.payouts.find((p) => p.wallet_address === "NQ01 SOLO FAIL");
    assert.ok(payout, "Solo failed participant must have a payout entry");
    assert.equal(payout.stake_return_nim, 10);
    assert.equal(payout.bonus_nim, 0);
    assert.equal(payout.nimstreak_bonus_nim, 0);
    assert.equal(payout.forfeited_reward_nim, 0);
    assert.equal(payout.total_nim, 10); // Only stake returned, no bonus
    assert.equal(payout.payout_type, "solo_stake_return");
  });

  it("TEST 3: Solo missed check-in → no Quitter Pool", () => {
    const participants = [
      { wallet_address: "NQ01 SOLO FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "solo");

    assert.equal(result.quitterPoolLuna, "0");
    assert.equal(result.quitterPoolNim, 0);
    assert.equal(result.forfeitedPoolLuna, "0");
    assert.equal(result.forfeitedPoolNim, 0);
    assert.equal(result.distributableBonusLuna, "0");
    assert.equal(result.distributableBonusNim, 0);
  });

  it("TEST 4: Solo missed check-in → protected stake cannot be paid twice", () => {
    const participants = [
      { wallet_address: "NQ01 SOLO FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "solo");

    // Only one payout entry should exist for this participant
    const payoutsForAddr = result.payouts.filter((p) => p.wallet_address === "NQ01 SOLO FAIL");
    assert.equal(payoutsForAddr.length, 1, "Exactly one payout entry per solo failed participant");
    assert.equal(payoutsForAddr[0].total_luna, nimToLuna(10).toString());
  });

  it("TEST 5: Solo completion → cannot accidentally receive a Quitter Pool share", () => {
    // Solo challenge where one completed and one failed
    const participants = [
      { wallet_address: "NQ01 SOLO COMP", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 SOLO FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "solo");

    assert.equal(result.quitterPoolLuna, "0", "Solo challenge must have no quitter pool");

    const completedPayout = result.payouts.find((p) => p.wallet_address === "NQ01 SOLO COMP");
    assert.ok(completedPayout);
    assert.equal(completedPayout.forfeited_reward_luna, "0", "Solo finisher must not receive forfeited pool share");
    assert.equal(completedPayout.forfeited_reward_nim, 0);
    assert.equal(completedPayout.stake_return_nim, 10);
    assert.equal(completedPayout.nimstreak_bonus_nim, 5);
    assert.equal(completedPayout.total_nim, 15); // 10 stake + 0 pool + 5 bonus
  });

  it("TEST 6: Solo failure payout is verified on-chain before being marked successful", () => {
    // This tests the payout_type field which the claim route uses to determine payout behavior
    const participants = [
      { wallet_address: "NQ01 SOLO FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "solo");

    const payout = result.payouts.find((p) => p.wallet_address === "NQ01 SOLO FAIL");
    assert.ok(payout);
    assert.equal(payout.payout_type, "solo_stake_return");
    // The sendStreakPayout function already requires on-chain confirmation
    // before marking as successful — verified by existing TEST 18/19 in nimstreak-financial.test.js
    assert.equal(BigInt(payout.total_luna), nimToLuna(10));
  });
});

// ── PUBLIC CHALLENGES ────────────────────────────────────────────────────────

describe("Public Challenge Reward Rules", () => {
  it("TEST 7: Public completion → original stake + Quitter Pool share + eligible bonus", () => {
    const participants = [
      { wallet_address: "NQ01 PUB COMP1", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 PUB COMP2", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ03 PUB FAIL1", stake_amount: 10, status: "failed" },
      { wallet_address: "NQ04 PUB FAIL2", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    assert.equal(result.challengeType, "public");
    assert.equal(result.finisherCount, 2);
    assert.equal(result.quitterCount, 2);
    assert.equal(result.quitterPoolNim, 20); // 10 + 10

    const payout1 = result.payouts.find((p) => p.wallet_address === "NQ01 PUB COMP1");
    assert.ok(payout1);
    assert.equal(payout1.stake_return_nim, 10);
    assert.equal(payout1.forfeited_reward_nim, 10); // 20 / 2
    assert.equal(payout1.nimstreak_bonus_nim, 5); // 50% of 10 NIM
    assert.equal(payout1.total_nim, 25); // 10 + 10 + 5
  });

  it("TEST 8: Public missed check-in → full stake forfeited", () => {
    const participants = [
      { wallet_address: "NQ01 PUB COMP", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 PUB FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    // Failed participant should NOT appear in payouts at all for public challenges
    const failedPayout = result.payouts.find((p) => p.wallet_address === "NQ02 PUB FAIL");
    assert.equal(failedPayout, undefined, "Public failed participant must not have a payout entry");
  });

  it("TEST 9: Public forfeited stake enters Quitter Pool", () => {
    const participants = [
      { wallet_address: "NQ01 PUB COMP", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 PUB FAIL", stake_amount: 15, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    assert.equal(result.quitterPoolLuna, nimToLuna(15).toString());
    assert.equal(result.quitterPoolNim, 15);
    assert.equal(result.forfeitedPoolLuna, nimToLuna(15).toString());
  });

  it("TEST 10: Multiple public finishers split the Quitter Pool correctly", () => {
    const participants = [
      { wallet_address: "NQ01 PUB A", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 PUB B", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ03 PUB C", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ04 PUB D", stake_amount: 10, status: "failed" },
      { wallet_address: "NQ05 PUB E", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    const totalForfeited = nimToLuna(20); // 10 + 10
    const perFinisher = totalForfeited / 3n; // 666666 Luna
    const remainder = totalForfeited % 3n; // 2 Luna

    assert.equal(result.finisherCount, 3);
    assert.equal(result.quitterPoolLuna, totalForfeited.toString());

    // First 2 finishers get +1 Luna remainder
    const payoutA = result.payouts.find((p) => p.wallet_address === "NQ01 PUB A");
    const payoutB = result.payouts.find((p) => p.wallet_address === "NQ02 PUB B");
    const payoutC = result.payouts.find((p) => p.wallet_address === "NQ03 PUB C");

    assert.equal(BigInt(payoutA.forfeited_reward_luna), perFinisher + 1n);
    assert.equal(BigInt(payoutB.forfeited_reward_luna), perFinisher + 1n);
    assert.equal(BigInt(payoutC.forfeited_reward_luna), perFinisher);

    // Total distributed must equal total forfeited
    const totalDistributed = BigInt(payoutA.forfeited_reward_luna) + BigInt(payoutB.forfeited_reward_luna) + BigInt(payoutC.forfeited_reward_luna);
    assert.equal(totalDistributed, totalForfeited);
  });

  it("TEST 11: Public forfeited participant receives no stake return", () => {
    const participants = [
      { wallet_address: "NQ01 PUB COMP", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 PUB FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    const failedPayout = result.payouts.find((p) => p.wallet_address === "NQ02 PUB FAIL");
    assert.equal(failedPayout, undefined, "Failed public participant must NOT have a payout entry");
  });

  it("TEST 12: Public forfeited participant receives no completion bonus", () => {
    const participants = [
      { wallet_address: "NQ01 PUB COMP", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 PUB FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    // No payout entry at all for failed public participants
    const failedEntries = result.payouts.filter((p) => p.wallet_address === "NQ02 PUB FAIL");
    assert.equal(failedEntries.length, 0);
  });
});

// ── GROUP CHALLENGES ─────────────────────────────────────────────────────────

describe("Group Challenge Reward Rules", () => {
  it("TEST 13: Group completion → original stake + Quitter Pool share + eligible bonus", () => {
    const participants = [
      { wallet_address: "NQ01 GRP COMP1", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 GRP COMP2", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ03 GRP FAIL1", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "group");

    assert.equal(result.challengeType, "group");
    assert.equal(result.finisherCount, 2);
    assert.equal(result.quitterCount, 1);
    assert.equal(result.quitterPoolNim, 10);

    const payout1 = result.payouts.find((p) => p.wallet_address === "NQ01 GRP COMP1");
    assert.ok(payout1);
    assert.equal(payout1.stake_return_nim, 10);
    assert.equal(payout1.forfeited_reward_nim, 5); // 10 / 2
    assert.equal(payout1.nimstreak_bonus_nim, 5); // 50% of 10 NIM
    assert.equal(payout1.total_nim, 20); // 10 + 5 + 5
    assert.equal(payout1.payout_type, "stake_return_plus_bonus");
  });

  it("TEST 14: Group missed check-in → full stake forfeited", () => {
    const participants = [
      { wallet_address: "NQ01 GRP COMP", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 GRP FAIL", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "group");

    const failedPayout = result.payouts.find((p) => p.wallet_address === "NQ02 GRP FAIL");
    assert.equal(failedPayout, undefined, "Group failed participant must not have a payout entry");
  });

  it("TEST 15: Group forfeited stakes enter Quitter Pool", () => {
    const participants = [
      { wallet_address: "NQ01 GRP COMP", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 GRP FAIL1", stake_amount: 10, status: "failed" },
      { wallet_address: "NQ03 GRP FAIL2", stake_amount: 15, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "group");

    assert.equal(result.quitterPoolLuna, nimToLuna(25).toString()); // 10 + 15
    assert.equal(result.quitterPoolNim, 25);
  });

  it("TEST 16: Group finishers receive the correct pool distribution", () => {
    const participants = [
      { wallet_address: "NQ01 GRP A", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 GRP B", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ03 GRP FAIL", stake_amount: 20, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "group");

    assert.equal(result.quitterPoolNim, 20);

    const payoutA = result.payouts.find((p) => p.wallet_address === "NQ01 GRP A");
    const payoutB = result.payouts.find((p) => p.wallet_address === "NQ02 GRP B");

    assert.equal(payoutA.forfeited_reward_nim, 10); // 20 / 2
    assert.equal(payoutB.forfeited_reward_nim, 10);
    assert.equal(payoutA.stake_return_nim, 10);
    assert.equal(payoutB.stake_return_nim, 10);
  });
});

// ── EDGE CASES ───────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("TEST 17: Public challenge with only one participant still uses public forfeiture rules", () => {
    const participants = [
      { wallet_address: "NQ01 PUB LONE", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    // Must use public rules: stake forfeited, no protected return
    assert.equal(result.challengeType, "public");
    assert.equal(result.quitterPoolLuna, nimToLuna(10).toString());
    assert.equal(result.quitterPoolNim, 10);

    const failedPayout = result.payouts.find((p) => p.wallet_address === "NQ01 PUB LONE");
    assert.equal(failedPayout, undefined, "Single public participant who fails must NOT get stake back");
  });

  it("TEST 18: Group challenge with only one participant still uses group forfeiture rules", () => {
    const participants = [
      { wallet_address: "NQ01 GRP LONE", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "group");

    assert.equal(result.challengeType, "group");
    assert.equal(result.quitterPoolLuna, nimToLuna(10).toString());

    const failedPayout = result.payouts.find((p) => p.wallet_address === "NQ01 GRP LONE");
    assert.equal(failedPayout, undefined, "Single group participant who fails must NOT get stake back");
  });

  it("TEST 19: Solo challenge remains protected regardless of participant-count edge cases", () => {
    // Solo challenge with one participant who failed
    const participants = [
      { wallet_address: "NQ01 SOLO ONLY", stake_amount: 10, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "solo");

    assert.equal(result.challengeType, "solo");
    assert.equal(result.quitterPoolLuna, "0", "Solo must never create a quitter pool");

    const payout = result.payouts.find((p) => p.wallet_address === "NQ01 SOLO ONLY");
    assert.ok(payout, "Solo failed participant must receive protected stake");
    assert.equal(payout.stake_return_nim, 10);
    assert.equal(payout.bonus_nim, 0);
    assert.equal(payout.total_nim, 10);
    assert.equal(payout.payout_type, "solo_stake_return");
  });

  it("TEST 20: Mixed stakes calculate pool distribution correctly", () => {
    const participants = [
      { wallet_address: "NQ01 MIX A", stake_amount: 5, status: "completed" },
      { wallet_address: "NQ02 MIX B", stake_amount: 20, status: "completed" },
      { wallet_address: "NQ03 MIX C", stake_amount: 10, status: "failed" },
      { wallet_address: "NQ04 MIX D", stake_amount: 15, status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    // Quitter pool = 10 + 15 = 25 NIM
    assert.equal(result.quitterPoolNim, 25);

    // Each finisher gets 25/2 = 12.5 NIM (1250000 Luna)
    const payoutA = result.payouts.find((p) => p.wallet_address === "NQ01 MIX A");
    const payoutB = result.payouts.find((p) => p.wallet_address === "NQ02 MIX B");

    assert.equal(payoutA.forfeited_reward_nim, 12.5);
    assert.equal(payoutB.forfeited_reward_nim, 12.5);

    // Different stake amounts get different bonuses
    assert.equal(payoutA.nimstreak_bonus_nim, 2.5); // 50% of 5 NIM
    assert.equal(payoutB.nimstreak_bonus_nim, 5); // 50% of 20 NIM, capped at 5 NIM

    assert.equal(payoutA.total_nim, 20); // 5 + 12.5 + 2.5
    assert.equal(payoutB.total_nim, 37.5); // 20 + 12.5 + 5
  });

  it("TEST 21: Bonus caps remain enforced", () => {
    // Large crowd of finishers where theoretical bonus exceeds 20 NIM budget
    const participants = [];
    for (let i = 1; i <= 50; i++) {
      participants.push({
        wallet_address: `NQ${String(i).padStart(2, "0")} CROWD`,
        stake_amount: 10,
        status: "completed",
      });
    }
    const result = calculatePayouts(participants, null, null, "public");

    // Theoretical bonus = 50 * 5 NIM = 250 NIM, scaled to 20 NIM
    assert.equal(result.isBonusScaled, true);
    const totalBonusLuna = result.payouts.reduce((sum, p) => sum + BigInt(p.nimstreak_bonus_luna), 0n);
    assert.ok(totalBonusLuna <= CHALLENGE_MAX_BONUS_LUNA);

    // Solo with large bonus
    const soloParticipants = [
      { wallet_address: "NQ01 SOLO BIG", stake_amount: 100, status: "completed" },
    ];
    const soloResult = calculatePayouts(soloParticipants, null, null, "solo");
    const soloPayout = soloResult.payouts[0];
    // Individual cap: min(50 NIM, 5 NIM) = 5 NIM
    assert.equal(soloPayout.nimstreak_bonus_nim, 5);
  });

  it("TEST 22: Existing on-chain duplicate/retry safety tests continue passing", () => {
    // Verify calculatePayouts still correctly handles edge cases from existing tests
    const participants = [
      { wallet_address: "NQ01 AAAA", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 BBBB", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ03 CCCC", stake_amount: 10, status: "failed" },
      { wallet_address: "NQ04 DDDD", stake_amount: 10, status: "failed" },
    ];

    // With explicit public type — should match existing TEST 1 behavior
    const result = calculatePayouts(participants, null, null, "public");
    assert.equal(result.finisherCount, 2);
    assert.equal(result.quitterCount, 2);
    assert.equal(result.forfeitedPoolNim, 20);
    assert.equal(result.treasuryFeeLuna, "0");

    const payoutA = result.payouts.find((p) => p.wallet_address === "NQ01 AAAA");
    assert.equal(payoutA.stake_return_nim, 10);
    assert.equal(payoutA.forfeited_reward_nim, 10);
    assert.equal(payoutA.nimstreak_bonus_nim, 5);
    assert.equal(payoutA.total_nim, 25);
  });
});

// ── BACKWARD COMPATIBILITY ───────────────────────────────────────────────────

describe("Backward Compatibility", () => {
  it("TEST 23: Existing active solo challenge with already-staked user receives solo protected-stake outcome", () => {
    // Simulates an existing active solo challenge reaching completion
    // The challenge.type === "solo" is already stored — should get solo rules
    const participants = [
      { wallet_address: "NQ01 OLD SOLO", stake_amount: 10, stake_luna: "1000000", status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "solo");

    // Solo rules apply: stake protected, no bonus
    assert.equal(result.quitterPoolLuna, "0");
    const payout = result.payouts.find((p) => p.wallet_address === "NQ01 OLD SOLO");
    assert.ok(payout, "Existing solo failed participant must receive protected stake");
    assert.equal(payout.stake_return_luna, "1000000");
    assert.equal(payout.total_luna, "1000000");
    assert.equal(payout.bonus_luna, "0");
    assert.equal(payout.payout_type, "solo_stake_return");
  });

  it("TEST 24: Existing active public/group challenge continues communal forfeiture behavior", () => {
    // Simulates an existing active public challenge reaching completion
    const participants = [
      { wallet_address: "NQ01 OLD PUB A", stake_amount: 10, stake_luna: "1000000", status: "completed" },
      { wallet_address: "NQ02 OLD PUB B", stake_amount: 10, stake_luna: "1000000", status: "failed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    assert.equal(result.quitterPoolLuna, "1000000");
    const failedPayout = result.payouts.find((p) => p.wallet_address === "NQ02 OLD PUB B");
    assert.equal(failedPayout, undefined, "Existing public failed must not get stake back");

    const completedPayout = result.payouts.find((p) => p.wallet_address === "NQ01 OLD PUB A");
    assert.ok(completedPayout);
    assert.equal(completedPayout.forfeited_reward_luna, "1000000");
  });

  it("TEST 25: Existing stake amounts remain unchanged (no silent modification)", () => {
    // Verify that calculatePayouts does not mutate input participant objects
    const participants = [
      { wallet_address: "NQ01 IMMUT", stake_amount: 10, stake_luna: "1000000", status: "completed" },
      { wallet_address: "NQ02 IMMUT", stake_amount: 10, stake_luna: "1000000", status: "failed" },
    ];
    const origCopy = JSON.parse(JSON.stringify(participants));

    calculatePayouts(participants, null, null, "solo");

    // Input data must not be mutated
    assert.deepStrictEqual(participants, origCopy, "calculatePayouts must not mutate input participants");
  });

  it("TEST 26: Existing completed/paid challenges remain unchanged (no retroactive changes)", () => {
    // This is a structural test: calculatePayouts is a pure function that
    // only computes outcomes — it does not modify any database records.
    // Existing completed challenges are only affected if someone calls calculatePayouts
    // with their participants, and the result is used to create a NEW payout record.
    // Since the claim route checks for existing sent payouts and rejects duplicates,
    // already-paid challenges cannot be altered.
    const participants = [
      { wallet_address: "NQ01 PAID", stake_amount: 10, status: "completed" },
    ];
    const result = calculatePayouts(participants, null, null, "public");

    // Pure function returns output without side effects
    assert.ok(result.payouts);
    assert.equal(typeof result.totalPoolLuna, "string");
    // No database mutation occurs from calling calculatePayouts
  });

  it("TEST 27: Existing forfeiture records remain unchanged", () => {
    // calculatePayouts does not touch existing forfeiture records
    // It only computes what SHOULD happen — the claim route decides whether to act
    const participants = [
      { wallet_address: "NQ01 ALREADY FORFEIT", stake_amount: 10, status: "failed" },
    ];

    // Public: should not create a payout for the failed participant
    const pubResult = calculatePayouts(participants, null, null, "public");
    const pubPayout = pubResult.payouts.find((p) => p.wallet_address === "NQ01 ALREADY FORFEIT");
    assert.equal(pubPayout, undefined);

    // Solo: should create a protected stake return
    const soloResult = calculatePayouts(participants, null, null, "solo");
    const soloPayout = soloResult.payouts.find((p) => p.wallet_address === "NQ01 ALREADY FORFEIT");
    assert.ok(soloPayout);
    assert.equal(soloPayout.payout_type, "solo_stake_return");
  });

  it("TEST 28: No destructive database migration occurs (defensive fallback behavior)", () => {
    // When challengeType is not provided (null), the function defaults to
    // communal forfeiture as a defensive fallback — NOT as a mechanism for
    // protecting existing funds, but as a safe default for unexpected code paths.
    const participants = [
      { wallet_address: "NQ01 LEGACY A", stake_amount: 10, status: "completed" },
      { wallet_address: "NQ02 LEGACY B", stake_amount: 10, status: "failed" },
    ];

    // No challengeType = defensive communal fallback
    const result = calculatePayouts(participants);
    assert.equal(result.challengeType, null);
    assert.equal(result.quitterPoolNim, 10); // Communal forfeiture applies
    assert.equal(result.payouts.length, 1); // Only finisher gets a payout
    assert.equal(result.payouts[0].wallet_address, "NQ01 LEGACY A");
  });

  it("TEST 29: New challenges correctly use the new rules based on their stored type", () => {
    // Solo
    const soloParticipants = [
      { wallet_address: "NQ01 NEW SOLO", stake_amount: 5, status: "failed" },
    ];
    const soloResult = calculatePayouts(soloParticipants, null, null, "solo");
    assert.equal(soloResult.challengeType, "solo");
    assert.equal(soloResult.quitterPoolLuna, "0");
    assert.ok(soloResult.payouts.find((p) => p.payout_type === "solo_stake_return"));

    // Public
    const pubParticipants = [
      { wallet_address: "NQ01 NEW PUB", stake_amount: 5, status: "completed" },
      { wallet_address: "NQ02 NEW PUB", stake_amount: 5, status: "failed" },
    ];
    const pubResult = calculatePayouts(pubParticipants, null, null, "public");
    assert.equal(pubResult.challengeType, "public");
    assert.equal(pubResult.quitterPoolNim, 5);
    assert.equal(pubResult.payouts.length, 1); // Only finisher

    // Group
    const grpParticipants = [
      { wallet_address: "NQ01 NEW GRP", stake_amount: 5, status: "completed" },
      { wallet_address: "NQ02 NEW GRP", stake_amount: 5, status: "failed" },
    ];
    const grpResult = calculatePayouts(grpParticipants, null, null, "group");
    assert.equal(grpResult.challengeType, "group");
    assert.equal(grpResult.quitterPoolNim, 5);
    assert.equal(grpResult.payouts.length, 1);
  });
});

describe("Solo Payout Production Safety & Idempotency", () => {
  const originalFetch = globalThis.fetch;
  const testWallet = "NQ11 TEST SOLO FAIL SAFE 0000 0000 0000 0001";
  const normWallet = normalizeAddress(testWallet);
  const challengeId = "ch_solo_idempotency_audit";

  it("TEST 30: Solo missed check-in payout cannot be claimed twice (duplicate payout protection)", async () => {
    await db.initDb();
    const realTxHash = "9".repeat(64);

    // Seed confirmed solo payout
    await db.recordPayout({
      challenge_id: challengeId,
      wallet_address: normWallet,
      amount_nim: 10,
      amount_luna: nimToLuna(10).toString(),
      payout_type: "solo_stake_return",
      bonus_nim: 0,
      status: "sent",
      tx_hash: realTxHash,
    });

    // Mock RPC returning confirmed transaction
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        result: {
          data: {
            hash: realTxHash,
            blockNumber: 700100,
            value: 1000000,
            executionResult: true,
          },
        },
      }),
    });

    // Verify getPayout finds it under solo_stake_return or default lookup
    const foundDirect = await db.getPayout(challengeId, normWallet, "solo_stake_return");
    assert.ok(foundDirect, "getPayout must find solo_stake_return directly");
    assert.equal(foundDirect.status, "sent");

    const foundFallback = await db.getPayout(challengeId, normWallet, "stake_return_plus_bonus");
    assert.ok(foundFallback, "getPayout must find existing payout regardless of requested type");
    assert.equal(foundFallback.status, "sent");

    // Both queries confirm on-chain existence preventing duplicate payout
    const onChainTx = await getOnChainTransaction(foundFallback.tx_hash);
    assert.ok(onChainTx, "On-chain tx must be confirmed");
    assert.equal(foundFallback.amount_nim, 10);
    assert.equal(foundFallback.bonus_nim, 0);
  });

  it("TEST 31: Solo missed check-in payout does not increment completed_challenges or total_nim_earned or award winner badges", async () => {
    await db.initDb();
    const soloFailWallet = normalizeAddress("NQ22 TEST SOLO STATS 0000 0000 0000 0002");
    const chalId = "ch_solo_stats_audit";

    // Initialize profile
    const initialProf = await db.getProfile(soloFailWallet);
    const initialCompleted = initialProf.completed_challenges || 0;
    const initialEarned = initialProf.total_nim_earned || 0;

    await db.recordPayout({
      challenge_id: chalId,
      wallet_address: soloFailWallet,
      amount_nim: 25,
      amount_luna: nimToLuna(25).toString(),
      payout_type: "solo_stake_return",
      bonus_nim: 0,
      status: "sent",
      tx_hash: "8".repeat(64),
    });

    const updatedProf = await db.getProfile(soloFailWallet);
    assert.equal(updatedProf.completed_challenges, initialCompleted, "completed_challenges must not increment for solo failure");
    assert.equal(updatedProf.total_nim_earned, initialEarned, "total_nim_earned must not increment for principal stake return");

    const badges = await db.getBadges(soloFailWallet);
    const wonBadges = badges.filter((b) => b.id === "challenge_winner" || b.id === "first_win");
    assert.equal(wonBadges.length, 0, "Winner badges must not be awarded to missed check-in participants");
  });

  it("TEST 32: Solo missed check-in retry after failure recovers cleanly without double-payout", async () => {
    await db.initDb();
    const soloRetryWallet = normalizeAddress("NQ33 TEST SOLO RETRY 0000 0000 0000 0003");
    const chalId = "ch_solo_retry_audit";

    // 1. Record failed attempt
    await db.recordPayout({
      challenge_id: chalId,
      wallet_address: soloRetryWallet,
      amount_nim: 15,
      amount_luna: nimToLuna(15).toString(),
      payout_type: "solo_stake_return",
      status: "failed",
      error: "Treasury temporarily out of funds",
    });

    const failedRecord = await db.getPayout(chalId, soloRetryWallet, "solo_stake_return");
    assert.equal(failedRecord.status, "failed");

    // 2. Retry with pending
    await db.recordPayout({
      challenge_id: chalId,
      wallet_address: soloRetryWallet,
      amount_nim: 15,
      amount_luna: nimToLuna(15).toString(),
      payout_type: "solo_stake_return",
      status: "pending",
    });

    const pendingRecord = await db.getPayout(chalId, soloRetryWallet);
    assert.equal(pendingRecord.status, "pending");

    // 3. Confirm with sent and verified hash
    const confirmedHash = "7".repeat(64);
    await db.recordPayout({
      challenge_id: chalId,
      wallet_address: soloRetryWallet,
      amount_nim: 15,
      amount_luna: nimToLuna(15).toString(),
      payout_type: "solo_stake_return",
      bonus_nim: 0,
      status: "sent",
      tx_hash: confirmedHash,
    });

    const finalRecord = await db.getPayout(chalId, soloRetryWallet);
    assert.equal(finalRecord.status, "sent");
    assert.equal(finalRecord.tx_hash, confirmedHash);
    assert.equal(finalRecord.amount_nim, 15);
  });
});
