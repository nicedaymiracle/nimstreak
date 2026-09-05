import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import * as db from "./db.js";
import { initDb, normalizeAddress } from "./db.js";
import {
  sendStreakPayout,
  calculatePayouts,
  isNimiqAddress,
  verifyStakeTransaction,
  getOnChainTransaction,
  nimToLuna,
  lunaToNim,
  LUNA_PER_NIM,
} from "./nimstreak-payout.js";

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const MIN_STAKE_NIM = parseFloat(process.env.MIN_STAKE_NIM || "0.5");
const MAX_STAKE_NIM = parseFloat(process.env.MAX_STAKE_NIM || "100");
const DEFAULT_STAKE_NIM = parseFloat(process.env.DEFAULT_STAKE_NIM || "1.0");
const NIMIQ_TREASURY_ADDRESS = (process.env.NIMIQ_TREASURY_ADDRESS || "NQ68 LS47 5LF6 C7CU MVB6 KL55 YSFG PEXJ ADJ0").trim();

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
  })
);
app.use(express.json());

const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ── Socket.IO Connection ─────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);

  socket.on("join-challenge", (challengeId) => {
    if (challengeId) {
      socket.join(`challenge:${challengeId}`);
      console.log(`[socket] ${socket.id} joined challenge:${challengeId}`);
    }
  });

  socket.on("leave-challenge", (challengeId) => {
    if (challengeId) {
      socket.leave(`challenge:${challengeId}`);
      console.log(`[socket] ${socket.id} left challenge:${challengeId}`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
  });
});

// Helper to broadcast challenge updates
function broadcastChallengeUpdate(challengeId, type, data) {
  io.to(`challenge:${challengeId}`).emit("challenge:event", {
    type,
    challengeId,
    data,
    timestamp: new Date().toISOString(),
  });
  io.emit("global:streak_activity", { type, challengeId, data });
}

// ── Health ──────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "nimstreak-server",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    database: db.getIsFirestoreConnected() ? "firestore" : "in-memory",
  });
});

// ── Global Stats ────────────────────────────────────────────────
app.get("/api/stats/global", async (_req, res) => {
  try {
    const stats = await db.getGlobalStats();
    return res.json(stats);
  } catch (err) {
    console.error("[stats:global] error:", err.message);
    return res.status(500).json({ error: "Failed to load global stats" });
  }
});

