import React, { useEffect, useRef, useState } from "react";
import { CategoryBadge } from "../ui/streak-stickers.jsx";
import { WorkedExampleCard } from "../ui/worked-example-card.jsx";
import {
  Users,
  User,
  Globe,
  Trophy,
  XCircle,
  CheckCircle2,
  Share2,
  Flame,
  Coins,
  ShieldCheck,
  Zap,
  Medal,
  Sparkles,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { NimiqIdenticon } from "../ui/avatar-circle.jsx";
import { shortenWalletAddress, shortenHash } from "../../utils/ui-helpers.js";
import {
  animateCheckin,
  animateCalendar,
  animateChallengeComplete,
} from "../../utils/streak-animations.js";

export function ChallengeDetailScreen({
  challengeId,
  walletAddress,
  onConnectWallet,
  onCheckin,
  onJoinChallenge,
  onClaim,
  onRepeatChallenge,
  onBack,
  apiBaseUrl,
  socket,
}) {
  const [challengeData, setChallengeData] = useState(null);
  const [calendarData, setCalendarData] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [proofText, setProofText] = useState("");
  const [proofPhotoUrl, setProofPhotoUrl] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState("");
  const [checkinError, setCheckinError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);

  const checkinBtnRef = useRef(null);
  const streakNumRef = useRef(null);
  const calendarGridRef = useRef(null);
  const cardRef = useRef(null);
  const bonusRef = useRef(null);

  const cleanWallet = (walletAddress || "").replace(/\s+/g, "").toUpperCase();

  // Fetch full challenge data & participant calendar
  const loadDetails = async () => {
    try {
      setLoading(true);
      const [cRes, lRes] = await Promise.all([
        fetch(`${apiBaseUrl}/challenges/${challengeId}`),
        fetch(`${apiBaseUrl}/challenges/${challengeId}/leaderboard`),
      ]);

      if (!cRes.ok) throw new Error("Could not load challenge");
      const cData = await cRes.json();
      setChallengeData(cData);

      if (lRes.ok) {
        const lData = await lRes.json();
        setLeaderboard(lData);
      }

      if (cleanWallet) {
        const calRes = await fetch(`${apiBaseUrl}/challenges/${challengeId}/calendar/${cleanWallet}`);
        if (calRes.ok) {
          const calJson = await calRes.json();
          setCalendarData(calJson.calendar || []);
        }
      }
    } catch (err) {
      setError(err.message || "Failed to load challenge details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [challengeId, cleanWallet]);

  // Calendar animation on render
  useEffect(() => {
    if (calendarGridRef.current && calendarData.length > 0) {
      const dayElements = calendarGridRef.current.querySelectorAll(".cal-day-cell");
      animateCalendar(dayElements);
    }
  }, [calendarData]);

  // Socket listener for real-time check-in updates
  useEffect(() => {
    if (!socket || !challengeId) return;

    socket.emit("join-challenge", challengeId);

    const handleChallengeEvent = (event) => {
      if (
        event.type === "checkin:completed" ||
        event.type === "participant:joined" ||
        event.type === "payout:claimed"
      ) {
        loadDetails();
      } else if (event.type === "challenge:completed") {
        if (cardRef.current && bonusRef.current) {
          animateChallengeComplete(cardRef.current, bonusRef.current);
        }
        loadDetails();
      }
    };

    socket.on("challenge:event", handleChallengeEvent);

    return () => {
      socket.emit("leave-challenge", challengeId);
      socket.off("challenge:event", handleChallengeEvent);
    };
  }, [socket, challengeId]);

  const participant = challengeData?.participants?.find(
    (p) =>
      (p.wallet_address || "").replace(/\s+/g, "").toUpperCase() === cleanWallet ||
      (p.profile_wallet || "").replace(/\s+/g, "").toUpperCase() === cleanWallet
  );

  const isParticipant = Boolean(participant);
  const isFailed = participant?.status === "failed";
  const isChallengeEnded =
    challengeData?.challenge?.status === "completed" ||
    (challengeData?.challenge?.ends_at && new Date(challengeData.challenge.ends_at) <= new Date());
  const isCompleted = participant?.status === "completed" || (isChallengeEnded && !isFailed && isParticipant);

  // Check if payout has already been made
  const payoutRecord = challengeData?.payouts?.find((p) => {
    const pAddr = (p.wallet_address || "").replace(/\s+/g, "").toUpperCase();
    const partAddr = (participant?.wallet_address || "").replace(/\s+/g, "").toUpperCase();
    return pAddr === cleanWallet || (partAddr && pAddr === partAddr);
  });
  const hasClaimed = Boolean(payoutRecord && payoutRecord.status === "sent");

  const todayStr = new Date().toISOString().split("T")[0];
  const todayEntry = calendarData.find((c) => c.date === todayStr);
  const isCheckedInToday = todayEntry ? todayEntry.checkedIn : false;

  // Handle daily check-in
  const handleDailyCheckin = async () => {
    if (!walletAddress) {
      if (typeof onConnectWallet === "function") onConnectWallet();
      return;
    }

    if (isCheckedInToday || isFailed || isCompleted) return;

    // Trigger GSAP fire animation
    if (checkinBtnRef.current && streakNumRef.current) {
      animateCheckin(checkinBtnRef.current, streakNumRef.current);
    }

    setCheckingIn(true);
    setCheckinSuccess("");
    setCheckinError("");

    try {
      const res = await onCheckin(challengeId, {
        proofText,
        proofPhotoUrl,
      });
      setCheckinSuccess(res?.message || "Daily check-in locked in! Your streak is safe. 🔥");
      setProofText("");
      setProofPhotoUrl("");
      await loadDetails();
    } catch (err) {
      setCheckinError(err?.message || "Check-in failed. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleJoin = async () => {
    if (!walletAddress) {
      if (typeof onConnectWallet === "function") onConnectWallet();
      return;
    }
    try {
      await onJoinChallenge(challengeId, challengeData.challenge.stake_nim);
      await loadDetails();
    } catch (err) {
      setError(err?.message || "Failed to join");
    }
  };

  const handleClaimPayout = async () => {
    if (!walletAddress) {
      if (typeof onConnectWallet === "function") onConnectWallet();
      return;
    }
    setClaiming(true);
    setClaimMessage("");
    try {
      if (typeof onClaim === "function") {
        const res = await onClaim(challengeId);
        setClaimMessage(`🎉 Payout sent! Tx: ${shortenHash(res?.txHash)}`);
      }
      await loadDetails();
    } catch (err) {
      setClaimMessage(err?.message || "Failed to claim reward");
    } finally {
      setClaiming(false);
    }
  };

  const [shareFeedback, setShareFeedback] = useState("");

  const handleShareChallenge = async () => {
    const inviteCode = challengeData?.challenge?.invite_code;
    const shareUrl = `${window.location.origin}/?challenge=${encodeURIComponent(challengeId)}${
      inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : ""
    }`;
    const cleanMessage = `🔥 Join my NimStreak challenge: ${challengeData?.challenge?.title || "Habit"}
🎯 Stake: ${challengeData?.challenge?.stake_nim || 5} NIM
⏱️ Duration: ${challengeData?.challenge?.duration_days || 7} Days
Join here: ${shareUrl}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `NimStreak: ${challengeData?.challenge?.title || "Habit"}`,
          text: cleanMessage,
          url: shareUrl,
        });
        setShareFeedback("Shared successfully! 🚀");
        setTimeout(() => setShareFeedback(""), 3000);
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
        console.debug("Web Share fallback notice:", err);
      }
    }

    try {
      await navigator.clipboard.writeText(cleanMessage);
      setShareFeedback("Challenge invite copied! 📋");
      setTimeout(() => setShareFeedback(""), 3000);
    } catch (clipErr) {
      console.warn("Could not copy link:", clipErr);
    }
  };

  const copyInvite = () => {
    if (challengeData?.challenge?.invite_code) {
      navigator.clipboard.writeText(challengeData.challenge.invite_code);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="screen-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading challenge details...</p>
        </div>
      </div>
    );
  }

  if (error || !challengeData) {
    return (
      <div className="screen-container">
        <button type="button" className="back-btn" onClick={onBack} aria-label="Go back">
          ← Back
        </button>
        <div className="form-banner form-banner--error">{error || "Challenge not found"}</div>
      </div>
    );
  }

  const { challenge, stats } = challengeData;
  const currentStreak = participant?.current_streak || 0;
  const duration = challenge.duration_days || 30;
  const progressPercent = Math.min(100, Math.round((currentStreak / duration) * 100));
  const cleanWalletUpper = (cleanWallet || "").toUpperCase();
  const calculatedEntry = challengeData?.calculatedPayouts?.find((p) => {
    const pAddr = (p.wallet_address || "").replace(/\s+/g, "").toUpperCase();
    const partAddr = (participant?.wallet_address || "").replace(/\s+/g, "").toUpperCase();
    return (cleanWalletUpper && pAddr === cleanWalletUpper) || (partAddr && pAddr === partAddr);
  });

  const userStakeNim = calculatedEntry?.stake_return_nim !== undefined
    ? parseFloat(calculatedEntry.stake_return_nim)
    : parseFloat(participant?.stake_amount || challenge.stake_nim || 0);

  const forfeitedRewardNim = calculatedEntry?.forfeited_reward_nim !== undefined
    ? parseFloat(calculatedEntry.forfeited_reward_nim)
    : stats?.estimatedForfeitedRewardPerFinisher !== undefined
    ? parseFloat(stats.estimatedForfeitedRewardPerFinisher)
    : 0;

  const nimStreakBonusNim = calculatedEntry?.nimstreak_bonus_nim !== undefined
    ? parseFloat(calculatedEntry.nimstreak_bonus_nim)
    : Math.min(userStakeNim * 0.5, 5);

  const estimatedTotalPayout = calculatedEntry?.total_nim !== undefined
    ? parseFloat(calculatedEntry.total_nim).toFixed(2)
    : (userStakeNim + forfeitedRewardNim + nimStreakBonusNim).toFixed(2);

  return (
    <div className="screen-container challenge-detail-screen" ref={cardRef}>
      {/* Top Header Bar */}
      <header className="page-header page-header--with-back">
        <button type="button" className="back-btn" onClick={onBack} aria-label="Go back to challenges">
          ← Back
        </button>
        <div className="challenge-detail-tags">
          <CategoryBadge category={challenge.category} />
          <span className="challenge-mode-badge">
            {challenge.type === "group" ? <><Users size={12} className="inline-icon" /> Group</> : challenge.type === "solo" ? <><User size={12} className="inline-icon" /> Solo</> : <><Globe size={12} className="inline-icon" /> Public</>}
          </span>
        </div>
      </header>

      {/* Main Challenge Hero Banner */}
      <section className="detail-hero">
        <div className="detail-hero__top">
          <h1 className="detail-title">{challenge.title}</h1>
          <div className="detail-participant-status">
            {isParticipant ? (
              hasClaimed ? (
                <span className="status-pill status-pill--paid"><Coins size={13} className="inline-icon" /> Reward Paid & Confirmed</span>
              ) : payoutRecord?.status === "verifying" ? (
                <span className="status-pill status-pill--processing"><RefreshCw size={13} className="inline-icon animate-spin" /> Payout Verifying</span>
              ) : payoutRecord?.status === "failed" ? (
                <span className="status-pill status-pill--forfeited"><AlertTriangle size={13} className="inline-icon" /> Payout Retry Needed</span>
              ) : isCompleted ? (
                <span className="status-pill status-pill--won"><Trophy size={13} className="inline-icon" /> Finished & Won</span>
              ) : isFailed ? (
                <span className="status-pill status-pill--forfeited"><XCircle size={13} className="inline-icon" /> Stake Forfeited</span>
              ) : isCheckedInToday ? (
                <span className="status-pill status-pill--secured"><CheckCircle2 size={13} className="inline-icon" /> Checked in today</span>
              ) : (
                <span className="status-pill status-pill--pending">⏳ Check-in needed today</span>
              )
            ) : isChallengeEnded ? (
              <span className="status-pill status-pill--neutral">Challenge Ended</span>
            ) : (
              <span className="status-pill status-pill--open"><ShieldCheck size={13} className="inline-icon" /> Registration Open</span>
            )}
          </div>
        </div>

        {challenge.description && <p className="detail-desc">{challenge.description}</p>}

        {/* Grow your streak / Invite friends */}
        <div className="share-challenge-card">
          <div className="share-challenge-info">
            <span className="share-challenge-title">Grow your streak</span>
            <span className="share-challenge-sub">Invite friends to join this challenge.</span>
          </div>
          <div className="share-actions-row">
            <button
              type="button"
              className="btn btn--secondary share-btn"
              onClick={handleShareChallenge}
              title="Share challenge invitation link"
            >
              <Share2 size={14} className="inline-icon" /> Share Challenge
            </button>
            {challenge.invite_code && (
              <div className="share-invite-code-row">
                <span className="share-code-text">Invite code: <strong>{challenge.invite_code}</strong></span>
                <button
                  type="button"
                  className="share-copy-code-btn"
                  onClick={copyInvite}
                  title="Copy invite code"
                >
                  {copiedInvite ? "Copied! ✅" : "Copy"}
                </button>
              </div>
            )}
          </div>
          {shareFeedback && (
            <div className="share-feedback-pill">{shareFeedback}</div>
          )}
        </div>

        {/* 4 Prominent Stat Boxes Grid */}
        <div className="detail-stat-row">
          <div className="d-box">
            <span className="d-box__val" ref={streakNumRef}>
              <Flame size={16} className="text-gold inline-icon" /> {currentStreak}
            </span>
            <span className="d-box__lbl">Current Streak</span>
          </div>

          <div className="d-box">
            <span className="d-box__val">
              Day {Math.min(currentStreak, duration)}/{duration}
            </span>
            <span className="d-box__lbl">Duration</span>
          </div>

          <div className="d-box">
            <span className="d-box__val">{participant?.stake_amount || challenge.stake_nim} NIM</span>
            <span className="d-box__lbl">Your Stake</span>
          </div>

          <div className="d-box">
            <span className="d-box__val" ref={bonusRef}>
              <Coins size={16} className="text-gold inline-icon" /> {stats?.totalPool || 0} NIM
            </span>
            <span className="d-box__lbl">Forfeited Pool</span>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="streak-progress-wrap">
          <div className="streak-progress-header">
            <span>Day {Math.min(currentStreak, duration)} of {duration}</span>
            <span>{progressPercent}% Complete</span>
          </div>
          <div className="streak-progress-bar">
            <div
              className="streak-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* COMPLETED CHALLENGE RESULTS & WINNER REWARD SECTION */}
      {(isCompleted || isChallengeEnded) && (
        <section className="claim-reward-card challenge-results-section">
          <div className="claim-reward-card__icon"><Trophy size={32} className="text-gold" /></div>
          <h3 className="claim-reward-card__title">
            {isCompleted ? "Challenge Complete! Streak Won!" : "Challenge Results"}
          </h3>
          <p className="claim-reward-card__desc">
            {isCompleted
              ? `You stayed consistent through all ${duration} days. Reclaim your stake plus your share of forfeited stakes and streak bonuses!`
              : `This ${duration}-day challenge has ended. Review the final participant results below.`}
          </p>

          {/* Comprehensive Results Breakdown */}
          <div className="challenge-results-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "0.6rem",
            margin: "1rem 0",
            textAlign: "center",
          }}>
            <div className="result-metric-card" style={{ padding: "0.75rem", borderRadius: "0.75rem", background: "var(--navy-surface)", border: "1px solid var(--navy-border)" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Participants</span>
              <strong style={{ fontSize: "1.1rem", color: "#fff" }}>{stats?.totalParticipants || challengeData.participants?.length || 0}</strong>
            </div>
            <div className="result-metric-card" style={{ padding: "0.75rem", borderRadius: "0.75rem", background: "var(--navy-surface)", border: "1px solid var(--navy-border)" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Finishers</span>
              <strong style={{ fontSize: "1.1rem", color: "#4ade80" }}>{stats?.finishers || (challengeData.participants?.filter(p => p.status === 'completed')?.length) || 0}</strong>
            </div>
            <div className="result-metric-card" style={{ padding: "0.75rem", borderRadius: "0.75rem", background: "var(--navy-surface)", border: "1px solid var(--navy-border)" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Forfeited</span>
              <strong style={{ fontSize: "1.1rem", color: "#f87171" }}>{stats?.forfeitedParticipants || (challengeData.participants?.filter(p => p.status === 'failed')?.length) || 0}</strong>
            </div>
            {isParticipant && (
              <div className="result-metric-card" style={{ padding: "0.75rem", borderRadius: "0.75rem", background: "var(--navy-surface)", border: "1px solid var(--navy-border)" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Days Completed</span>
                <strong style={{ fontSize: "1.1rem", color: "var(--gold)" }}>{Math.min(currentStreak, duration)}/{duration}</strong>
              </div>
            )}
          </div>

          {/* Reward Breakdown (Only if finisher) */}
          {isParticipant && !isFailed && isCompleted && (
            <div className="payout-preview-card" style={{ marginTop: "1rem", marginBottom: "1.25rem", textAlign: "left" }}>
              <div className="payout-preview-card__header">
                <span>🪙</span>
                <span>Your Payout Breakdown</span>
              </div>
              <div className="preview-row">
                <span style={{ color: "var(--ink-muted)" }}>Original Stake Return</span>
                <span style={{ fontWeight: 600 }}>{userStakeNim.toFixed(2)} NIM</span>
              </div>
              <div className="preview-row">
                <span style={{ color: "var(--ink-muted)" }}>Forfeited Pool Reward</span>
                <span style={{ fontWeight: 600, color: "var(--gold-primary)" }}>+{forfeitedRewardNim.toFixed(2)} NIM</span>
              </div>
              <div className="preview-row">
                <span style={{ color: "var(--ink-muted)" }}>
                  NimStreak Bonus {stats?.isBonusScaled ? "(scaled to challenge budget)" : "(50% max 5 NIM)"}
                </span>
                <span style={{ fontWeight: 600, color: "#22c55e" }}>+{nimStreakBonusNim.toFixed(2)} NIM</span>
              </div>
              <div className="preview-divider" />
              <div className="preview-row preview-row--total">
                <span>Total Payout</span>
                <span style={{ color: "var(--gold-primary)", fontSize: "1.05rem" }}>{estimatedTotalPayout} NIM</span>
              </div>
            </div>
          )}

          {/* Claim and Payout Status */}
          {isParticipant && !isFailed && isCompleted && (
            hasClaimed ? (
              <div className="claim-reward-claimed-banner" style={{ marginBottom: "1rem" }}>
                <div>✅ <strong>Reward Confirmed & Paid ({payoutRecord.amount_nim} NIM)</strong></div>
                {payoutRecord.tx_hash && (
                  <div className="claim-reward-tx-link">
                    <a
                      href={`https://nimiq.watch/#${payoutRecord.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <span>View on Nimiq Watch ({shortenHash(payoutRecord.tx_hash)})</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            ) : payoutRecord?.status === "verifying" ? (
              <div className="claim-reward-verifying-banner" style={{
                padding: "0.85rem",
                borderRadius: "0.75rem",
                background: "rgba(234, 179, 8, 0.1)",
                border: "1px solid rgba(234, 179, 8, 0.3)",
                color: "var(--gold)",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}>
                <RefreshCw size={18} className="animate-spin text-gold" />
                <div>
                  <strong>Payout Verification in Progress:</strong> Your reward transaction is confirming on the Nimiq blockchain.
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: "1rem" }}>
                <button
                  type="button"
                  className="btn btn--gold-glow btn--lg btn--full btn--hero-checkin"
                  onClick={handleClaimPayout}
                  disabled={claiming}
                >
                  {claiming ? "Signing Treasury Payout..." : <><Coins size={16} className="inline-icon" /> CLAIM {estimatedTotalPayout} NIM</>}
                </button>
                {claimMessage && (
                  <p className="claim-reward-msg">{claimMessage}</p>
                )}
              </div>
            )
          )}

          {/* Repeat Challenge Action */}
          {onRepeatChallenge && (
            <div className="repeat-challenge-action" style={{
              marginTop: "1.25rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--navy-border)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.5rem",
            }}>
              <button
                type="button"
                className="btn btn--secondary btn--full"
                onClick={() => onRepeatChallenge({
                  title: challenge.title,
                  description: challenge.description,
                  category: challenge.category,
                  duration: duration,
                  stake_nim: challenge.stake_nim,
                  type: challenge.type,
                })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  borderColor: "rgba(234, 179, 8, 0.4)",
                  color: "var(--gold)",
                }}
              >
                <RotateCcw size={16} /> Repeat Challenge
              </button>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Pre-fills title, duration & stake. You review and authorize the new challenge yourself.
              </span>
            </div>
          )}
        </section>
      )}

      {/* Daily Check-In Action Section (Primary Habit Loop) */}
      {isParticipant && !isFailed && !isCompleted && (
        <section className="checkin-action-card">
          <div className="checkin-action-card__header">
            <div>
              <h3 className="checkin-action-card__title">Daily Check-In</h3>
              <p className="checkin-action-card__subtitle">
                {isCheckedInToday
                  ? "Your streak and stake are secured for today."
                  : "Check in once every 24 hours to protect your stake."}
              </p>
            </div>
            <span className="checkin-type-tag">Proof: {challenge.checkin_type || "None"}</span>
          </div>

          {challenge.checkin_type === "text" && !isCheckedInToday && (
            <div className="checkin-proof-input-group">
              <label htmlFor="proof-text-input" className="checkin-proof-label">
                Daily Log / Progress Note
              </label>
              <textarea
                id="proof-text-input"
                className="form-textarea"
                placeholder="Log today's workout, progress or notes..."
                value={proofText}
                onChange={(e) => setProofText(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {challenge.checkin_type === "photo" && !isCheckedInToday && (
            <div className="checkin-proof-input-group">
              <label htmlFor="proof-photo-input" className="checkin-proof-label">
                Proof Photo URL
              </label>
              <input
                id="proof-photo-input"
                type="url"
                className="form-input"
                placeholder="Paste photo / proof URL (e.g. imgur, screenshot)"
                value={proofPhotoUrl}
                onChange={(e) => setProofPhotoUrl(e.target.value)}
              />
            </div>
          )}

          {/* Action CTA Button */}
          {isCheckedInToday ? (
            <button
              type="button"
              className="btn btn--checked-in btn--full"
              disabled
            >
              ✓ Checked in today
            </button>
          ) : (
            <button
              ref={checkinBtnRef}
              type="button"
              className="btn btn--gold-glow btn--lg btn--full btn--hero-checkin"
              onClick={handleDailyCheckin}
              disabled={checkingIn}
            >
              {checkingIn ? "Locking in check-in..." : <><Flame size={16} className="inline-icon" /> Check in today</>}
            </button>
          )}

          {/* Success Feedback */}
          {checkinSuccess && (
            <div className="detail-feedback-banner detail-feedback-banner--success">
              ✓ {checkinSuccess}
            </div>
          )}

          {/* Error Feedback with Retry */}
          {checkinError && (
            <div className="detail-feedback-banner detail-feedback-banner--error">
              <span>⚠️ {checkinError}</span>
              <button
                type="button"
                className="detail-feedback-retry-btn"
                onClick={handleDailyCheckin}
                disabled={checkingIn}
              >
                Retry
              </button>
            </div>
          )}
        </section>
      )}

      {/* If User is NOT a participant yet */}
      {!isParticipant && (
        <section className="join-cta-card">
          <div className="join-cta-card__content">
            <h3>Ready to take on this challenge?</h3>
            <p>
              Stake <strong>{challenge.stake_nim} NIM</strong> to join. Complete all {duration} days
              to get your stake back.
            </p>
          </div>

          <div className="payment-approval-guidance" style={{ marginTop: "0.85rem", marginBottom: "0.85rem" }}>
            <div className="payment-guidance-step">
              <ShieldCheck size={18} className="text-gold flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="guidance-title">Payment Authorization via Nimiq Pay</div>
                <p className="guidance-desc">
                  Nimiq Pay will open to securely authorize your {challenge.stake_nim} NIM stake. Your NimStreak profile remains connected, while Nimiq Pay handles transaction approval and determines the wallet account used. You will join the challenge once verified on-chain.
                </p>
              </div>
            </div>
          </div>

          {!walletAddress ? (
            <button
              type="button"
              className="btn btn--gold-glow btn--lg btn--full btn--hero-checkin"
              onClick={onConnectWallet}
            >
              Connect Nimiq Pay to Stake & Join
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--gold-glow btn--lg btn--full btn--hero-checkin"
              onClick={handleJoin}
            >
              Stake {challenge.stake_nim} NIM & Join Challenge
            </button>
          )}
        </section>
      )}

      {/* If User Failed */}
      {isFailed && (
        <section className="forfeit-banner">
          <span className="forfeit-banner__icon"><XCircle size={28} className="text-rose" /></span>
          <div className="forfeit-banner__text">
            <h3>Stake Forfeited</h3>
            <p>
              A daily check-in was missed. Your {participant?.stake_amount || challenge.stake_nim} NIM stake
              has been transferred to the finishers prize pool. Start a new challenge to get back on track!
            </p>
          </div>
        </section>
      )}

      {/* Accountability & Financial Mechanics Card */}
      <section className="mechanics-info-card">
        <h3 className="mechanics-info-card__title">Stakes & Rewards Structure</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Complete your challenge and get your original stake back. If other participants quit, their forfeited stakes form a reward pool shared equally among successful finishers.
        </p>

        <div className="mechanics-info-grid">
          <div className="mechanics-info-item">
            <span className="mechanics-info-item__icon"><ShieldCheck size={20} className="text-emerald" /></span>
            <div>
              <strong>100% Stake Protection</strong>
              <p>Check in once every 24 hours. Complete your streak to reclaim 100% of your original stake.</p>
            </div>
          </div>
          <div className="mechanics-info-item">
            <span className="mechanics-info-item__icon"><Trophy size={20} className="text-gold" /></span>
            <div>
              <strong>100% Forfeited Pool Share</strong>
              <p>
                Eligible finishers receive 100% of forfeited stakes with zero treasury fee deductions.
              </p>
            </div>
          </div>
          <div className="mechanics-info-item">
            <span className="mechanics-info-item__icon"><Zap size={20} className="text-gold" /></span>
            <div>
              <strong>NimStreak Bonus</strong>
              <p>
                NimStreak may provide a separate bonus based on existing rules (up to 50% of original stake, max 5 NIM per finisher, challenge-level max of 20 NIM), scaled proportionally when required.
              </p>
            </div>
          </div>
        </div>

        {/* Expandable Worked Example Breakdown */}
        <WorkedExampleCard
          isCollapsible={true}
          defaultExpanded={false}
          showBonusNote={false}
        />
      </section>

      {/* Streak Calendar Heatmap */}
      {calendarData.length > 0 && (
        <section className="calendar-section">
          <div className="calendar-section__header">
            <div>
              <h2>Streak Calendar</h2>
              <p className="calendar-section__subtitle">Daily habit consistency timeline</p>
            </div>
            <div className="calendar-legend">
              <span className="legend-item">
                <span className="legend-box legend-box--done"></span> Done
              </span>
              <span className="legend-item">
                <span className="legend-box legend-box--today"></span> Today
              </span>
              <span className="legend-item">
                <span className="legend-box legend-box--missed"></span> Missed
              </span>
            </div>
          </div>

          <div className="calendar-heatmap-grid" ref={calendarGridRef}>
            {calendarData.map((day) => {
              let cellClass = "cal-day-cell";
              if (day.status === "checked_in") cellClass += " cal-day-cell--done";
              else if (day.status === "missed") cellClass += " cal-day-cell--missed";
              else if (day.status === "pending_today") cellClass += " cal-day-cell--today";
              else cellClass += " cal-day-cell--future";

              return (
                <div
                  key={day.dayNumber}
                  className={cellClass}
                  title={`Day ${day.dayNumber} (${day.date}): ${day.status}`}
                >
                  <span className="cal-day-cell__num">{day.dayNumber}</span>
                  {day.checkedIn && <span className="cal-day-cell__check">✓</span>}
                  {day.status === "missed" && <span className="cal-day-cell__missed-mark">✕</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Challenge Leaderboard & Forfeits Pool */}
      <section className="leaderboard-section">
        <div className="leaderboard-section__header">
          <div>
            <h2>Participant Rankings</h2>
            <p className="leaderboard-section__subtitle">
              {leaderboard.length} streakers competing
            </p>
          </div>
          <span className="pool-tally" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <Trophy size={13} style={{ color: "var(--color-gold)" }} />
            <span>Pool: <strong>{stats?.totalPool || 0} NIM</strong></span>
          </span>
        </div>

        <div className="leaderboard-list">
          {leaderboard.length === 0 ? (
            <p className="empty-sub">No participants have joined yet.</p>
          ) : (
            leaderboard.map((item, idx) => {
              const isCurrentUser =
                (item.wallet_address || "").replace(/\s+/g, "").toUpperCase() === cleanWallet ||
                (item.profile_wallet || "").replace(/\s+/g, "").toUpperCase() === cleanWallet;
              const displayAddress = item.profile_wallet || item.wallet_address;
              const rankIcon = idx === 0 ? <Medal size={16} className="text-gold" /> : idx === 1 ? <Medal size={16} style={{ color: "#CBD5E1" }} /> : idx === 2 ? <Medal size={16} style={{ color: "#CD7F32" }} /> : `#${idx + 1}`;

              return (
                <div
                  key={item.id || displayAddress}
                  className={`leaderboard-row ${isCurrentUser ? "leaderboard-row--me" : ""}`}
                >
                  <span className="leaderboard-row__rank">{rankIcon}</span>
                  <NimiqIdenticon address={displayAddress} size={32} />
                  <div className="leaderboard-row__info">
                    <span className="leaderboard-row__name">
                      {item.display_name || shortenWalletAddress(displayAddress)}
                      {isCurrentUser && <span className="me-pill">You</span>}
                    </span>
                    <span className="leaderboard-row__status">
                      {item.status === "failed" ? <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><XCircle size={12} className="text-rose" /> Stake Lost</span> : <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><Flame size={12} className="text-gold" /> {item.current_streak} Day Streak</span>}
                    </span>
                  </div>
                  <div className="leaderboard-row__checkins">
                    <span className="checkin-count">{item.total_checkins} logs</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
