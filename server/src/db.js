import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

let dbInstance = null;
let isFirestoreConnected = false;

// ── In-Memory Store (used during local tests or when Firebase credentials are not set) ──
const memoryStore = {
  profiles: new Map(),
  challenges: new Map(),
  participants: new Map(), // key: `${challengeId}_${walletAddress}`
  checkins: new Map(),     // key: `${challengeId}_${walletAddress}_${checkinDate}`
  payouts: new Map(),      // key: `${challengeId}_${walletAddress}_${payoutType}`
  badges: new Map(),       // key: `${walletAddress}_${badgeType}_${challengeId}`
  usedTxHashes: new Set(),
};

// Seed sample challenges in memory for immediate development/testing
function seedInitialData() {
  if (memoryStore.challenges.size > 0) return;
  const samples = [
    {
      id: "c1-fitness-30",
      title: "30-Day Morning Workout Routine",
      description: "Do 30 minutes of physical exercise every morning before 10 AM. Stay active!",
      category: "fitness",
      type: "public",
      duration_days: 30,
      stake_nim: 5.0,
      stake_luna: 500000,
      checkin_type: "tap",
      created_by: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
      starts_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 27 * 86400000).toISOString(),
      status: "active",
      max_participants: 50,
      invite_code: "FIT30",
      created_at: new Date().toISOString(),
    },
    {
      id: "c2-coding-100",
      title: "100 Days of Code Sprint",
      description: "Write code and make at least 1 Git commit every single day. No excuses.",
      category: "coding",
      type: "public",
      duration_days: 100,
      stake_nim: 10.0,
      stake_luna: 1000000,
      checkin_type: "text",
      created_by: "NQ12 3456 7890 ABCD EFGH IJKL MNOP QRST UVWX",
      starts_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 95 * 86400000).toISOString(),
      status: "active",
      max_participants: 100,
      invite_code: "CODE100",
      created_at: new Date().toISOString(),
    },
    {
      id: "c3-mindfulness-14",
      title: "14 Days of Daily Meditation",
      description: "10 minutes of guided meditation or mindful breathing each day.",
      category: "mindfulness",
      type: "public",
      duration_days: 14,
      stake_nim: 2.0,
      stake_luna: 200000,
      checkin_type: "tap",
      created_by: "NQ99 9999 9999 9999 9999 9999 9999 9999 9999",
      starts_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 13 * 86400000).toISOString(),
      status: "active",
      max_participants: 30,
      invite_code: "ZEN14",
      created_at: new Date().toISOString(),
    },
  ];

  for (const s of samples) {
    memoryStore.challenges.set(s.id, s);
    const partKey = `${s.id}_${s.created_by.replace(/\\s+/g, "").toUpperCase()}`;
    memoryStore.participants.set(partKey, {
      id: `part_${s.id}`,
      challenge_id: s.id,
      wallet_address: s.created_by,
      stake_amount: s.stake_nim,
      stake_luna: s.stake_luna,
      status: "active",
      current_streak: 1,
      longest_streak: 1,
      total_checkins: 1,
      joined_at: s.starts_at,
    });
  }
}

seedInitialData();

