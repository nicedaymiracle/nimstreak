import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

let dbInstance = null;
let isFirestoreConnected = false;

// ── In-Memory Store (used during local tests or when Firebase credentials are not set) ──
export const memoryStore = {
  profiles: new Map(),
  challenges: new Map(),
  participants: new Map(), // key: `${challengeId}_${walletAddress}`
  checkins: new Map(),     // key: `${challengeId}_${walletAddress}_${checkinDate}`
  payouts: new Map(),      // key: `${challengeId}_${walletAddress}_${payoutType}`
  badges: new Map(),       // key: `${walletAddress}_${badgeType}_${challengeId}`
  usedTxHashes: new Set(),
  pushSubscriptions: new Map(), // key: endpoint
  notificationPreferences: new Map(), // key: normWallet
  pushSentLog: new Map(), // key: dedupKey
};



export function normalizeAddress(addr) {
  return String(addr || "").trim().replace(/\s+/g, "").toUpperCase();
}

export const CLEAN_STABLE_PROFILE = "NQ48ARHSXLJJX9D19LGL07YSDTK92THB48Y2";
export const CLEAN_KNOWN_FUNDING = "NQ77C3P5CTMYN3BBK15KGB5GC4EBHGM5NPAN";

export function getAssociatedAddresses(walletAddress) {
  const norm = normalizeAddress(walletAddress);
  if (!norm) return [];
  if (norm === CLEAN_STABLE_PROFILE || norm === CLEAN_KNOWN_FUNDING) {
    return [CLEAN_STABLE_PROFILE, CLEAN_KNOWN_FUNDING];
  }
  return [norm];
}

export function resolveProfileWallet(profileWallet, fundingWallet) {
  const normP = normalizeAddress(profileWallet);
  const normF = normalizeAddress(fundingWallet);
  if (normP === CLEAN_KNOWN_FUNDING || !normP) {
    if (normF === CLEAN_KNOWN_FUNDING || normP === CLEAN_KNOWN_FUNDING) {
      return CLEAN_STABLE_PROFILE;
    }
    return normF;
  }
  return normP;
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
    totalUsers: memoryStore.profiles.size,
    totalNimStaked: totalStaked,
    activeChallenges: Array.from(memoryStore.challenges.values()).filter((c) => c.status === "active").length,
    totalCheckins: memoryStore.checkins.size,
    totalNimPaid: totalPaid,
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
      let profile = doc.exists ? doc.data() : { ...defaultProfile };

      if (norm === CLEAN_STABLE_PROFILE) {
        const fundingDoc = await dbInstance.collection("nimstreak_profiles").doc(CLEAN_KNOWN_FUNDING).get();
        if (fundingDoc.exists) {
          const fData = fundingDoc.data();
          return {
            ...profile,
            total_challenges: Math.max(profile.total_challenges || 0, fData.total_challenges || 0),
            completed_challenges: Math.max(profile.completed_challenges || 0, fData.completed_challenges || 0),
            failed_challenges: Math.max(profile.failed_challenges || 0, fData.failed_challenges || 0),
            total_nim_staked: Math.max(profile.total_nim_staked || 0, fData.total_nim_staked || 0),
            total_nim_earned: Math.max(profile.total_nim_earned || 0, fData.total_nim_earned || 0),
            longest_streak_ever: Math.max(profile.longest_streak_ever || 0, fData.longest_streak_ever || 0),
            current_active_streak: Math.max(profile.current_active_streak || 0, fData.current_active_streak || 0),
          };
        }
      }

      return profile;
    } catch (err) {
      console.warn("[firestore:getProfile] error:", err.message);
    }
  }

  if (!memoryStore.profiles.has(norm)) {
    memoryStore.profiles.set(norm, { ...defaultProfile });
  }
  const memProfile = memoryStore.profiles.get(norm);
  if (norm === CLEAN_STABLE_PROFILE && memoryStore.profiles.has(CLEAN_KNOWN_FUNDING)) {
    const fData = memoryStore.profiles.get(CLEAN_KNOWN_FUNDING);
    return {
      ...memProfile,
      total_challenges: Math.max(memProfile.total_challenges || 0, fData.total_challenges || 0),
      completed_challenges: Math.max(memProfile.completed_challenges || 0, fData.completed_challenges || 0),
      failed_challenges: Math.max(memProfile.failed_challenges || 0, fData.failed_challenges || 0),
      total_nim_staked: Math.max(memProfile.total_nim_staked || 0, fData.total_nim_staked || 0),
      total_nim_earned: Math.max(memProfile.total_nim_earned || 0, fData.total_nim_earned || 0),
      longest_streak_ever: Math.max(memProfile.longest_streak_ever || 0, fData.longest_streak_ever || 0),
      current_active_streak: Math.max(memProfile.current_active_streak || 0, fData.current_active_streak || 0),
    };
  }
  return memProfile;
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
  const norm = resolveProfileWallet(walletAddress, walletAddress);
  const targetAddresses = getAssociatedAddresses(norm);

  if (isFirestoreConnected && dbInstance) {
    try {
      const badgesMap = new Map();
      for (const addr of targetAddresses) {
        const snap = await dbInstance
          .collection("nimstreak_badges")
          .where("wallet_address", "==", addr)
          .get();
        for (const doc of snap.docs) {
          const data = doc.data();
          if (data) {
            const dedupKey = data.badge_type === "first_challenge"
              ? "first_challenge"
              : (data.id || `${data.wallet_address}_${data.badge_type}`);
            if (!badgesMap.has(dedupKey)) {
              badgesMap.set(dedupKey, data);
            }
          }
        }
      }

      const results = Array.from(badgesMap.values());
      for (const b of results) {
        if (b.id) memoryStore.badges.set(b.id, b);
      }
      return results.sort((a, b) => new Date(b.earned_at || 0) - new Date(a.earned_at || 0));
    } catch (err) {
      console.warn("[firestore:getBadges] error:", err.message);
    }
  }

  const list = [];
  const seen = new Set();
  for (const b of memoryStore.badges.values()) {
    if (targetAddresses.includes(b.wallet_address)) {
      const dedupKey = b.badge_type === "first_challenge"
        ? "first_challenge"
        : (b.id || `${b.wallet_address}_${b.badge_type}`);
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        list.push(b);
      }
    }
  }
  return list.sort((a, b) => new Date(b.earned_at || 0) - new Date(a.earned_at || 0));
}

