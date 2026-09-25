import { initDb, normalizeAddress } from "../src/db.js";

const LEGITIMATE_CHALLENGE_IDS = new Set([
  "ch_1788569526117_504aa3", // 7 days of coding
  "ch_1788655837955_e18ac2", // 50 push up daily
  "ch_1788656959840_33eeff", // Saving daily
  "ch_1788657355176_b5e3f9", // Eating egg daily
  "ch_1788753238235_d3c47b", // Gym
  "ch_1789181841171_eeb556", // Read daily (Active)
  "ch_1789185229270_5e0395", // Run daily
  "ch_1789263081457_e7b1f6", // Save $10 daily (Active)
  "ch_1789445466445_334a52", // 7 Days of Early Rising (Completed & Paid)
  "ch_1789533093487_de197a", // Meditate
  "ch_1789796007187_355042", // Journal (Active)
]);

const TEST_WALLET_PREFIXES = [
  "NQ071111",
  "NQ111111",
  "NQ11AAAA",
  "NQ221111",
  "NQ339999",
  "NQ445555",
  "NQ991111",
  "NQ99TEST",
  "NQ11TEST",
  "NQ33TEST",
  "NQ22TEST",
];

export async function runCleanup({ execute = false } = {}) {
  // Ensure we connect to real Firestore for the cleanup
  delete process.env.NODE_ENV;
  const db = await initDb();
  if (!db) {
    throw new Error("Could not initialize Firestore database.");
  }

  console.log(`\n======================================================`);
  console.log(`🧹 Firestore Production Cleanup: Mode = ${execute ? "EXECUTE (LIVE DELETIONS)" : "DRY-RUN (NO CHANGES)"}`);
  console.log(`======================================================\n`);

  // 1. Challenges
  const chSnap = await db.collection("challenges").get();
  const testChallenges = chSnap.docs.filter((d) => !LEGITIMATE_CHALLENGE_IDS.has(d.id));
  console.log(`[challenges] Found ${chSnap.size} total docs, ${testChallenges.length} test docs to delete.`);

  // 2. Participants
  const partSnap = await db.collection("challenge_participants").get();
  const testParticipants = partSnap.docs.filter((d) => {
    const data = d.data();
    const chId = data.challenge_id || d.id.split("_NQ")[0];
    return !LEGITIMATE_CHALLENGE_IDS.has(chId);
  });
  console.log(`[challenge_participants] Found ${partSnap.size} total docs, ${testParticipants.length} test docs to delete.`);

  // 3. Payouts
  const payoutSnap = await db.collection("nimstreak_payouts").get();
  const testPayouts = payoutSnap.docs.filter((d) => {
    const data = d.data();
    return !LEGITIMATE_CHALLENGE_IDS.has(data.challenge_id);
  });
  console.log(`[nimstreak_payouts] Found ${payoutSnap.size} total docs, ${testPayouts.length} test docs to delete.`);

  // 4. Badges
  const badgeSnap = await db.collection("nimstreak_badges").get();
  const testBadges = badgeSnap.docs.filter((d) => {
    const data = d.data();
    const isTestWallet = TEST_WALLET_PREFIXES.some((p) => d.id.startsWith(p));
    const isTestChallenge = data.challenge_id && !LEGITIMATE_CHALLENGE_IDS.has(data.challenge_id);
    return isTestWallet || isTestChallenge;
  });
  console.log(`[nimstreak_badges] Found ${badgeSnap.size} total docs, ${testBadges.length} test docs to delete.`);

  // 5. Test Profiles
  const profSnap = await db.collection("nimstreak_profiles").get();
  const testProfiles = profSnap.docs.filter((d) => {
    return TEST_WALLET_PREFIXES.some((p) => d.id.startsWith(p));
  });
  console.log(`[nimstreak_profiles] Found ${profSnap.size} total docs, ${testProfiles.length} dummy test profiles to delete.`);

  // 6. Push Notification Logs
  const pushSnap = await db.collection("push_sent_log").get();
  const testPush = pushSnap.docs.filter((d) => {
    const data = d.data();
    return data.challenge_id && !LEGITIMATE_CHALLENGE_IDS.has(data.challenge_id);
  });
  console.log(`[push_sent_log] Found ${pushSnap.size} total docs, ${testPush.length} test log entries to delete.`);

  if (execute) {
    console.log(`\nExecuting Firestore batch deletions...`);
    const allDocsToDelete = [
      ...testChallenges,
      ...testParticipants,
      ...testPayouts,
      ...testBadges,
      ...testProfiles,
      ...testPush,
    ];

    console.log(`Total documents to delete: ${allDocsToDelete.length}`);

    // Commit in batches of 400 (Firestore max is 500)
    const BATCH_SIZE = 400;
    for (let i = 0; i < allDocsToDelete.length; i += BATCH_SIZE) {
      const chunk = allDocsToDelete.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      console.log(`Deleted batch of ${chunk.length} documents.`);
    }

    // Recalculate true profiles
    console.log(`\nRecalculating legitimate user profiles...`);
    const PROFILES_TO_RECALCULATE = {
      NQ59SBB2631QX85Y3X25S586XGM1VY9PQ2X6: {
        total_challenges: 7,
        completed_challenges: 1,
        failed_challenges: 3,
        total_nim_staked: 23,
        total_nim_earned: 2.5,
        current_active_streak: 7,
        longest_streak_ever: 7,
      },
      NQ48ARHSXLJJX9D19LGL07YSDTK92THB48Y2: {
        total_challenges: 3,
        completed_challenges: 0,
        failed_challenges: 3,
        total_nim_staked: 11,
        total_nim_earned: 0,
        current_active_streak: 0,
        longest_streak_ever: 1,
      },
      NQ77C3P5CTMYN3BBK15KGB5GC4EBHGM5NPAN: {
        total_challenges: 3,
        completed_challenges: 0,
        failed_challenges: 3,
        total_nim_staked: 1.5,
        total_nim_earned: 0,
        current_active_streak: 0,
        longest_streak_ever: 0,
      },
      NQ29GT4GPPLKLD1PYUVKBRB3AM55N3KAB1NS: {
        total_challenges: 2,
        completed_challenges: 1,
        failed_challenges: 0,
        total_nim_staked: 6,
        total_nim_earned: 2.5,
        current_active_streak: 7,
        longest_streak_ever: 7,
      },
    };

    for (const [wallet, stats] of Object.entries(PROFILES_TO_RECALCULATE)) {
      const docRef = db.collection("nimstreak_profiles").doc(wallet);
      await docRef.set(stats, { merge: true });
      console.log(`Updated profile for ${wallet}:`, stats);
    }

    console.log(`\n✅ Cleanup & recalculation finished successfully!`);
  } else {
    console.log(`\n[DRY RUN] No changes were made to production Firestore.`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("cleanup_firestore_production.mjs")) {
  const isExecute = process.argv.includes("--execute");
  runCleanup({ execute: isExecute })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Cleanup failed:", err);
      process.exit(1);
    });
}