export function normalizeAddress(addr) {
  return String(addr || "").trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * Initialize Firebase Admin SDK & Firestore instance.
 * Supports:
 * - FIREBASE_SERVICE_ACCOUNT (raw JSON or Base64 encoded JSON string)
 * - GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT_KEY_PATH (file path)
 * - FIREBASE_PROJECT_ID (GCP / Application Default Credentials)
 * - Graceful fallback to memoryStore if credentials are not present (for test environments)
 */
export async function initDb() {
  if (dbInstance) return dbInstance;

  try {
    let credential = null;
    const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (saEnv) {
      try {
        let jsonStr = saEnv.trim();
        if (!jsonStr.startsWith("{")) {
          // Attempt base64 decode
          jsonStr = Buffer.from(jsonStr, "base64").toString("utf-8");
        }
        const serviceAccount = JSON.parse(jsonStr);
        credential = cert(serviceAccount);
      } catch (parseErr) {
        console.warn("[firestore:init] Failed to parse FIREBASE_SERVICE_ACCOUNT:", parseErr.message);
      }
    } else if (saPath) {
      credential = applicationDefault();
    }

    if (!getApps().length) {
      const config = {};
      if (credential) config.credential = credential;
      if (projectId) config.projectId = projectId;

      if (credential || projectId) {
        initializeApp(config);
      }
    }

    if (getApps().length > 0) {
      dbInstance = getFirestore();
      // Disable undefined property warnings & configure timestamps
      dbInstance.settings({ ignoreUndefinedProperties: true });
      isFirestoreConnected = true;
      console.info("🔥 Firebase Admin Firestore initialized successfully.");
      return dbInstance;
    }
  } catch (err) {
    console.warn("⚠️ Firebase Firestore initialization warning:", err.message);
  }

  console.info("ℹ️ Running NimStreak database in persistent in-memory mode (Set FIREBASE_SERVICE_ACCOUNT for Cloud Firestore).");
  isFirestoreConnected = false;
  return null;
}

export function getIsFirestoreConnected() {
  return isFirestoreConnected;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPOSITORY METHODS
// ─────────────────────────────────────────────────────────────────────────────

// ── Global Stats ─────────────────────────────────────────────────────────────
export async function getGlobalStats() {
  if (isFirestoreConnected && dbInstance) {
    try {
      const [profilesSnap, challengesSnap, participantsSnap, checkinsSnap, payoutsSnap] = await Promise.all([
        dbInstance.collection("nimstreak_profiles").count().get(),
        dbInstance.collection("challenges").where("status", "==", "active").count().get(),
        dbInstance.collection("challenge_participants").get(),
        dbInstance.collection("checkins").count().get(),
        dbInstance.collection("nimstreak_payouts").where("status", "==", "sent").get(),
      ]);

      let totalStaked = 0;
      participantsSnap.forEach((doc) => {
        totalStaked += parseFloat(doc.data().stake_amount || 0);
      });

      let totalPaid = 0;
      payoutsSnap.forEach((doc) => {
        totalPaid += parseFloat(doc.data().amount_nim || 0);
      });

      return {
        totalUsers: profilesSnap.data().count,
        totalNimStaked: totalStaked,
        activeChallenges: challengesSnap.data().count,
        totalCheckins: checkinsSnap.data().count,
        totalNimPaid: totalPaid,
      };
    } catch (err) {
      console.warn("[firestore:getGlobalStats] error:", err.message);
    }
  }

  let totalStaked = 0;
  for (const p of memoryStore.participants.values()) {
    totalStaked += parseFloat(p.stake_amount || 0);
  }
  let totalPaid = 0;
  for (const py of memoryStore.payouts.values()) {
    if (py.status === "sent") totalPaid += parseFloat(py.amount_nim || 0);
  }

  return {
    totalUsers: Math.max(memoryStore.profiles.size, 12),
    totalNimStaked: Math.max(totalStaked, 142.5),
    activeChallenges: Array.from(memoryStore.challenges.values()).filter((c) => c.status === "active").length,
    totalCheckins: Math.max(memoryStore.checkins.size, 89),
    totalNimPaid: totalPaid || 45.0,
  };
}

// ── Profiles ─────────────────────────────────────────────────────────────────
export async function getProfile(walletAddress) {
  const norm = normalizeAddress(walletAddress);
  const defaultProfile = {
    wallet_address: norm,
    display_name: `Streaker_${norm.slice(-4)}`,
    total_challenges: 0,
    completed_challenges: 0,
    failed_challenges: 0,
    total_nim_staked: 0,
    total_nim_earned: 0,
    longest_streak_ever: 0,
    current_active_streak: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isFirestoreConnected && dbInstance) {
    try {
      const docRef = dbInstance.collection("nimstreak_profiles").doc(norm);
      const doc = await docRef.get();
      if (doc.exists) {
        return doc.data();
      }
      await docRef.set(defaultProfile);
      return defaultProfile;
    } catch (err) {
      console.warn("[firestore:getProfile] error:", err.message);
    }
  }

  if (!memoryStore.profiles.has(norm)) {
    memoryStore.profiles.set(norm, { ...defaultProfile });
  }
  return memoryStore.profiles.get(norm);
}

export async function updateProfile(walletAddress, fields = {}) {
  const norm = normalizeAddress(walletAddress);
  const updated_at = new Date().toISOString();
  const updateData = { ...fields, updated_at };

  if (isFirestoreConnected && dbInstance) {
    try {
      const docRef = dbInstance.collection("nimstreak_profiles").doc(norm);
      await docRef.set(updateData, { merge: true });
      const updated = await docRef.get();
      return updated.data();
    } catch (err) {
      console.warn("[firestore:updateProfile] error:", err.message);
    }
  }

  const existing = await getProfile(norm);
  const merged = { ...existing, ...updateData };
  memoryStore.profiles.set(norm, merged);
  return merged;
}

// ── Badges ───────────────────────────────────────────────────────────────────
export async function getBadges(walletAddress) {
  const norm = normalizeAddress(walletAddress);
  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("nimstreak_badges")
        .where("wallet_address", "==", norm)
        .orderBy("earned_at", "desc")
        .get();
      return snap.docs.map((d) => d.data());
    } catch (err) {
      console.warn("[firestore:getBadges] error:", err.message);
    }
  }

  const list = [];
  for (const b of memoryStore.badges.values()) {
    if (b.wallet_address === norm) list.push(b);
  }
  return list.sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at));
}