export async function awardBadge(walletAddress, badgeType, challengeId = null) {
  const norm = resolveProfileWallet(walletAddress, walletAddress);
  // For milestone badges like first_challenge, ensure unique un-duplicated achievement
  const docId = badgeType === "first_challenge"
    ? `${norm}_first_challenge`
    : `${norm}_${badgeType}_${challengeId || "global"}`;
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
        memoryStore.badges.set(docId, badgeData);
        return badgeData;
      }
      const data = existing.data();
      memoryStore.badges.set(docId, data);
      return data;
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

export function isChallengeExpired(challenge, now = new Date()) {
  if (!challenge) return true;

  if (challenge.ends_at) {
    const end = new Date(challenge.ends_at);
    if (!isNaN(end.getTime())) {
      return end.getTime() <= now.getTime();
    }
  }

  const startTime = challenge.starts_at || challenge.created_at;
  const duration = Number(challenge.duration_days);
  if (startTime && !isNaN(duration) && duration > 0) {
    const start = new Date(startTime);
    if (!isNaN(start.getTime())) {
      return start.getTime() + duration * 86400000 <= now.getTime();
    }
  }

  return false;
}

export function isChallengeActive(challenge, now = new Date()) {
  if (!challenge) return false;
  if (challenge.status !== "active") return false;
  if (isChallengeExpired(challenge, now)) return false;
  return true;
}