// ── Profile ──────────────────────────────────────────────────────
app.get("/api/profile/:walletAddress", async (req, res) => {
  const walletAddress = normalizeAddress(req.params.walletAddress);
  if (!walletAddress) {
    return res.status(400).json({ error: "Wallet address is required" });
  }

  try {
    const profile = await db.getProfile(walletAddress);
    const badges = await db.getBadges(walletAddress);
    const userChals = await db.getUserChallenges(walletAddress);

    return res.json({
      profile,
      badges: badges || [],
      recentChallenges: userChals.all?.slice(0, 10) || [],
    });
  } catch (err) {
    console.warn("[profile] error for", walletAddress, err.message);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// Update profile display name
app.put("/api/profile/:walletAddress", async (req, res) => {
  const walletAddress = normalizeAddress(req.params.walletAddress);
  const { displayName } = req.body;

  if (!displayName || displayName.trim().length < 2) {
    return res.status(400).json({ error: "Display name must be at least 2 characters" });
  }

  const cleanName = displayName.trim().slice(0, 30);
  try {
    await db.updateProfile(walletAddress, { display_name: cleanName });
    return res.json({ success: true, displayName: cleanName });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── Challenges ───────────────────────────────────────────────────

// Create a new challenge (with on-chain stake verification & replay protection)
app.post("/api/challenges", async (req, res) => {
  const {
    walletAddress,
    fundingAddress,
    title,
    description = "",
    category = "fitness",
    type = "public",
    durationDays = 30,
    stakeNim = DEFAULT_STAKE_NIM,
    checkinType = "tap",
    stakeTxHash,
    maxParticipants = 50,
  } = req.body;

  // Validation
  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }
  if (!title || title.trim().length < 3) {
    return res.status(400).json({ error: "Title must be at least 3 characters" });
  }
  if (!stakeTxHash) {
    return res.status(400).json({ error: "stakeTxHash is required. You must stake NIM to create a challenge." });
  }

  const numStake = parseFloat(stakeNim);
  if (isNaN(numStake) || numStake < MIN_STAKE_NIM || numStake > MAX_STAKE_NIM) {
    return res.status(400).json({
      error: `Stake amount must be between ${MIN_STAKE_NIM} and ${MAX_STAKE_NIM} NIM`,
    });
  }

  const numDuration = parseInt(durationDays);
  if (![7, 14, 21, 30, 60, 100].includes(numDuration)) {
    return res.status(400).json({ error: "Duration must be 7, 14, 21, 30, 60, or 100 days" });
  }

  const normalizedCreator = normalizeAddress(walletAddress);
  const cleanTxHash = String(stakeTxHash).trim().toLowerCase();
  const numStakeLuna = nimToLuna(numStake);

  // 1. Check for Duplicate / Replay of stakeTxHash
  const isUsed = await db.checkReplayStakeTxHash(cleanTxHash);
  if (isUsed) {
    return res.status(400).json({
      error: "This stake transaction hash has already been used. Please submit a new stake transaction.",
    });
  }

  // 2. Real on-chain verification of stake transaction
  let onChainTx;
  try {
    onChainTx = await verifyStakeTransaction({
      txHash: cleanTxHash,
      senderAddress: fundingAddress ? normalizeAddress(fundingAddress) : null,
      expectedStakeNim: numStake,
      expectedStakeLuna: numStakeLuna,
      treasuryAddress: NIMIQ_TREASURY_ADDRESS,
    });
  } catch (verifyErr) {
    return res.status(400).json({
      error: `Stake transaction verification failed: ${verifyErr.message}`,
    });
  }

  const verifiedFundingAddress = onChainTx.from;

  // Calculate dates
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + numDuration * 86400000);

  // Generate invite code for group / private challenges
  const inviteCode = type !== "public" ? crypto.randomBytes(3).toString("hex").toUpperCase() : null;

  try {
    const newChallenge = await db.createChallenge(
      {
        title: title.trim(),
        description: description.trim(),
        category: category.toLowerCase(),
        type: type.toLowerCase(),
        duration_days: numDuration,
        stake_nim: numStake,
        stake_luna: numStakeLuna.toString(),
        checkin_type: checkinType.toLowerCase(),
        created_by: normalizedCreator,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        status: "active",
        max_participants: parseInt(maxParticipants) || 50,
        invite_code: inviteCode,
      },
      {
        stake_tx_hash: cleanTxHash,
        wallet_address: verifiedFundingAddress,
        profile_wallet: normalizedCreator,
        stake_amount: numStake,
        stake_luna: numStakeLuna.toString(),
        status: "active",
        current_streak: 0,
        longest_streak: 0,
        total_checkins: 0,
      }
    );

    broadcastChallengeUpdate(newChallenge.id, "created", newChallenge);
    return res.status(201).json(newChallenge);
  } catch (err) {
    console.error("[challenges:create] error:", err.message);
    return res.status(500).json({ error: "Failed to create challenge" });
  }
});

// List challenges (filtered by status, category, type, search)
app.get("/api/challenges", async (req, res) => {
  const { category, status = "active", type, search } = req.query;

  try {
    const list = await db.getChallenges({ category, status, type, search });
    return res.json(list);
  } catch (err) {
    console.error("[challenges:list] error:", err.message);
    return res.status(500).json({ error: "Failed to load challenges" });
  }
});

// Get a single challenge (with payouts list and integer Luna stats)
app.get("/api/challenges/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const challenge = await db.getChallengeById(id);
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    const participants = await db.getChallengeParticipants(id);
    const payouts = await db.getChallengePayouts(id);
    const calculation = calculatePayouts(participants);

    return res.json({
      challenge,
      participants,
      payouts: payouts || [],
      stats: {
        totalPool: calculation.totalPoolNim,
        totalPoolLuna: calculation.totalPoolLuna,
        quitterPool: calculation.quitterPoolNim,
        quitterPoolLuna: calculation.quitterPoolLuna,
        treasuryFee: calculation.treasuryFeeNim,
        activeCount: participants.filter((p) => p.status === "active").length,
        quittersCount: calculation.quitterCount,
        finishersCount: calculation.finisherCount,
      },
    });
  } catch (err) {
    console.error("[challenges:detail] error:", err.message);
    return res.status(500).json({ error: "Failed to fetch challenge details" });
  }
});

// Join a challenge (requires real on-chain stake transaction)
app.post("/api/challenges/:id/join", async (req, res) => {
  const { id } = req.params;
  const { walletAddress, fundingAddress, stakeAmount, stakeTxHash } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }
  if (!stakeTxHash) {
    return res.status(400).json({ error: "stakeTxHash is required. You must stake NIM to join." });
  }

  const cleanTxHash = String(stakeTxHash).trim().toLowerCase();
  const normalizedWallet = normalizeAddress(walletAddress);

  try {
    const challenge = await db.getChallengeById(id);
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }
    if (challenge.status !== "active") {
      return res.status(400).json({ error: "Cannot join an inactive challenge" });
    }

    const existingPart = await db.getParticipant(id, normalizedWallet);
    if (existingPart) {
      return res.status(400).json({ error: "You have already joined this challenge" });
    }

    const participants = await db.getChallengeParticipants(id);
    if (participants.length >= (challenge.max_participants || 50)) {
      return res.status(400).json({ error: "Challenge has reached maximum participants capacity" });
    }

    const isUsed = await db.checkReplayStakeTxHash(cleanTxHash);
    if (isUsed) {
      return res.status(400).json({
        error: "This stake transaction hash has already been used. Please submit a new stake transaction.",
      });
    }

    const finalStake = parseFloat(stakeAmount) || parseFloat(challenge.stake_nim);
    const finalStakeLuna = nimToLuna(finalStake);

    const onChainTx = await verifyStakeTransaction({
      txHash: cleanTxHash,
      senderAddress: fundingAddress ? normalizeAddress(fundingAddress) : null,
      expectedStakeNim: finalStake,
      expectedStakeLuna: finalStakeLuna,
      treasuryAddress: NIMIQ_TREASURY_ADDRESS,
    });

    const verifiedFundingAddress = onChainTx.from;

    const newPart = await db.addParticipant(id, {
      wallet_address: verifiedFundingAddress,
      profile_wallet: normalizedWallet,
      stake_tx_hash: cleanTxHash,
      stake_amount: finalStake,
      stake_luna: finalStakeLuna.toString(),
      status: "active",
      current_streak: 0,
      longest_streak: 0,
      total_checkins: 0,
      joined_at: new Date().toISOString(),
    });

    broadcastChallengeUpdate(id, "participant:joined", newPart);
    return res.status(201).json(newPart);
  } catch (err) {
    console.warn("[challenges:join] error:", err.message);
    return res.status(400).json({ error: err.message || "Failed to join challenge" });
  }
});