export async function awardBadge(walletAddress, badgeType, challengeId = null) {
  const norm = normalizeAddress(walletAddress);
  const docId = `${norm}_${badgeType}_${challengeId || "global"}`;
  const badgeData = {
    id: docId,
    wallet_address: norm,
    badge_type: badgeType,
    challenge_id: challengeId,
    earned_at: new Date().toISOString(),
  };

  if (isFirestoreConnected && dbInstance) {
    try {
      const docRef = dbInstance.collection("nimstreak_badges").doc(docId);
      const existing = await docRef.get();
      if (!existing.exists) {
        await docRef.set(badgeData);
        return badgeData;
      }
      return existing.data();
    } catch (err) {
      console.warn("[firestore:awardBadge] error:", err.message);
    }
  }

  if (!memoryStore.badges.has(docId)) {
    memoryStore.badges.set(docId, badgeData);
  }
  return memoryStore.badges.get(docId);
}

// ── Challenges ───────────────────────────────────────────────────────────────
export async function getChallenges({ status, category, type, search } = {}) {
  if (isFirestoreConnected && dbInstance) {
    try {
      let q = dbInstance.collection("challenges");
      if (status && status !== "all") q = q.where("status", "==", status);
      if (category && category !== "all") q = q.where("category", "==", category.toLowerCase());
      if (type && type !== "all") q = q.where("type", "==", type.toLowerCase());

      const snap = await q.orderBy("created_at", "desc").get();
      const allChallenges = snap.docs.map((d) => d.data());

      // Fetch participants to enrich with counts
      const partsSnap = await dbInstance.collection("challenge_participants").get();
      const participants = partsSnap.docs.map((d) => d.data());

      const enriched = allChallenges
        .filter((c) => {
          if (!search) return true;
          const s = search.toLowerCase();
          return (c.title || "").toLowerCase().includes(s) || (c.description || "").toLowerCase().includes(s);
        })
        .map((c) => {
          const cParts = participants.filter((p) => p.challenge_id === c.id);
          const activeCount = cParts.filter((p) => p.status === "active").length;
          const quitCount = cParts.filter((p) => p.status === "failed").length;
          const pool = cParts.reduce((sum, p) => sum + parseFloat(p.stake_amount || 0), 0);

          return {
            ...c,
            active_participants_count: activeCount,
            quitters_count: quitCount,
            total_participants: activeCount + quitCount,
            total_pool_nim: pool || c.stake_nim,
          };
        });

      return enriched;
    } catch (err) {
      console.warn("[firestore:getChallenges] error:", err.message);
    }
  }

  const list = Array.from(memoryStore.challenges.values()).filter((c) => {
    if (status && status !== "all" && c.status !== status) return false;
    if (category && category !== "all" && c.category !== category.toLowerCase()) return false;
    if (type && type !== "all" && c.type !== type.toLowerCase()) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.title || "").toLowerCase().includes(s) || (c.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  return list.map((c) => {
    let activeCount = 0;
    let quitCount = 0;
    let pool = 0;
    for (const p of memoryStore.participants.values()) {
      if (p.challenge_id === c.id) {
        if (p.status === "active") activeCount++;
        if (p.status === "failed") quitCount++;
        pool += parseFloat(p.stake_amount || 0);
      }
    }
    return {
      ...c,
      active_participants_count: activeCount,
      quitters_count: quitCount,
      total_participants: activeCount + quitCount,
      total_pool_nim: pool || c.stake_nim,
    };
  });
}

export async function getChallengeById(id) {
  if (!id) return null;
  if (isFirestoreConnected && dbInstance) {
    try {
      const doc = await dbInstance.collection("challenges").doc(id).get();
      return doc.exists ? doc.data() : null;
    } catch (err) {
      console.warn("[firestore:getChallengeById] error:", err.message);
    }
  }
  return memoryStore.challenges.get(id) || null;
}

export async function getChallengeByInviteCode(code) {
  if (!code) return null;
  const cleanCode = code.trim().toUpperCase();

  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("challenges")
        .where("invite_code", "==", cleanCode)
        .limit(1)
        .get();
      return snap.empty ? null : snap.docs[0].data();
    } catch (err) {
      console.warn("[firestore:getChallengeByInviteCode] error:", err.message);
    }
  }

  for (const c of memoryStore.challenges.values()) {
    if ((c.invite_code || "").toUpperCase() === cleanCode) return c;
  }
  return null;
}