export async function getChallenges({ status = "active", category, type, search } = {}) {
  const filterActiveOnly = status === "active";
  const now = new Date();

  if (isFirestoreConnected && dbInstance) {
    try {
      let q = dbInstance.collection("challenges");
      if (status && status !== "all") q = q.where("status", "==", status);
      if (category && category !== "all") q = q.where("category", "==", category.toLowerCase());
      if (type && type !== "all") q = q.where("type", "==", type.toLowerCase());

      const snap = await q.get();
      let allChallenges = snap.docs.map((d) => d.data());

      if (filterActiveOnly) {
        allChallenges = allChallenges.filter((c) => isChallengeActive(c, now));
      } else if (status && status !== "all") {
        allChallenges = allChallenges.filter((c) => c.status === status);
      }

      allChallenges.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      // Fetch participants to enrich with counts
      const partsSnap = await dbInstance.collection("challenge_participants").get();
      const participants = partsSnap.docs.map((d) => d.data());

      const enriched = allChallenges
        .filter((c) => {
          if (!search) return true;
          const s = search.toLowerCase();
          return (
            (c.title || "").toLowerCase().includes(s) ||
            (c.description || "").toLowerCase().includes(s) ||
            (c.invite_code || "").toLowerCase() === s
          );
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

  let list = Array.from(memoryStore.challenges.values()).filter((c) => {
    if (filterActiveOnly) {
      if (!isChallengeActive(c, now)) return false;
    } else if (status && status !== "all" && c.status !== status) {
      return false;
    }
    if (category && category !== "all" && (c.category || "").toLowerCase() !== category.toLowerCase()) return false;
    if (type && type !== "all" && (c.type || "").toLowerCase() !== type.toLowerCase()) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (c.title || "").toLowerCase().includes(s) ||
        (c.description || "").toLowerCase().includes(s) ||
        (c.invite_code || "").toLowerCase() === s
      );
    }
    return true;
  });

  list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

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
  const normProfile = resolveProfileWallet(creatorParticipantData?.profile_wallet || normCreator, normFunding);
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
  const lookupAddrs = getAssociatedAddresses(walletAddress);

  if (isFirestoreConnected && dbInstance) {
    try {
      // 1. Fast path: check document by ${challengeId}_${addr} for all associated addresses
      for (const addr of lookupAddrs) {
        const partDocId = `${challengeId}_${addr}`;
        const doc = await dbInstance.collection("challenge_participants").doc(partDocId).get();
        if (doc.exists) {
          const data = doc.data();
          return {
            ...data,
            profile_wallet: resolveProfileWallet(data.profile_wallet, data.wallet_address),
          };
        }
      }

      // 2. Query path: lookup by profile_wallet for all associated addresses
      for (const addr of lookupAddrs) {
        const snap = await dbInstance
          .collection("challenge_participants")
          .where("challenge_id", "==", challengeId)
          .where("profile_wallet", "==", addr)
          .limit(1)
          .get();

        if (!snap.empty) {
          const data = snap.docs[0].data();
          return {
            ...data,
            profile_wallet: resolveProfileWallet(data.profile_wallet, data.wallet_address),
          };
        }
      }
      return null;
    } catch (err) {
      console.warn("[firestore:getParticipant] error:", err.message);
    }
  }

  // Memory fallback
  for (const addr of lookupAddrs) {
    const direct = memoryStore.participants.get(`${challengeId}_${addr}`);
    if (direct) {
      return {
        ...direct,
        profile_wallet: resolveProfileWallet(direct.profile_wallet, direct.wallet_address),
      };
    }
  }

  const lookupSet = new Set(lookupAddrs);
  for (const p of memoryStore.participants.values()) {
    if (p.challenge_id === challengeId) {
      const pFunding = normalizeAddress(p.wallet_address);
      const resolvedProfile = resolveProfileWallet(p.profile_wallet, pFunding);
      if (lookupSet.has(pFunding) || lookupSet.has(resolvedProfile)) {
        return {
          ...p,
          profile_wallet: resolvedProfile,
        };
      }
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

      const participants = snap.docs.map((d) => {
        const data = d.data();
        const resolvedProfile = resolveProfileWallet(data.profile_wallet, data.wallet_address);
        return {
          ...data,
          profile_wallet: resolvedProfile,
        };
      });

      // Fetch profiles to attach display_name
      const enriched = await Promise.all(
        participants.map(async (p) => {
          const prof = await getProfile(p.profile_wallet || p.wallet_address);
          return {
            ...p,
            display_name: prof?.display_name || `Streaker_${(p.profile_wallet || p.wallet_address).slice(-4)}`,
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
      const pFunding = normalizeAddress(p.wallet_address);
      const resolvedProfile = resolveProfileWallet(p.profile_wallet, pFunding);
      const prof = memoryStore.profiles.get(resolvedProfile);
      list.push({
        ...p,
        profile_wallet: resolvedProfile,
        display_name: prof?.display_name || `Streaker_${resolvedProfile.slice(-4)}`,
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
  const normProfile = resolveProfileWallet(participantData.profile_wallet || participantData.wallet_address, normFunding);
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
      await awardBadge(normProfile, "first_challenge", challengeId);
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

  await awardBadge(normProfile, "first_challenge", challengeId);
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
  const lookupAddrs = getAssociatedAddresses(walletAddress);

  if (isFirestoreConnected && dbInstance) {
    try {
      for (const addr of lookupAddrs) {
        const checkinDocId = `${challengeId}_${addr}_${checkinDate}`;
        const doc = await dbInstance.collection("checkins").doc(checkinDocId).get();
        if (doc.exists) {
          const data = doc.data();
          return {
            ...data,
            profile_wallet: resolveProfileWallet(data.profile_wallet, data.wallet_address),
          };
        }
      }
      return null;
    } catch (err) {
      console.warn("[firestore:getCheckin] error:", err.message);
    }
  }

  for (const addr of lookupAddrs) {
    const checkinDocId = `${challengeId}_${addr}_${checkinDate}`;
    const mem = memoryStore.checkins.get(checkinDocId);
    if (mem) {
      return {
        ...mem,
        profile_wallet: resolveProfileWallet(mem.profile_wallet, mem.wallet_address),
      };
    }
  }

  return null;
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
        .get();
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          profile_wallet: resolveProfileWallet(data.profile_wallet, data.wallet_address),
        };
      });
      return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (err) {
      console.warn("[firestore:getChallengeCheckins] error:", err.message);
    }
  }

  const list = [];
  for (const ch of memoryStore.checkins.values()) {
    if (ch.challenge_id === challengeId) {
      const pFunding = normalizeAddress(ch.wallet_address);
      list.push({
        ...ch,
        profile_wallet: resolveProfileWallet(ch.profile_wallet, pFunding),
      });
    }
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ── Payouts ──────────────────────────────────────────────────────────────────
export async function getPayout(challengeId, walletAddress, payoutType = "stake_return_plus_bonus") {
  const norm = normalizeAddress(walletAddress);
  const lookupAddrs = getAssociatedAddresses(walletAddress);

  if (isFirestoreConnected && dbInstance) {
    try {
      for (const addr of lookupAddrs) {
        const payoutDocId = `${challengeId}_${addr}_${payoutType}`;
        const doc = await dbInstance.collection("nimstreak_payouts").doc(payoutDocId).get();
        if (doc.exists) {
          return doc.data();
        }
      }
      return null;
    } catch (err) {
      console.warn("[firestore:getPayout] error:", err.message);
    }
  }

  for (const addr of lookupAddrs) {
    const payoutDocId = `${challengeId}_${addr}_${payoutType}`;
    const mem = memoryStore.payouts.get(payoutDocId);
    if (mem) return mem;
  }
  return null;
}

export async function getChallengePayouts(challengeId) {
  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("nimstreak_payouts")
        .where("challenge_id", "==", challengeId)
        .get();
      const list = snap.docs.map((d) => d.data());
      return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
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
export async function getUserTransactions(walletAddress) {
  const norm = normalizeAddress(walletAddress);
  const lookupAddrs = getAssociatedAddresses(walletAddress);
  const lookupSet = new Set(lookupAddrs);

  const transactions = [];
  const seenTxIds = new Set();

  if (isFirestoreConnected && dbInstance) {
    try {
      const stakePromises = [];
      for (const addr of lookupAddrs) {
        stakePromises.push(
          dbInstance.collection("challenge_participants").where("wallet_address", "==", addr).get(),
          dbInstance.collection("challenge_participants").where("profile_wallet", "==", addr).get()
        );
      }
      const snaps = await Promise.all(stakePromises);
      for (const snap of snaps) {
        for (const doc of snap.docs) {
          const data = doc.data();
          if (data && data.stake_tx_hash) {
            const txKey = `stake_${data.stake_tx_hash}`;
            if (!seenTxIds.has(txKey)) {
              seenTxIds.add(txKey);
              const chal = await getChallengeById(data.challenge_id);
              transactions.push({
                id: txKey,
                type: "stake",
                challenge_id: data.challenge_id,
                challenge_title: chal ? chal.title : "Challenge Stake",
                amount: Number(chal?.stake_amount || data.stake_amount || 0),
                status: "confirmed",
                tx_hash: data.stake_tx_hash,
                explorer_url: `https://nimiq.watch/#${data.stake_tx_hash}`,
                timestamp: data.joined_at || chal?.created_at || new Date().toISOString(),
                wallet_address: data.wallet_address,
              });
            }
          }
        }
      }

      const payoutPromises = [];
      for (const addr of lookupAddrs) {
        payoutPromises.push(
          dbInstance.collection("nimstreak_payouts").where("wallet_address", "==", addr).get(),
          dbInstance.collection("nimstreak_payouts").where("recipient_address", "==", addr).get()
        );
      }
      const pSnaps = await Promise.all(payoutPromises);
      for (const snap of pSnaps) {
        for (const doc of snap.docs) {
          const py = doc.data();
          if (py) {
            const txKey = py.tx_hash ? `payout_${py.tx_hash}` : `payout_${py.id || doc.id}`;
            if (!seenTxIds.has(txKey)) {
              seenTxIds.add(txKey);
              const chal = await getChallengeById(py.challenge_id);
              let status = "pending";
              if (py.status === "sent") status = "confirmed";
              else if (py.status === "failed") status = "failed";

              transactions.push({
                id: txKey,
                type: py.payout_type === "bonus" ? "bonus" : "payout",
                challenge_id: py.challenge_id,
                challenge_title: chal ? chal.title : "Challenge Payout",
                amount: Number(py.amount_nim || py.total_payout_nim || 0),
                bonus_nim: Number(py.bonus_nim || 0),
                status,
                tx_hash: py.tx_hash || null,
                explorer_url: py.tx_hash ? `https://nimiq.watch/#${py.tx_hash}` : null,
                timestamp: py.created_at || py.paid_at || new Date().toISOString(),
                wallet_address: py.wallet_address || py.recipient_address,
              });
            }
          }
        }
      }

      return transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (err) {
      console.warn("[firestore:getUserTransactions] error:", err.message);
    }
  }

  for (const p of memoryStore.participants.values()) {
    const pFunding = normalizeAddress(p.wallet_address);
    const resolvedProfile = resolveProfileWallet(p.profile_wallet, pFunding);
    if (lookupSet.has(pFunding) || lookupSet.has(resolvedProfile)) {
      if (p.stake_tx_hash) {
        const txKey = `stake_${p.stake_tx_hash}`;
        if (!seenTxIds.has(txKey)) {
          seenTxIds.add(txKey);
          const chal = memoryStore.challenges.get(p.challenge_id);
          transactions.push({
            id: txKey,
            type: "stake",
            challenge_id: p.challenge_id,
            challenge_title: chal ? chal.title : "Challenge Stake",
            amount: Number(chal?.stake_amount || p.stake_amount || 0),
            status: "confirmed",
            tx_hash: p.stake_tx_hash,
            explorer_url: `https://nimiq.watch/#${p.stake_tx_hash}`,
            timestamp: p.joined_at || chal?.created_at || new Date().toISOString(),
            wallet_address: p.wallet_address,
          });
        }
      }
    }
  }

  for (const py of memoryStore.payouts.values()) {
    const pyAddr = normalizeAddress(py.wallet_address || py.recipient_address);
    if (lookupSet.has(pyAddr)) {
      const txKey = py.tx_hash ? `payout_${py.tx_hash}` : `payout_${py.id}`;
      if (!seenTxIds.has(txKey)) {
        seenTxIds.add(txKey);
        const chal = memoryStore.challenges.get(py.challenge_id);
        let status = "pending";
        if (py.status === "sent") status = "confirmed";
        else if (py.status === "failed") status = "failed";

        transactions.push({
          id: txKey,
          type: py.payout_type === "bonus" ? "bonus" : "payout",
          challenge_id: py.challenge_id,
          challenge_title: chal ? chal.title : "Challenge Payout",
          amount: Number(py.amount_nim || py.total_payout_nim || 0),
          bonus_nim: Number(py.bonus_nim || 0),
          status,
          tx_hash: py.tx_hash || null,
          explorer_url: py.tx_hash ? `https://nimiq.watch/#${py.tx_hash}` : null,
          timestamp: py.created_at || py.paid_at || new Date().toISOString(),
          wallet_address: py.wallet_address || py.recipient_address,
        });
      }
    }
  }

  return transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export async function getUserChallenges(walletAddress) {
  const norm = normalizeAddress(walletAddress);
  const lookupAddrs = getAssociatedAddresses(walletAddress);

  if (isFirestoreConnected && dbInstance) {
    try {
      const queryPromises = [];
      for (const addr of lookupAddrs) {
        queryPromises.push(
          dbInstance
            .collection("challenge_participants")
            .where("wallet_address", "==", addr)
            .get(),
          dbInstance
            .collection("challenge_participants")
            .where("profile_wallet", "==", addr)
            .get()
        );
      }

      const snaps = await Promise.all(queryPromises);

      const partsMap = new Map();
      for (const snap of snaps) {
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data && data.challenge_id && !partsMap.has(data.challenge_id)) {
            const resolvedProfile = resolveProfileWallet(data.profile_wallet, data.wallet_address);
            partsMap.set(data.challenge_id, {
              ...data,
              profile_wallet: resolvedProfile,
            });
          }
        });
      }

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

  const lookupSet = new Set(lookupAddrs);
  const partsMap = new Map();
  for (const p of memoryStore.participants.values()) {
    const pFunding = normalizeAddress(p.wallet_address);
    const resolvedProfile = resolveProfileWallet(p.profile_wallet, pFunding);
    if (lookupSet.has(pFunding) || lookupSet.has(resolvedProfile)) {
      if (!partsMap.has(p.challenge_id)) {
        partsMap.set(p.challenge_id, {
          ...p,
          profile_wallet: resolvedProfile,
        });
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
  const lookupAddrs = new Set(getAssociatedAddresses(walletAddress));
  const userCheckins = checkins.filter(
    (c) => lookupAddrs.has(normalizeAddress(c.wallet_address)) || lookupAddrs.has(normalizeAddress(c.profile_wallet))
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
  const now = new Date();
  let endedList = [];

  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance
        .collection("challenges")
        .where("status", "==", "active")
        .get();
      endedList = snap.docs.map((d) => d.data()).filter((c) => isChallengeExpired(c, now));
    } catch (err) {
      console.warn("[firestore:evaluateEndedChallenges] error:", err.message);
    }
  } else {
    endedList = Array.from(memoryStore.challenges.values()).filter(
      (c) => c.status === "active" && isChallengeExpired(c, now)
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


// ── Push Notification & Preference Storage ─────────────────────────────────

export async function savePushSubscription({ walletAddress, endpoint, keys, userAgent = "" }) {
  const norm = normalizeAddress(walletAddress);
  const subId = crypto.createHash("sha256").update(String(endpoint)).digest("hex");
  const subDoc = {
    id: subId,
    wallet_address: norm,
    endpoint,
    keys: keys || {},
    user_agent: userAgent,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isFirestoreConnected && dbInstance) {
    try {
      await dbInstance.collection("push_subscriptions").doc(subId).set(subDoc, { merge: true });
      return subDoc;
    } catch (err) {
      console.warn("[firestore:savePushSubscription] error:", err.message);
    }
  }

  memoryStore.pushSubscriptions.set(endpoint, subDoc);
  return subDoc;
}

export async function getPushSubscriptions(walletAddress) {
  const lookupAddrs = getAssociatedAddresses(walletAddress);
  const lookupSet = new Set(lookupAddrs);
  const subs = [];

  if (isFirestoreConnected && dbInstance) {
    try {
      for (const addr of lookupAddrs) {
        const snap = await dbInstance
          .collection("push_subscriptions")
          .where("wallet_address", "==", addr)
          .get();
        for (const doc of snap.docs) {
          subs.push(doc.data());
        }
      }
      return subs;
    } catch (err) {
      console.warn("[firestore:getPushSubscriptions] error:", err.message);
    }
  }

  for (const sub of memoryStore.pushSubscriptions.values()) {
    if (lookupSet.has(normalizeAddress(sub.wallet_address))) {
      subs.push(sub);
    }
  }
  return subs;
}

export async function removePushSubscription(endpoint) {
  const subId = crypto.createHash("sha256").update(String(endpoint)).digest("hex");
  if (isFirestoreConnected && dbInstance) {
    try {
      await dbInstance.collection("push_subscriptions").doc(subId).delete();
    } catch (err) {
      console.warn("[firestore:removePushSubscription] error:", err.message);
    }
  }
  memoryStore.pushSubscriptions.delete(endpoint);
  return true;
}

export async function getAllPushSubscriptions() {
  if (isFirestoreConnected && dbInstance) {
    try {
      const snap = await dbInstance.collection("push_subscriptions").get();
      return snap.docs.map(d => d.data());
    } catch (err) {
      console.warn("[firestore:getAllPushSubscriptions] error:", err.message);
    }
  }
  return Array.from(memoryStore.pushSubscriptions.values());
}

export const DEFAULT_SERVER_PREFERENCES = {
  dailyReminders: true,
  challengeUpdates: true,
  rewardUpdates: true,
  invitations: true,
  preferredReminderTime: "20:00",
};

export async function getNotificationPreferences(walletAddress) {
  const norm = normalizeAddress(walletAddress);
  if (!norm) return { ...DEFAULT_SERVER_PREFERENCES };

  if (isFirestoreConnected && dbInstance) {
    try {
      const doc = await dbInstance.collection("notification_preferences").doc(norm).get();
      if (doc.exists) {
        return { ...DEFAULT_SERVER_PREFERENCES, ...doc.data() };
      }
    } catch (err) {
      console.warn("[firestore:getNotificationPreferences] error:", err.message);
    }
  }

  const stored = memoryStore.notificationPreferences.get(norm);
  if (stored) return { ...DEFAULT_SERVER_PREFERENCES, ...stored };
  return { ...DEFAULT_SERVER_PREFERENCES };
}

export async function saveNotificationPreferences(walletAddress, prefs) {
  const norm = normalizeAddress(walletAddress);
  if (!norm) return { ...DEFAULT_SERVER_PREFERENCES };

  const merged = { ...DEFAULT_SERVER_PREFERENCES, ...prefs, wallet_address: norm, updated_at: new Date().toISOString() };

  if (isFirestoreConnected && dbInstance) {
    try {
      await dbInstance.collection("notification_preferences").doc(norm).set(merged, { merge: true });
      return merged;
    } catch (err) {
      console.warn("[firestore:saveNotificationPreferences] error:", err.message);
    }
  }

  memoryStore.notificationPreferences.set(norm, merged);
  return merged;
}

export async function isNotificationSent(dedupKey) {
  const keyHash = crypto.createHash("sha256").update(String(dedupKey)).digest("hex");

  if (isFirestoreConnected && dbInstance) {
    try {
      const doc = await dbInstance.collection("push_sent_log").doc(keyHash).get();
      return doc.exists;
    } catch (err) {
      console.warn("[firestore:isNotificationSent] error:", err.message);
    }
  }

  return memoryStore.pushSentLog.has(dedupKey);
}

export async function recordSentNotification({ dedupKey, walletAddress, type, title, body, challengeId = null, txHash = null, timestamp = new Date().toISOString() }) {
  const keyHash = crypto.createHash("sha256").update(String(dedupKey)).digest("hex");
  const record = {
    dedup_key: dedupKey,
    wallet_address: normalizeAddress(walletAddress),
    type,
    title,
    body,
    challenge_id: challengeId,
    tx_hash: txHash,
    sent_at: timestamp,
  };

  if (isFirestoreConnected && dbInstance) {
    try {
      await dbInstance.collection("push_sent_log").doc(keyHash).set(record);
      return record;
    } catch (err) {
      console.warn("[firestore:recordSentNotification] error:", err.message);
    }
  }

  memoryStore.pushSentLog.set(dedupKey, record);
  return record;
}

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
  getUserTransactions,
  getLeaderboard,
  getParticipantCalendar,
  getChallengeLeaderboard,
  evaluateDailyMissedCheckins,
  evaluateEndedChallenges,
  isChallengeExpired,
  isChallengeActive,
  normalizeAddress,
  savePushSubscription,
  getPushSubscriptions,
  removePushSubscription,
  getAllPushSubscriptions,
  getNotificationPreferences,
  saveNotificationPreferences,
  isNotificationSent,
  recordSentNotification,
};
