/**
 * READ-ONLY AUDIT: Production HTLC Stake & Payout Identity Inspection
 * 
 * STRICT CONSTRAINTS:
 * - Read-only: ZERO writes, ZERO mutations, ZERO payouts, ZERO fund transfers.
 * - Connects to production Firestore and Nimiq RPC to inspect:
 *   1. All participants across legitimate challenges
 *   2. Whether on-chain stake was basic (fromType != 2) or HTLC (fromType == 2)
 *   3. Stored participant.wallet_address vs decoded HTLC proof.creator
 *   4. Historical payouts: whether funds were sent to HTLC contract or human funder
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Ensure real Firestore connection
delete process.env.NODE_ENV;

const dbModule = await import("../src/db.js");
const payoutModule = await import("../src/nimstreak-payout.js");

const { initDb, normalizeAddress, getIsFirestoreConnected } = dbModule;
const { getOnChainTransaction, resolveVerifiedFundingAddress } = payoutModule;

async function runReadOnlyAudit() {
  console.log("\n" + "=".repeat(110));
  console.log("🔍 NIMSTREAK READ-ONLY AUDIT: ON-CHAIN STAKE & HTLC FUNDING WALLET RESOLUTION");
  console.log("=".repeat(110));
  console.log(`Execution Timestamp: ${new Date().toISOString()}`);

  const db = await initDb();
  if (!db || !getIsFirestoreConnected()) {
    console.error("❌ Failed to connect to production Firestore.");
    process.exit(1);
  }
  console.log("✅ Connected to production Cloud Firestore (Read-Only Mode)\n");

  // Fetch challenges
  const chSnap = await db.collection("challenges").get();
  const allChallenges = [];
  chSnap.forEach((doc) => allChallenges.push({ id: doc.id, ...doc.data() }));

  // Filter for real/legitimate user challenges (ignore automated test mocks if any remain)
  const userChallenges = allChallenges.filter((c) => !c.id.startsWith("ch_test") && !c.id.startsWith("ch_mock") && !c.id.startsWith("ch_badge") && !c.id.startsWith("ch_legacy"));
  console.log(`Found ${allChallenges.length} total challenges in database, ${userChallenges.length} legitimate production challenges.\n`);

  // Fetch participants
  const partSnap = await db.collection("challenge_participants").get();
  const allParticipants = [];
  partSnap.forEach((doc) => allParticipants.push({ id: doc.id, ...doc.data() }));

  // Fetch payouts
  const payoutSnap = await db.collection("nimstreak_payouts").get();
  const allPayouts = [];
  payoutSnap.forEach((doc) => allPayouts.push({ id: doc.id, ...doc.data() }));

  console.log("-".repeat(110));
  console.log("PART 1: AUDIT OF PARTICIPANT STAKE IDENTITIES");
  console.log("-".repeat(110));

  const participantAuditResults = [];

  for (const challenge of userChallenges) {
    const participants = allParticipants.filter((p) => (p.challenge_id || p.id.split("_NQ")[0]) === challenge.id);
    if (participants.length === 0) continue;

    console.log(`\n📌 Challenge: "${challenge.title}" (${challenge.id})`);
    console.log(`   Status: ${challenge.status} | Type: ${challenge.type} | Stake: ${challenge.stake_nim} NIM | Ends: ${challenge.ends_at || "N/A"}`);

    for (const p of participants) {
      const storedWallet = normalizeAddress(p.wallet_address || "");
      const storedProfile = normalizeAddress(p.profile_wallet || "");
      const stakeTxHash = p.stake_tx_hash;

      let onChainTx = null;
      let fromType = "UNKNOWN";
      let rawFrom = "N/A";
      let decodedCreator = "N/A";
      let resolvedFunder = "N/A";
      let classification = "NO_STAKE_TX";

      if (stakeTxHash) {
        try {
          onChainTx = await getOnChainTransaction(stakeTxHash);
          if (onChainTx) {
            fromType = onChainTx.fromType ?? (onChainTx.type || 1);
            rawFrom = normalizeAddress(onChainTx.from || onChainTx.sender || "");
            
            // Resolve using our canonical resolver
            const resObj = resolveVerifiedFundingAddress(onChainTx);
            resolvedFunder = resObj.fundingAddress;

            if (fromType === 2) {
              decodedCreator = resolvedFunder;
              if (storedWallet === rawFrom && storedWallet !== resolvedFunder) {
                classification = "AFFECTED_BY_HTLC_BUG"; // Stored the HTLC contract address
              } else if (storedWallet === resolvedFunder) {
                classification = "CORRECT_HUMAN_FUNDER_STORED";
              } else {
                classification = "HTLC_OTHER_MISMATCH";
              }
            } else {
              classification = storedWallet === resolvedFunder ? "BASIC_TX_MATCH" : "BASIC_TX_MISMATCH";
            }
          } else {
            classification = "TX_NOT_FOUND_ON_CHAIN";
          }
        } catch (err) {
          classification = `RPC_ERROR: ${err.message}`;
        }
      }

      const res = {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        challengeStatus: challenge.status,
        participantId: p.id,
        participantStatus: p.status,
        storedWallet,
        storedProfile,
        stakeTxHash,
        fromType,
        rawFrom,
        decodedCreator,
        resolvedFunder,
        classification,
      };

      participantAuditResults.push(res);

      console.log(`   - Participant: ${p.id}`);
      console.log(`     Stored wallet_address : ${storedWallet}`);
      console.log(`     Stored profile_wallet : ${storedProfile}`);
      console.log(`     Stake Tx Hash         : ${stakeTxHash || "None"}`);
      console.log(`     On-Chain fromType     : ${fromType} ${fromType === 2 ? "(HTLC Contract)" : "(Basic Account)"}`);
      console.log(`     On-Chain rawFrom      : ${rawFrom}`);
      console.log(`     Canonical Funder      : ${resolvedFunder}`);
      console.log(`     Audit Verdict         : ${classification === "AFFECTED_BY_HTLC_BUG" ? "⚠️  AFFECTED BY HTLC BUG (Stored contract instead of human funder)" : classification === "BASIC_TX_MATCH" ? "✅ Basic Tx Match" : classification === "CORRECT_HUMAN_FUNDER_STORED" ? "✅ Correct Human Funder Stored" : `ℹ️  ${classification}`}`);
    }
  }

  console.log("\n" + "-".repeat(110));
  console.log("PART 2: AUDIT OF HISTORICAL PAYOUTS");
  console.log("-".repeat(110));

  const payoutAuditResults = [];

  for (const payout of allPayouts) {
    const payoutTxHash = payout.payout_tx_hash || payout.tx_hash;
    const recipient = normalizeAddress(payout.wallet_address || payout.recipient || "");
    const profile = normalizeAddress(payout.profile_wallet || "");
    const challengeId = payout.challenge_id;
    const challenge = allChallenges.find((c) => c.id === challengeId);

    // Find the participant's stake tx
    const participant = allParticipants.find((p) => (p.challenge_id || p.id.split("_NQ")[0]) === challengeId && (p.wallet_address === recipient || p.profile_wallet === profile));

    let stakeFunder = "N/A";
    let stakeRawFrom = "N/A";
    let stakeFromType = "N/A";
    let payoutVerdict = "UNKNOWN";

    if (participant && participant.stake_tx_hash) {
      try {
        const stakeTx = await getOnChainTransaction(participant.stake_tx_hash);
        if (stakeTx) {
          stakeFromType = stakeTx.fromType ?? 1;
          stakeRawFrom = normalizeAddress(stakeTx.from || stakeTx.sender || "");
          stakeFunder = resolveVerifiedFundingAddress(stakeTx).fundingAddress;

          if (stakeFromType === 2) {
            if (recipient === stakeRawFrom && recipient !== stakeFunder) {
              payoutVerdict = "PAID_TO_HTLC_CONTRACT (STRANDED FUNDS)";
            } else if (recipient === stakeFunder) {
              payoutVerdict = "PAID_TO_TRUE_HUMAN_FUNDER";
            } else {
              payoutVerdict = "PAID_TO_OTHER_ADDRESS";
            }
          } else {
            payoutVerdict = recipient === stakeFunder ? "PAID_TO_BASIC_FUNDER (CORRECT)" : "MISMATCHED_BASIC_PAYOUT";
          }
        }
      } catch (e) {
        payoutVerdict = `STAKE_CHECK_ERROR: ${e.message}`;
      }
    }

    const pRes = {
      payoutId: payout.id,
      challengeId,
      challengeTitle: challenge?.title || "Unknown",
      amountNim: (payout.amount_luna || 0) / 1e5,
      recipient,
      profile,
      payoutTxHash,
      stakeFromType,
      stakeRawFrom,
      trueHumanFunder: stakeFunder,
      payoutVerdict,
    };
    payoutAuditResults.push(pRes);

    console.log(`\n💸 Payout Doc: ${payout.id}`);
    console.log(`   Challenge           : "${pRes.challengeTitle}" (${challengeId})`);
    console.log(`   Amount              : ${pRes.amountNim} NIM`);
    console.log(`   Payout Recipient    : ${recipient}`);
    console.log(`   Payout Tx Hash      : ${payoutTxHash}`);
    console.log(`   Stake fromType      : ${stakeFromType}`);
    console.log(`   Stake Contract Addr : ${stakeRawFrom}`);
    console.log(`   True Human Funder   : ${stakeFunder}`);
    console.log(`   Payout Verdict      : ${payoutVerdict.includes("STRANDED") ? "🚨 " + payoutVerdict : "✅ " + payoutVerdict}`);
  }

  console.log("\n" + "=".repeat(110));
  console.log("SUMMARY OF READ-ONLY AUDIT");
  console.log("=".repeat(110));

  const htlcParticipants = participantAuditResults.filter((p) => p.fromType === 2);
  const affectedActive = participantAuditResults.filter((p) => p.classification === "AFFECTED_BY_HTLC_BUG" && p.challengeStatus === "active");
  const strandedPayouts = payoutAuditResults.filter((p) => p.payoutVerdict.includes("STRANDED"));

  console.log(`Total Legitimate Participants Audited : ${participantAuditResults.length}`);
  console.log(`Participants using HTLC (Nimiq Pay)    : ${htlcParticipants.length}`);
  console.log(`Active Participants with Stored HTLC  : ${affectedActive.length}`);
  console.log(`Historical Payouts Audited            : ${payoutAuditResults.length}`);
  console.log(`Payouts Stranded on HTLC Contracts    : ${strandedPayouts.length}`);

  if (strandedPayouts.length > 0) {
    console.log("\n🚨 STRANDED PAYOUT DETAILS:");
    for (const sp of strandedPayouts) {
      console.log(`   - Challenge: "${sp.challengeTitle}" | Amount: ${sp.amountNim} NIM`);
      console.log(`     Tx Hash: ${sp.payoutTxHash}`);
      console.log(`     Sent to Disposable HTLC: ${sp.recipient}`);
      console.log(`     Intended Human Recipient: ${sp.trueHumanFunder}`);
    }
  }

  if (affectedActive.length > 0) {
    console.log("\n⚠️  ACTIVE CHALLENGES WITH STORED HTLC CONTRACT ADDRESSES:");
    for (const ac of affectedActive) {
      console.log(`   - Challenge: "${ac.challengeTitle}" (${ac.challengeId})`);
      console.log(`     Currently Stored participant.wallet_address: ${ac.storedWallet} (HTLC Contract)`);
      console.log(`     True Human Funder to be Paid at Claim      : ${ac.resolvedFunder} (${ac.storedProfile})`);
    }
  }

  console.log("\n" + "=".repeat(110));
  console.log("READ-ONLY AUDIT COMPLETE — ZERO WRITES PERFORMED");
  console.log("=".repeat(110) + "\n");
}

runReadOnlyAudit().catch((err) => {
  console.error("Audit error:", err);
  process.exit(1);
});