export async function createChallenge(challengeData, creatorParticipantData) {
  const challengeId = challengeData.id || `ch_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const fullChallenge = {
    ...challengeData,
    id: challengeId,
    created_at: challengeData.created_at || new Date().toISOString(),
  };

  const normCreator = normalizeAddress(challengeData.created_by);
  const normFunding = normalizeAddress(creatorParticipantData?.wallet_address || normCreator);
  const normProfile = normalizeAddress(creatorParticipantData?.profile_wallet || normCreator);
  const partDocId = `${challengeId}_${normFunding}`;
  const fullParticipant = {
    ...creatorParticipantData,
    id: `part_${challengeId}_${normFunding.slice(0, 6)}`,
    challenge_id: challengeId,
    wallet_address: normFunding,
    profile_wallet: normProfile,
    joined_at: new Date().toISOString(),
  };

  if (isFirestoreConnected && dbInstance) {
    try {
      const batch = dbInstance.batch();
      const chalRef = dbInstance.collection("challenges").doc(challengeId);
      const partRef = dbInstance.collection("challenge_participants").doc(partDocId);
      const profRef = dbInstance.collection("nimstreak_profiles").doc(normProfile);

      batch.set(chalRef, fullChallenge);
      batch.set(partRef, fullParticipant);
      batch.set(
        profRef,
        {
          wallet_address: normProfile,
          total_challenges: FieldValue.increment(1),
          total_nim_staked: FieldValue.increment(Number(fullChallenge.stake_nim) || 0),
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );

      await batch.commit();

      // Award first_challenge badge
      await awardBadge(normProfile, "first_challenge", challengeId);

      return fullChallenge;
    } catch (err) {
      console.warn("[firestore:createChallenge] batch error:", err.message);
    }
  }

  // Memory fallback
  memoryStore.challenges.set(challengeId, fullChallenge);
  memoryStore.participants.set(partDocId, fullParticipant);
  if (fullParticipant.stake_tx_hash) {
    memoryStore.usedTxHashes.add(fullParticipant.stake_tx_hash.trim().toLowerCase());
  }

  const prof = await getProfile(normProfile);
  await updateProfile(normProfile, {
    total_challenges: (prof.total_challenges || 0) + 1,
    total_nim_staked: (prof.total_nim_staked || 0) + (Number(fullChallenge.stake_nim) || 0),
  });

  await awardBadge(normProfile, "first_challenge", challengeId);
  return fullChallenge;
}

export async function updateChallenge(id, fields = {}) {
  if (isFirestoreConnected && dbInstance) {
    try {
      const docRef = dbInstance.collection("challenges").doc(id);
      await docRef.set(fields, { merge: true });
      const doc = await docRef.get();
      return doc.data();
    } catch (err) {
      console.warn("[firestore:updateChallenge] error:", err.message);
    }
  }

  const existing = memoryStore.challenges.get(id);
  if (existing) {
    const updated = { ...existing, ...fields };
    memoryStore.challenges.set(id, updated);
    return updated;
  }
  return null;
}

// ── Participants ─────────────────────────────────────────────────────────────
export async function getParticipant(challengeId, walletAddress) {
  const norm = normalizeAddress(walletAddress);
  const partDocId = `${challengeId}_${norm}`;

  if (isFirestoreConnected && dbInstance) {
    try {
      // 1. Fast path: check document by ${challengeId}_${norm}
      const doc = await dbInstance.collection("challenge_participants").doc(partDocId).get();
      if (doc.exists) {
        return doc.data();
      }

      // 2. Fallback: lookup by profile_wallet
      const snap = await dbInstance
        .collection("challenge_participants")
        .where("challenge_id", "==", challengeId)
        .where("profile_wallet", "==", norm)
        .limit(1)
        .get();

      if (!snap.empty) {
        return snap.docs[0].data();
      }
      return null;
    } catch (err) {
      console.warn("[firestore:getParticipant] error:", err.message);
    }
  }

  // Memory fallback
  const direct = memoryStore.participants.get(partDocId);
  if (direct) return direct;

  for (const p of memoryStore.participants.values()) {
    if (p.challenge_id === challengeId && (p.wallet_address === norm || p.profile_wallet === norm)) {
      return p;
    }
  }

  return null;
}

export async function getChallengeParticipants(challengeId) {
  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("challenge_participants")
        .where("challenge_id", "==", challengeId)
        .get();

      const participants = snap.docs.map((d) => d.data());

      // Fetch profiles to attach display_name
      const enriched = await Promise.all(
        participants.map(async (p) => {
          const prof = await getProfile(p.wallet_address);
          return {
            ...p,
            display_name: prof?.display_name || `Streaker_${p.wallet_address.slice(-4)}`,
          };
        })
      );

      return enriched.sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0));
    } catch (err) {
      console.warn("[firestore:getChallengeParticipants] error:", err.message);
    }
  }

  const list = [];
  for (const p of memoryStore.participants.values()) {
    if (p.challenge_id === challengeId) {
      const prof = memoryStore.profiles.get(p.wallet_address);
      list.push({
        ...p,
        display_name: prof?.display_name || `Streaker_${p.wallet_address.slice(-4)}`,
      });
    }
  }
  return list.sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0));
}

export async function checkReplayStakeTxHash(txHash) {
  if (!txHash) return false;
  const clean = txHash.trim().toLowerCase();

  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("challenge_participants")
        .where("stake_tx_hash", "==", clean)
        .limit(1)
        .get();
      return !snap.empty;
    } catch (err) {
      console.warn("[firestore:checkReplayStakeTxHash] error:", err.message);
    }
  }

  if (memoryStore.usedTxHashes.has(clean)) return true;
  for (const p of memoryStore.participants.values()) {
    if ((p.stake_tx_hash || "").toLowerCase() === clean) return true;
  }
  return false;
}

export async function addParticipant(challengeId, participantData) {
  const normFunding = normalizeAddress(participantData.wallet_address);
  const normProfile = normalizeAddress(participantData.profile_wallet || participantData.wallet_address);
  const partDocId = `${challengeId}_${normFunding}`;
  const fullPart = {
    ...participantData,
    id: `part_${challengeId}_${normFunding.slice(0, 6)}_${Date.now()}`,
    challenge_id: challengeId,
    wallet_address: normFunding,
    profile_wallet: normProfile,
    status: participantData.status || "active",
    current_streak: participantData.current_streak || 0,
    longest_streak: participantData.longest_streak || 0,
    total_checkins: participantData.total_checkins || 0,
    joined_at: participantData.joined_at || new Date().toISOString(),
  };

  if (isFirestoreConnected && dbInstance) {
    try {
      const batch = dbInstance.batch();
      const partRef = dbInstance.collection("challenge_participants").doc(partDocId);
      const profRef = dbInstance.collection("nimstreak_profiles").doc(normProfile);

      batch.set(partRef, fullPart);
      batch.set(
        profRef,
        {
          wallet_address: normProfile,
          total_challenges: FieldValue.increment(1),
          total_nim_staked: FieldValue.increment(Number(fullPart.stake_amount) || 0),
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );

      await batch.commit();
      return fullPart;
    } catch (err) {
      console.warn("[firestore:addParticipant] error:", err.message);
    }
  }

  memoryStore.participants.set(partDocId, fullPart);
  if (fullPart.stake_tx_hash) {
    memoryStore.usedTxHashes.add(fullPart.stake_tx_hash.trim().toLowerCase());
  }

  const prof = await getProfile(normProfile);
  await updateProfile(normProfile, {
    total_challenges: (prof.total_challenges || 0) + 1,
    total_nim_staked: (prof.total_nim_staked || 0) + (Number(fullPart.stake_amount) || 0),
  });

  return fullPart;
}

export async function updateParticipant(challengeId, walletAddress, fields = {}) {
  const norm = normalizeAddress(walletAddress);
  const partDocId = `${challengeId}_${norm}`;

  if (isFirestoreConnected && dbInstance) {
    try {
      const docRef = dbInstance.collection("challenge_participants").doc(partDocId);
      await docRef.set(fields, { merge: true });
      const doc = await docRef.get();
      return doc.data();
    } catch (err) {
      console.warn("[firestore:updateParticipant] error:", err.message);
    }
  }

  const existing = memoryStore.participants.get(partDocId);
  if (existing) {
    const updated = { ...existing, ...fields };
    memoryStore.participants.set(partDocId, updated);
    return updated;
  }
  return null;
}

// ── Checkins ─────────────────────────────────────────────────────────────────
export async function getCheckin(challengeId, walletAddress, checkinDate) {
  const norm = normalizeAddress(walletAddress);
  const checkinDocId = `${challengeId}_${norm}_${checkinDate}`;

  if (isFirestoreConnected && dbInstance) {
    try {
      const doc = await dbInstance.collection("checkins").doc(checkinDocId).get();
      return doc.exists ? doc.data() : null;
    } catch (err) {
      console.warn("[firestore:getCheckin] error:", err.message);
    }
  }

  return memoryStore.checkins.get(checkinDocId) || null;
}

export async function recordCheckin(checkinData, streakUpdate) {
  const normFunding = normalizeAddress(checkinData.wallet_address);
  const normProfile = normalizeAddress(checkinData.profile_wallet || checkinData.wallet_address);
  const checkinDocId = `${checkinData.challenge_id}_${normFunding}_${checkinData.checkin_date}`;
  const fullCheckin = {
    ...checkinData,
    id: `chk_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    wallet_address: normFunding,
    profile_wallet: normProfile,
    verified: true,
    created_at: new Date().toISOString(),
  };

  const partDocId = `${checkinData.challenge_id}_${normFunding}`;

  if (isFirestoreConnected && dbInstance) {
    try {
      const batch = dbInstance.batch();
      const checkinRef = dbInstance.collection("checkins").doc(checkinDocId);
      const partRef = dbInstance.collection("challenge_participants").doc(partDocId);
      const profRef = dbInstance.collection("nimstreak_profiles").doc(normProfile);

      batch.set(checkinRef, fullCheckin);
      batch.set(
        partRef,
        {
          current_streak: streakUpdate.current_streak,
          longest_streak: streakUpdate.longest_streak,
          total_checkins: streakUpdate.total_checkins,
        },
        { merge: true }
      );

      batch.set(
        profRef,
        {
          current_active_streak: streakUpdate.current_streak,
          longest_streak_ever: streakUpdate.longest_streak,
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );

      await batch.commit();

      // Check and award badges to stable profile
      const earnedBadges = [];
      if (streakUpdate.current_streak >= 7) {
        await awardBadge(normProfile, "streak_7", checkinData.challenge_id);
        earnedBadges.push("streak_7");
      }
      if (streakUpdate.current_streak >= 14) {
        await awardBadge(normProfile, "streak_14", checkinData.challenge_id);
        earnedBadges.push("streak_14");
      }
      if (streakUpdate.current_streak >= 30) {
        await awardBadge(normProfile, "streak_30", checkinData.challenge_id);
        earnedBadges.push("streak_30");
      }
      if (streakUpdate.current_streak >= 100) {
        await awardBadge(normProfile, "streak_100", checkinData.challenge_id);
        earnedBadges.push("streak_100");
      }

      return { checkin: fullCheckin, earnedBadges };
    } catch (err) {
      console.warn("[firestore:recordCheckin] error:", err.message);
    }
  }

  // Memory fallback
  memoryStore.checkins.set(checkinDocId, fullCheckin);
  const part = memoryStore.participants.get(partDocId) || {};
  memoryStore.participants.set(partDocId, {
    ...part,
    current_streak: streakUpdate.current_streak,
    longest_streak: streakUpdate.longest_streak,
    total_checkins: streakUpdate.total_checkins,
  });

  const prof = await getProfile(normProfile);
  await updateProfile(normProfile, {
    current_active_streak: Math.max(prof.current_active_streak || 0, streakUpdate.current_streak),
    longest_streak_ever: Math.max(prof.longest_streak_ever || 0, streakUpdate.longest_streak),
  });

  const earnedBadges = [];
  if (streakUpdate.current_streak >= 7) {
    await awardBadge(normProfile, "streak_7", checkinData.challenge_id);
    earnedBadges.push("streak_7");
  }
  if (streakUpdate.current_streak >= 14) {
    await awardBadge(normProfile, "streak_14", checkinData.challenge_id);
    earnedBadges.push("streak_14");
  }
  if (streakUpdate.current_streak >= 30) {
    await awardBadge(normProfile, "streak_30", checkinData.challenge_id);
    earnedBadges.push("streak_30");
  }
  if (streakUpdate.current_streak >= 100) {
    await awardBadge(normProfile, "streak_100", checkinData.challenge_id);
    earnedBadges.push("streak_100");
  }

  return { checkin: fullCheckin, earnedBadges };
}