// Join via invite code (for private/group challenges)
app.post("/api/challenges/join-by-code", async (req, res) => {
  const { walletAddress, fundingAddress, inviteCode, stakeTxHash, stakeAmount } = req.body;

  if (!walletAddress || !inviteCode) {
    return res.status(400).json({ error: "walletAddress and inviteCode are required" });
  }
  if (!stakeTxHash) {
    return res.status(400).json({ error: "stakeTxHash is required. You must stake NIM to join." });
  }

  const cleanCode = inviteCode.trim().toUpperCase();
  const cleanTxHash = String(stakeTxHash).trim().toLowerCase();
  const normalizedWallet = normalizeAddress(walletAddress);

  try {
    const challenge = await db.getChallengeByInviteCode(cleanCode);
    if (!challenge) {
      return res.status(404).json({ error: "Invalid invite code. Challenge not found." });
    }
    if (challenge.status !== "active") {
      return res.status(400).json({ error: "This challenge is no longer active" });
    }

    const existingPart = await db.getParticipant(challenge.id, normalizedWallet);
    if (existingPart) {
      return res.status(400).json({ error: "You have already joined this challenge", challenge });
    }

    const isUsed = await db.checkReplayStakeTxHash(cleanTxHash);
    if (isUsed) {
      return res.status(400).json({
        error: "This stake transaction hash has already been used. Please submit a new stake transaction.",
      });
    }

    const finalStake = parseFloat(stakeAmount) || parseFloat(challenge.stake_nim);
    const finalStakeLuna = nimToLuna(finalStake);

    const onChainTx = await verifyStakeTransaction({
      txHash: cleanTxHash,
      senderAddress: fundingAddress ? normalizeAddress(fundingAddress) : null,
      expectedStakeNim: finalStake,
      expectedStakeLuna: finalStakeLuna,
      treasuryAddress: NIMIQ_TREASURY_ADDRESS,
    });

    const verifiedFundingAddress = onChainTx.from;

    const newPart = await db.addParticipant(challenge.id, {
      wallet_address: verifiedFundingAddress,
      profile_wallet: normalizedWallet,
      stake_tx_hash: cleanTxHash,
      stake_amount: finalStake,
      stake_luna: finalStakeLuna.toString(),
      status: "active",
      current_streak: 0,
      longest_streak: 0,
      total_checkins: 0,
      joined_at: new Date().toISOString(),
    });

    broadcastChallengeUpdate(challenge.id, "participant:joined", newPart);
    return res.status(200).json({
      message: `🎉 Joined "${challenge.title}"! Keep your streak alive.`,
      challenge,
      participant: newPart,
    });
  } catch (err) {
    console.warn("[challenges:join-by-code] error:", err.message);
    return res.status(400).json({ error: err.message || "Failed to join via invite code" });
  }
});

