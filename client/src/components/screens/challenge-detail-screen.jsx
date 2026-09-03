import React, { useEffect, useRef, useState } from "react";
import { CategoryBadge, StatusIndicator } from "../ui/streak-stickers.jsx";
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
  const [checkinMessage, setCheckinMessage] = useState("");
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
    (p) => (p.wallet_address || "").replace(/\s+/g, "").toUpperCase() === cleanWallet
  );

  const isParticipant = Boolean(participant);
  const isFailed = participant?.status === "failed";
  const isChallengeEnded = challengeData?.challenge?.status === "completed" || (challengeData?.challenge?.ends_at && new Date(challengeData.challenge.ends_at) <= new Date());
  const isCompleted = participant?.status === "completed" || (isChallengeEnded && !isFailed && isParticipant);

  // Check if payout has already been made
  const payoutRecord = challengeData?.payouts?.find(
    (p) => (p.wallet_address || "").replace(/\s+/g, "").toUpperCase() === cleanWallet
  );
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
    setCheckinMessage("");

    try {
      const res = await onCheckin(challengeId, {
        proofText,
        proofPhotoUrl,
      });
      setCheckinMessage(res.message || "Daily check-in locked in! 🔥");
      setProofText("");
      setProofPhotoUrl("");
      await loadDetails();
    } catch (err) {
      setCheckinMessage(err.message || "Check-in failed");
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
      setError(err.message || "Failed to join");
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
        setClaimMessage(`🎉 Payout sent! Tx: ${shortenHash(res.txHash)}`);
      }
      await loadDetails();
    } catch (err) {
      setClaimMessage(err.message || "Failed to claim reward");
    } finally {
      setClaiming(false);
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
        <button type="button" className="back-btn" onClick={onBack}>
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
  const estimatedTotalPayout = (
    parseFloat(participant?.stake_amount || challenge.stake_nim) +
    parseFloat(stats?.estimatedBonusPerFinisher || 0)
  ).toFixed(2);

  return (
    <div className="screen-container challenge-detail-screen" ref={cardRef}>
      <header className="page-header page-header--with-back">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="challenge-detail-tags">
          <CategoryBadge category={challenge.category} />
          <span className="challenge-mode-badge">
            {challenge.type === "group" ? "👥 Group" : challenge.type === "solo" ? "👤 Solo" : "🌐 Public"}
          </span>
        </div>
      </header>

      {/* Main Challenge Hero Banner */}
      <section className="detail-hero">
        <h1 className="detail-title">{challenge.title}</h1>
        {challenge.description && <p className="detail-desc">{challenge.description}</p>}

        {challenge.invite_code && (
          <div className="invite-code-pill" onClick={copyInvite}>
            <span>🔑 Code: <strong>{challenge.invite_code}</strong></span>
            <span className="invite-copy-label">{copiedInvite ? "Copied! ✅" : "Copy"}</span>
          </div>
        )}

        {/* Big Numbers Row */}
        <div className="detail-stat-row">
          <div className="d-box">
            <span className="d-box__val" ref={streakNumRef}>
              🔥 {currentStreak}
            </span>
            <span className="d-box__lbl">Your Streak</span>
          </div>

          <div className="d-box">
            <span className="d-box__val">{challenge.stake_nim} NIM</span>
            <span className="d-box__lbl">Stake Amount</span>
          </div>

          <div className="d-box">
            <span className="d-box__val" ref={bonusRef}>
              💎 +{(stats?.estimatedBonusPerFinisher || 0).toFixed(2)}
            </span>
            <span className="d-box__lbl">Est. Bonus NIM</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="streak-progress-wrap">
          <div className="streak-progress-header">
            <span>Day {currentStreak} of {duration}</span>
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

      {/* WINNER CLAIM REWARD SECTION */}
      {isParticipant && !isFailed && isCompleted && (
        <section className="claim-reward-card" style={{
          background: "linear-gradient(135deg, rgba(233,178,19,0.15), rgba(20,20,30,0.85))",
          border: "2px solid var(--gold-primary, #E9B213)",
          borderRadius: "16px",
          padding: "1.25rem",
          margin: "1rem 0",
          textAlign: "center",
          boxShadow: "0 8px 32px rgba(233,178,19,0.2)"
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🏆</div>
          <h3 style={{ color: "var(--gold-light, #FFD566)", margin: "0 0 0.5rem" }}>
            Challenge Completed! You Won!
          </h3>
          <p style={{ fontSize: "0.9rem", color: "#ccc", margin: "0 0 1rem" }}>
            You stayed consistent through all {duration} days. Your original stake + forfeit bonus is ready.
          </p>

          {hasClaimed ? (
            <div style={{
              background: "rgba(10,40,20,0.8)",
              border: "1px solid #2ECC71",
              borderRadius: "10px",
              padding: "0.85rem",
              color: "#2ECC71",
              fontSize: "0.9rem"
            }}>
              ✅ <strong>Reward Claimed & Sent ({payoutRecord.amount_nim} NIM)</strong>
              {payoutRecord.tx_hash && (
                <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", opacity: 0.85 }}>
                  <a
                    href={`https://nimiq.watch/tx/${payoutRecord.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2ECC71", textDecoration: "underline" }}
                  >
                    View on Nimiq Watch ↗ ({shortenHash(payoutRecord.tx_hash)})
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div>
              <button
                type="button"
                className="btn btn--gold-glow btn--lg btn--full"
                onClick={handleClaimPayout}
                disabled={claiming}
                style={{ fontSize: "1.05rem", fontWeight: 800 }}
              >
                {claiming ? "Signing Treasury Payout..." : `💎 CLAIM ${estimatedTotalPayout} NIM`}
              </button>
              {claimMessage && (
                <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--gold-primary)" }}>
                  {claimMessage}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Daily Check-In Action Section */}
      {isParticipant && !isFailed && !isCompleted && (
        <section className="checkin-action-card">
          <div className="checkin-action-card__header">
            <h3>Daily Habit Log</h3>
            <span className="checkin-type-tag">Proof: {challenge.checkin_type}</span>
          </div>

          {challenge.checkin_type === "text" && !isCheckedInToday && (
            <textarea
              className="form-textarea"
              placeholder="Log today's workout, progress or notes..."
              value={proofText}
              onChange={(e) => setProofText(e.target.value)}
              rows={2}
            />
          )}

          {challenge.checkin_type === "photo" && !isCheckedInToday && (
            <input
              type="url"
              className="form-input"
              placeholder="Paste photo / proof URL (e.g. imgur, screenshot)"
              value={proofPhotoUrl}
              onChange={(e) => setProofPhotoUrl(e.target.value)}
            />
          )}

          <button
            ref={checkinBtnRef}
            type="button"
            className={`btn btn--lg btn--full ${
              isCheckedInToday ? "btn--checked" : "btn--gold-glow"
            }`}
            onClick={handleDailyCheckin}
            disabled={isCheckedInToday || checkingIn}
          >
            {checkingIn ? (
              "Locking in check-in..."
            ) : isCheckedInToday ? (
              "✅ Checked In Today! Streak Safe"
            ) : (
              "🔥 Tap Daily Check-in"
            )}
          </button>

          {checkinMessage && (
            <p className="checkin-feedback-msg">{checkinMessage}</p>
          )}
        </section>
      )}

      {/* If User is NOT a participant yet */}
      {!isParticipant && (
        <section className="join-cta-card">
          <div className="join-cta-card__content">
            <h3>Ready to join this challenge?</h3>
            <p>Stake {challenge.stake_nim} NIM to enter the accountability arena.</p>
          </div>
          <button
            type="button"
            className="btn btn--gold-glow btn--lg btn--full"
            onClick={handleJoin}
          >
            Stake {challenge.stake_nim} NIM & Join Challenge 🔥
          </button>
        </section>
      )}

      {/* If User Failed */}
      {isFailed && (
        <section className="forfeit-banner">
          <span className="forfeit-banner__icon">💀</span>
          <div className="forfeit-banner__text">
            <h3>Stake Forfeited</h3>
            <p>You missed a daily check-in. Your stake went to the finishers prize pool.</p>
          </div>
        </section>
      )}

      {/* Streak Calendar Heatmap */}
      {calendarData.length > 0 && (
        <section className="calendar-section">
          <div className="calendar-section__header">
            <h2>Streak Calendar</h2>
            <div className="calendar-legend">
              <span className="legend-item"><span className="legend-box legend-box--done"></span> Done</span>
              <span className="legend-item"><span className="legend-box legend-box--missed"></span> Missed</span>
              <span className="legend-item"><span className="legend-box legend-box--future"></span> Future</span>
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
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Challenge Leaderboard & Forfeits Pool */}
      <section className="leaderboard-section">
        <div className="leaderboard-section__header">
          <h2>Participant Rankings</h2>
          <span className="pool-tally">
            🏆 Pool: <strong>{stats?.totalPool || 0} NIM</strong> ({stats?.quittersCount || 0} Quitters 💀)
          </span>
        </div>

        <div className="leaderboard-list">
          {leaderboard.length === 0 ? (
            <p className="empty-sub">No participants have joined yet.</p>
          ) : (
            leaderboard.map((item, idx) => {
              const isCurrentUser = (item.wallet_address || "").replace(/\s+/g, "").toUpperCase() === cleanWallet;
              const rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;

              return (
                <div
                  key={item.id || item.wallet_address}
                  className={`leaderboard-row ${isCurrentUser ? "leaderboard-row--me" : ""}`}
                >
                  <span className="leaderboard-row__rank">{rankIcon}</span>
                  <NimiqIdenticon address={item.wallet_address} size={32} />
                  <div className="leaderboard-row__info">
                    <span className="leaderboard-row__name">
                      {item.display_name || shortenWalletAddress(item.wallet_address)}
                      {isCurrentUser && <span className="me-pill">You</span>}
                    </span>
                    <span className="leaderboard-row__status">
                      {item.status === "failed" ? "💀 Stake Lost" : `🔥 ${item.current_streak} Day Streak`}
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