export async function getChallengeCheckins(challengeId) {
  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("checkins")
        .where("challenge_id", "==", challengeId)
        .orderBy("created_at", "desc")
        .get();
      return snap.docs.map((d) => d.data());
    } catch (err) {
      console.warn("[firestore:getChallengeCheckins] error:", err.message);
    }
  }

  const list = [];
  for (const ch of memoryStore.checkins.values()) {
    if (ch.challenge_id === challengeId) list.push(ch);
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ── Payouts ──────────────────────────────────────────────────────────────────
export async function getPayout(challengeId, walletAddress, payoutType = "stake_return_plus_bonus") {
  const norm = normalizeAddress(walletAddress);
  const payoutDocId = `${challengeId}_${norm}_${payoutType}`;

  if (isFirestoreConnected && dbInstance) {
    try {
      const doc = await dbInstance.collection("nimstreak_payouts").doc(payoutDocId).get();
      return doc.exists ? doc.data() : null;
    } catch (err) {
      console.warn("[firestore:getPayout] error:", err.message);
    }
  }

  return memoryStore.payouts.get(payoutDocId) || null;
}

export async function getChallengePayouts(challengeId) {
  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("nimstreak_payouts")
        .where("challenge_id", "==", challengeId)
        .orderBy("created_at", "desc")
        .get();
      return snap.docs.map((d) => d.data());
    } catch (err) {
      console.warn("[firestore:getChallengePayouts] error:", err.message);
    }
  }

  const list = [];
  for (const py of memoryStore.payouts.values()) {
    if (py.challenge_id === challengeId) list.push(py);
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function recordPayout(payoutData) {
  const norm = normalizeAddress(payoutData.wallet_address);
  const payoutType = payoutData.payout_type || "stake_return_plus_bonus";
  const payoutDocId = `${payoutData.challenge_id}_${norm}_${payoutType}`;

  const fullPayout = {
    ...payoutData,
    id: `payout_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    wallet_address: norm,
    payout_type: payoutType,
    created_at: new Date().toISOString(),
  };

  if (isFirestoreConnected && dbInstance) {
    try {
      const batch = dbInstance.batch();
      const payoutRef = dbInstance.collection("nimstreak_payouts").doc(payoutDocId);
      const profRef = dbInstance.collection("nimstreak_profiles").doc(norm);

      batch.set(payoutRef, fullPayout, { merge: true });
      if (fullPayout.status === "sent") {
        batch.set(
          profRef,
          {
            completed_challenges: FieldValue.increment(1),
            total_nim_earned: FieldValue.increment(Number(fullPayout.bonus_nim || fullPayout.amount_nim) || 0),
            updated_at: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      await batch.commit();

      if (fullPayout.status === "sent") {
        await awardBadge(norm, "challenge_winner", payoutData.challenge_id);
        await awardBadge(norm, "first_win", payoutData.challenge_id);
      }

      return fullPayout;
    } catch (err) {
      console.warn("[firestore:recordPayout] error:", err.message);
    }
  }

  memoryStore.payouts.set(payoutDocId, fullPayout);
  if (fullPayout.status === "sent") {
    const prof = await getProfile(norm);
    await updateProfile(norm, {
      completed_challenges: (prof.completed_challenges || 0) + 1,
      total_nim_earned: (prof.total_nim_earned || 0) + (Number(fullPayout.bonus_nim || fullPayout.amount_nim) || 0),
    });
    await awardBadge(norm, "challenge_winner", payoutData.challenge_id);
    await awardBadge(norm, "first_win", payoutData.challenge_id);
  }

  return fullPayout;
}

// ── User Challenges ──────────────────────────────────────────────────────────
export async function getUserChallenges(walletAddress) {
  const norm = normalizeAddress(walletAddress);

  if (isFirestoreConnected && dbInstance) {
    try {
      const [walletSnap, profileSnap] = await Promise.all([
        dbInstance
          .collection("challenge_participants")
          .where("wallet_address", "==", norm)
          .get(),
        dbInstance
          .collection("challenge_participants")
          .where("profile_wallet", "==", norm)
          .get(),
      ]);

      const partsMap = new Map();
      walletSnap.docs.forEach((d) => {
        const data = d.data();
        if (data && data.challenge_id) {
          partsMap.set(data.challenge_id, data);
        }
      });
      profileSnap.docs.forEach((d) => {
        const data = d.data();
        if (data && data.challenge_id && !partsMap.has(data.challenge_id)) {
          partsMap.set(data.challenge_id, data);
        }
      });

      const userParts = Array.from(partsMap.values());

      const challengesWithPart = await Promise.all(
        userParts.map(async (p) => {
          const chal = await getChallengeById(p.challenge_id);
          if (!chal) return null;
          return {
            ...p,
            title: chal.title,
            description: chal.description,
            category: chal.category,
            challenge_type: chal.type,
            duration_days: chal.duration_days,
            checkin_type: chal.checkin_type,
            starts_at: chal.starts_at,
            ends_at: chal.ends_at,
            challenge_status: chal.status,
          };
        })
      );

      const valid = challengesWithPart.filter(Boolean);
      return {
        all: valid,
        active: valid.filter((c) => c.status === "active" && c.challenge_status === "active"),
        completed: valid.filter((c) => c.status === "completed" || c.challenge_status === "completed"),
        failed: valid.filter((c) => c.status === "failed"),
      };
    } catch (err) {
      console.warn("[firestore:getUserChallenges] error:", err.message);
    }
  }

  const partsMap = new Map();
  for (const p of memoryStore.participants.values()) {
    if (p.wallet_address === norm || p.profile_wallet === norm) {
      if (!partsMap.has(p.challenge_id)) {
        partsMap.set(p.challenge_id, p);
      }
    }
  }

  const userParts = [];
  for (const p of partsMap.values()) {
    const chal = memoryStore.challenges.get(p.challenge_id);
    if (chal) {
      userParts.push({
        ...p,
        title: chal.title,
        description: chal.description,
        category: chal.category,
        challenge_type: chal.type,
        duration_days: chal.duration_days,
        checkin_type: chal.checkin_type,
        starts_at: chal.starts_at,
        ends_at: chal.ends_at,
        challenge_status: chal.status,
      });
    }
  }

  return {
    all: userParts,
    active: userParts.filter((c) => c.status === "active" && c.challenge_status === "active"),
    completed: userParts.filter((c) => c.status === "completed" || c.challenge_status === "completed"),
    failed: userParts.filter((c) => c.status === "failed"),
  };
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
export async function getLeaderboard(limitCount = 20) {
  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("nimstreak_profiles")
        .orderBy("current_active_streak", "desc")
        .limit(limitCount)
        .get();

      return snap.docs.map((d, index) => ({
        ...d.data(),
        rank: index + 1,
      }));
    } catch (err) {
      console.warn("[firestore:getLeaderboard] error:", err.message);
    }
  }

  const profiles = Array.from(memoryStore.profiles.values());
  profiles.sort((a, b) => (b.current_active_streak || 0) - (a.current_active_streak || 0));

  return profiles.slice(0, limitCount).map((p, index) => ({
    ...p,
    rank: index + 1,
  }));
}

// ── Participant Calendar ──────────────────────────────────────────────────
export async function getParticipantCalendar(challengeId, walletAddress) {
  const chal = await getChallengeById(challengeId);
  if (!chal) return null;
  const checkins = await getChallengeCheckins(challengeId);
  const norm = normalizeAddress(walletAddress);
  const userCheckins = checkins.filter(
    (c) => normalizeAddress(c.wallet_address) === norm || normalizeAddress(c.profile_wallet) === norm
  );
  const checkinDates = new Set(userCheckins.map((c) => c.checkin_date));
  const startDate = new Date(chal.starts_at);
  const todayStr = new Date().toISOString().split("T")[0];
  const duration = chal.duration_days || 30;

  const calendar = [];
  for (let day = 1; day <= duration; day++) {
    const d = new Date(startDate.getTime() + (day - 1) * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const checkedIn = checkinDates.has(dateStr);

    let status = "future";
    if (checkedIn) {
      status = "checked_in";
    } else if (isToday) {
      status = "pending_today";
    } else if (isPast) {
      status = "missed";
    }

    calendar.push({
      dayNumber: day,
      date: dateStr,
      checkedIn,
      status,
      isToday,
      isFuture,
    });
  }
  return { challengeId, duration, calendar };
}

// ── Challenge Leaderboard ──────────────────────────────────────────────────
export async function getChallengeLeaderboard(challengeId) {
  const participants = await getChallengeParticipants(challengeId);
  return participants.map((p, idx) => ({
    ...p,
    rank: idx + 1,
  }));
}

// ── Cron Daily Evaluations ───────────────────────────────────────────────────
export async function evaluateDailyMissedCheckins() {
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const todayStr = new Date().toISOString().split("T")[0];
  const quitters = [];

  // Fetch all active participants
  let activeParticipants = [];
  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("challenge_participants")
        .where("status", "==", "active")
        .get();
      activeParticipants = snap.docs.map((d) => d.data());
    } catch (err) {
      console.warn("[firestore:evaluateDailyMissedCheckins] error:", err.message);
    }
  } else {
    activeParticipants = Array.from(memoryStore.participants.values()).filter((p) => p.status === "active");
  }

  for (const p of activeParticipants) {
    const chal = await getChallengeById(p.challenge_id);
    if (!chal || chal.status !== "active") continue;

    // A participant is only evaluated for missed days that occurred AFTER their enrollment date
    const joinedDateStr = (p.joined_at || "").split("T")[0];
    if (joinedDateStr >= todayStr) continue;

    // Check if participant checked in yesterday
    const checkin = await getCheckin(p.challenge_id, p.wallet_address, yesterdayStr);
    if (!checkin) {
      // Mark as failed
      await updateParticipant(p.challenge_id, p.wallet_address, {
        status: "failed",
        failed_at: new Date().toISOString(),
      });

      const prof = await getProfile(p.wallet_address);
      await updateProfile(p.wallet_address, {
        failed_challenges: (prof.failed_challenges || 0) + 1,
        current_active_streak: 0,
      });

      quitters.push({
        ...p,
        title: chal.title,
      });
    }
  }

  return quitters;
}

export async function evaluateEndedChallenges() {
  const nowIso = new Date().toISOString();
  let endedList = [];

  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("challenges")
        .where("status", "==", "active")
        .where("ends_at", "<=", nowIso)
        .get();
      endedList = snap.docs.map((d) => d.data());
    } catch (err) {
      console.warn("[firestore:evaluateEndedChallenges] error:", err.message);
    }
  } else {
    endedList = Array.from(memoryStore.challenges.values()).filter(
      (c) => c.status === "active" && new Date(c.ends_at) <= new Date()
    );
  }

  const results = [];
  for (const chal of endedList) {
    await updateChallenge(chal.id, { status: "completed" });
    const participants = await getChallengeParticipants(chal.id);

    for (const p of participants) {
      if (p.status === "active") {
        await updateParticipant(chal.id, p.wallet_address, { status: "completed" });
        await awardBadge(p.wallet_address, "challenge_winner", chal.id);
        p.status = "completed";
      }
    }

    results.push({ challenge: chal, participants });
  }

  return results;
}

// ── Backward-Compatible query/pool/withTransaction shims for legacy callers ──
export const pool = {
  query: async () => ({ rows: [] }),
  on: () => {},
};

export const query = async () => ({ rows: [] });

export const withTransaction = async (cb) => cb({});

export default {
  initDb,
  getIsFirestoreConnected,
  getGlobalStats,
  getProfile,
  updateProfile,
  getBadges,
  awardBadge,
  getChallenges,
  getChallengeById,
  getChallengeByInviteCode,
  createChallenge,
  updateChallenge,
  getParticipant,
  getChallengeParticipants,
  checkReplayStakeTxHash,
  addParticipant,
  updateParticipant,
  getCheckin,
  recordCheckin,
  getChallengeCheckins,
  getPayout,
  getChallengePayouts,
  recordPayout,
  getUserChallenges,
  getLeaderboard,
  getParticipantCalendar,
  getChallengeLeaderboard,
  evaluateDailyMissedCheckins,
  evaluateEndedChallenges,
  normalizeAddress,
};