// Record a daily check-in (Proof submission)
app.post("/api/challenges/:id/checkin", async (req, res) => {
  const { id } = req.params;
  const { walletAddress, proofText = "", proofPhotoUrl = "" } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }

  const normalizedWallet = normalizeAddress(walletAddress);
  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC

  try {
    const challenge = await db.getChallengeById(id);
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }
    if (challenge.status !== "active") {
      return res.status(400).json({ error: "This challenge is no longer active" });
    }

    const participant = await db.getParticipant(id, normalizedWallet);
    if (!participant) {
      return res.status(404).json({ error: "You are not a participant in this challenge" });
    }
    if (participant.status === "failed") {
      return res.status(400).json({ error: "Your stake in this challenge was forfeited." });
    }
    if (participant.status === "completed") {
      return res.status(400).json({ error: "Challenge is already completed!" });
    }

    const participantAddress = participant.wallet_address;
    const profileWallet = participant.profile_wallet || normalizedWallet;

    const alreadyCheckedIn = await db.getCheckin(id, participantAddress, todayStr);
    if (alreadyCheckedIn) {
      return res.status(400).json({ error: "You have already checked in for today! 🔥" });
    }

    // Calculate day number
    const startDate = new Date(challenge.starts_at);
    const now = new Date();
    const diffDays = Math.floor((now - startDate) / 86400000) + 1;
    const dayNumber = Math.max(1, Math.min(diffDays, challenge.duration_days));

    const newStreak = (participant.current_streak || 0) + 1;
    const newLongest = Math.max(newStreak, participant.longest_streak || 0);
    const newTotalCheckins = (participant.total_checkins || 0) + 1;

    const { checkin, earnedBadges } = await db.recordCheckin(
      {
        challenge_id: id,
        wallet_address: participantAddress,
        profile_wallet: profileWallet,
        day_number: dayNumber,
        checkin_date: todayStr,
        proof_text: proofText,
        proof_photo_url: proofPhotoUrl,
      },
      {
        current_streak: newStreak,
        longest_streak: newLongest,
        total_checkins: newTotalCheckins,
      }
    );

    const updatedPart = await db.getParticipant(id, normalizedWallet);
    broadcastChallengeUpdate(id, "checkin:completed", {
      participant: updatedPart,
      checkin,
      earnedBadges,
    });

    return res.json({
      success: true,
      message: `Day ${dayNumber} check-in confirmed! Streak: ${newStreak} days 🔥`,
      checkin,
      participant: updatedPart,
      earnedBadges,
    });
  } catch (err) {
    console.error("[challenges:checkin] error:", err.message);
    return res.status(500).json({ error: "Check-in failed" });
  }
});

// Claim payout / stake return for a completed challenge
app.post("/api/challenges/:id/claim", async (req, res) => {
  const { id } = req.params;
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }

  const normalizedWallet = normalizeAddress(walletAddress);

  try {
    const challenge = await db.getChallengeById(id);
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    const isEnded = challenge.status === "completed" || new Date(challenge.ends_at) <= new Date();
    if (!isEnded) {
      return res.status(400).json({ error: "Challenge is still active and has not completed yet." });
    }

    const participant = await db.getParticipant(id, normalizedWallet);
    if (!participant) {
      return res.status(404).json({ error: "You are not a participant in this challenge." });
    }
    if (participant.status === "failed") {
      return res.status(400).json({ error: "Your stake in this challenge was forfeited due to missed check-ins." });
    }

    const fundingAddress = participant.wallet_address;
    const profileWallet = participant.profile_wallet || normalizedWallet;

    const existingPayout = await db.getPayout(id, fundingAddress, "stake_return_plus_bonus");
    if (existingPayout) {
      if (existingPayout.status === "sent") {
        // Verify whether the payout transaction is truly confirmed on-chain
        const onChainTx = await getOnChainTransaction(existingPayout.tx_hash);
        if (onChainTx) {
          return res.status(400).json({
            error: `Payout of ${existingPayout.amount_nim} NIM has already been claimed on ${new Date(existingPayout.created_at).toLocaleDateString()} (Tx: ${existingPayout.tx_hash}).`,
          });
        }

        // Transaction was not found on-chain (e.g. dropped mempool, invalid network ID).
        // Recover record to failed status so user is not permanently blocked from claiming their rightful reward.
        console.warn(
          `[challenges:claim] Stale unconfirmed payout detected for ${fundingAddress} (tx ${existingPayout.tx_hash} not found on-chain). Recovering record to failed state.`
        );
        await db.recordPayout({
          ...existingPayout,
          status: "failed",
          error: `Previous transaction ${existingPayout.tx_hash} was not confirmed on-chain. Recovered for re-claim.`,
        });

        // Revert profile completed count if prematurely incremented
        const prof = await db.getProfile(profileWallet);
        if (prof && prof.completed_challenges > 0) {
          await db.updateProfile(profileWallet, {
            completed_challenges: Math.max(0, (prof.completed_challenges || 1) - 1),
            total_nim_earned: Math.max(
              0,
              (prof.total_nim_earned || 0) - (Number(existingPayout.bonus_nim || existingPayout.amount_nim) || 0)
            ),
          });
        }
      } else if (existingPayout.status === "pending") {
        const pendingAgeMs = Date.now() - new Date(existingPayout.created_at || Date.now()).getTime();
        if (pendingAgeMs < 30000) {
          return res.status(400).json({
            error: "A payout claim for this challenge is currently being processed. Please wait a moment.",
          });
        }
      }
    }

    const allParticipants = await db.getChallengeParticipants(id);
    const calculation = calculatePayouts(allParticipants);
    const myPayout = calculation.payouts.find((p) => p.wallet_address === fundingAddress);

    if (!myPayout || BigInt(myPayout.total_luna) <= 0n) {
      return res.status(400).json({ error: "No eligible payout found for this address." });
    }

    // Reserve pending payout record to prevent double claiming
    await db.recordPayout({
      challenge_id: id,
      wallet_address: fundingAddress,
      amount_nim: myPayout.total_nim,
      amount_luna: myPayout.total_luna,
      payout_type: myPayout.payout_type,
      bonus_nim: myPayout.bonus_nim,
      status: "pending",
    });

    // Sign, broadcast, and verify on-chain confirmation from treasury directly to funding address
    let payoutTx;
    try {
      payoutTx = await sendStreakPayout({
        to: fundingAddress,
        amountNim: myPayout.total_nim,
        amountLuna: myPayout.total_luna,
        payoutType: myPayout.payout_type,
      });
    } catch (payoutErr) {
      console.error(`[challenges:claim] Payout transaction failed for ${fundingAddress}:`, payoutErr.message);
      // Mark as failed in DB so it doesn't leave the record pending or sent
      await db.recordPayout({
        challenge_id: id,
        wallet_address: fundingAddress,
        amount_nim: myPayout.total_nim,
        amount_luna: myPayout.total_luna,
        payout_type: myPayout.payout_type,
        bonus_nim: myPayout.bonus_nim,
        status: "failed",
        error: payoutErr.message,
      });
      return res.status(400).json({
        error: `Payout execution failed: ${payoutErr.message}`,
      });
    }

    // Update payout record to sent ONLY after verified on-chain confirmation
    await db.recordPayout({
      challenge_id: id,
      wallet_address: fundingAddress,
      amount_nim: myPayout.total_nim,
      amount_luna: myPayout.total_luna,
      payout_type: myPayout.payout_type,
      bonus_nim: myPayout.bonus_nim,
      tx_hash: payoutTx.txHash,
      status: "sent",
    });

    // Credit profile stats to stable profile identity
    const prof = await db.getProfile(profileWallet);
    if (prof) {
      await db.updateProfile(profileWallet, {
        completed_challenges: (prof.completed_challenges || 0) + 1,
        total_nim_earned: (prof.total_nim_earned || 0) + (Number(myPayout.bonus_nim || myPayout.total_nim) || 0),
      });
    }

    broadcastChallengeUpdate(id, "payout:claimed", {
      walletAddress: normalizedWallet,
      fundingAddress,
      amountNim: myPayout.total_nim,
      amountLuna: myPayout.total_luna,
      txHash: payoutTx.txHash,
    });

    return res.json({
      success: true,
      message: `🎉 Successfully claimed ${myPayout.total_nim} NIM!`,
      txHash: payoutTx.txHash,
      amountNim: myPayout.total_nim,
      amountLuna: myPayout.total_luna,
      breakdown: {
        principalNim: myPayout.principal_nim,
        bonusNim: myPayout.bonus_nim,
        payoutType: myPayout.payout_type,
      },
    });
  } catch (err) {
    console.error("[challenges:claim] error:", err.message);
    return res.status(400).json({ error: err.message || "Failed to claim reward" });
  }
});

// Get check-in calendar for a participant
app.get("/api/challenges/:id/calendar/:walletAddress", async (req, res) => {
  const { id, walletAddress } = req.params;
  try {
    const calendar = await db.getParticipantCalendar(id, walletAddress);
    if (!calendar) {
      return res.status(404).json({ error: "Challenge not found" });
    }
    return res.json(calendar);
  } catch (err) {
    return res.status(500).json({ error: "Failed to generate calendar" });
  }
});

// Get challenge check-in history
app.get("/api/challenges/:id/history", async (req, res) => {
  const { id } = req.params;
  try {
    const checkins = await db.getChallengeCheckins(id);
    return res.json(checkins);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch challenge history" });
  }
});

// Get leaderboard for a single challenge
app.get("/api/challenges/:id/leaderboard", async (req, res) => {
  const { id } = req.params;
  try {
    const leaderboard = await db.getChallengeLeaderboard(id);
    return res.json(leaderboard);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch challenge leaderboard" });
  }
});

// Global leaderboard
app.get("/api/leaderboard", async (req, res) => {
  try {
    const leaderboard = await db.getLeaderboard(50);
    return res.json(leaderboard);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Get user's active & past challenges
app.get("/api/my-challenges/:walletAddress", async (req, res) => {
  const walletAddress = normalizeAddress(req.params.walletAddress);
  try {
    const result = await db.getUserChallenges(walletAddress);
    return res.json({
      all: result.all || [],
      active: result.active || [],
      completed: result.completed || [],
      failed: result.failed || [],
      summary: {
        totalJoined: result.all?.length || 0,
        activeCount: result.active?.length || 0,
        completedCount: result.completed?.length || 0,
        failedCount: result.failed?.length || 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch user challenges" });
  }
});

// Get badges for user
app.get("/api/badges/:walletAddress", async (req, res) => {
  const walletAddress = normalizeAddress(req.params.walletAddress);
  try {
    const badges = await db.getBadges(walletAddress);
    return res.json(badges);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// ── Daily Cron Routine ───────────────────────────────────────────
// Checks missed check-ins and completes ended challenges
export async function runDailyCronEvaluation() {
  console.log(`[cron] Running daily NimStreak streak & payout check at ${new Date().toISOString()}`);

  try {
    // 1. Mark missed participants as failed
    const quitters = await db.evaluateDailyMissedCheckins();
    for (const quitter of quitters) {
      console.log(`[cron:failed] Participant ${quitter.wallet_address} missed check-in on ${quitter.title}. Stake forfeit.`);
      broadcastChallengeUpdate(quitter.challenge_id, "stake:lost", {
        walletAddress: quitter.wallet_address,
        stakeAmount: quitter.stake_amount,
      });
    }

    // 2. Complete ended challenges
    const endedResults = await db.evaluateEndedChallenges();
    for (const item of endedResults) {
      console.log(`[cron:complete] Challenge "${item.challenge.title}" (${item.challenge.id}) has finished.`);
      const payoutResult = calculatePayouts(item.participants);

      broadcastChallengeUpdate(item.challenge.id, "challenge:completed", {
        payouts: payoutResult.payouts,
        quitterPool: payoutResult.quitterPoolNim,
      });
    }
  } catch (err) {
    console.error("[cron:error]", err.message);
  }
}

// Run cron every 6 hours and on startup after 5 seconds
setInterval(runDailyCronEvaluation, 6 * 3600 * 1000);
setTimeout(runDailyCronEvaluation, 5000);

// ── Start Server ─────────────────────────────────────────────────
async function bootstrap() {
  await initDb();

  server.listen(PORT, () => {
    console.log(`🚀 NimStreak server listening on port ${PORT}`);
    console.log(`📡 WebSocket server initialized`);
  });
}

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

export { app, server };
