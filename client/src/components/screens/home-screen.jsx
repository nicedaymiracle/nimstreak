import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CategoryBadge } from "../ui/streak-stickers.jsx";
import {
  Flame,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Trophy,
  Target,
  Coins,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { shortenWalletAddress } from "../../utils/ui-helpers.js";
import { API_BASE_URL } from "../../config/index.js";

export function HomeScreen({
  walletAddress,
  onConnectWallet,
  onNavigate,
  myChallenges = [],
  myChallengesData = null,
  globalStats = null,
  onSelectChallenge,
  onCheckin,
}) {
  const activeChallenges = useMemo(() => {
    if (myChallengesData?.active?.length) return myChallengesData.active;
    return (myChallenges || []).filter(
      (c) => c.status === "active" && c.challenge_status !== "completed"
    );
  }, [myChallengesData, myChallenges]);

  const completedChallenges = useMemo(() => {
    if (myChallengesData?.completed?.length) return myChallengesData.completed;
    return (myChallenges || []).filter(
      (c) => c.status === "completed" || c.challenge_status === "completed"
    );
  }, [myChallengesData, myChallenges]);

  const topActive = activeChallenges[0] || null;
  const otherActive = activeChallenges.slice(1);

  // Active challenge calendar & check-in state
  const [calendarData, setCalendarData] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinMessage, setCheckinMessage] = useState("");
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  // Load participant calendar for top active challenge
  const loadCalendar = useCallback(async (challengeId, address) => {
    if (!challengeId || !address) return;
    try {
      setLoadingCalendar(true);
      const clean = address.replace(/\s+/g, "").toUpperCase();
      const res = await fetch(`${API_BASE_URL}/challenges/${challengeId}/calendar/${clean}`);
      if (res.ok) {
        const data = await res.json();
        setCalendarData(data.calendar || []);
      }
    } catch (err) {
      console.warn("Could not load challenge calendar:", err);
    } finally {
      setLoadingCalendar(false);
    }
  }, []);

  useEffect(() => {
    if (topActive && walletAddress) {
      loadCalendar(topActive.challenge_id || topActive.id, walletAddress);
    } else {
      setCalendarData([]);
      setJustCheckedIn(false);
    }
  }, [topActive?.challenge_id, topActive?.id, walletAddress, loadCalendar]);

  // Derive today's check-in status
  const todayStr = new Date().toISOString().split("T")[0];
  const todayEntry = calendarData.find((c) => c.date === todayStr || c.isToday);
  const isCheckedInToday = justCheckedIn || (todayEntry ? Boolean(todayEntry.checkedIn) : false);

  const durationDays = Number(topActive?.duration_days) || 7;
  const currentStreak = Number(topActive?.current_streak) || 0;

  // Day number within the challenge
  const currentDay = useMemo(() => {
    if (todayEntry?.dayNumber) return todayEntry.dayNumber;
    if (topActive?.starts_at) {
      const start = new Date(topActive.starts_at);
      const diff = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
      return Math.max(1, Math.min(diff, durationDays));
    }
    return Math.max(1, Math.min(currentStreak + (isCheckedInToday ? 0 : 1), durationDays));
  }, [todayEntry, topActive?.starts_at, durationDays, currentStreak, isCheckedInToday]);

  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((currentStreak / durationDays) * 100))
  );

  // Compact 7-day rolling window for the mini tracker
  const trackDays = useMemo(() => {
    if (calendarData.length > 0) {
      if (calendarData.length <= 7) return calendarData;
      const todayIdx = calendarData.findIndex((c) => c.isToday || c.date === todayStr);
      const center = todayIdx >= 0 ? todayIdx : Math.min(calendarData.length - 1, currentDay - 1);
      const start = Math.max(0, Math.min(calendarData.length - 7, center - 3));
      return calendarData.slice(start, start + 7);
    }
    return Array.from({ length: Math.min(7, durationDays) }, (_, i) => {
      const dayNum = i + 1;
      return {
        dayNumber: dayNum,
        checkedIn: dayNum <= currentStreak,
        isToday: dayNum === currentDay,
        isFuture: dayNum > currentDay,
      };
    });
  }, [calendarData, durationDays, currentDay, currentStreak, todayStr]);

  // One-tap check-in handler reusing App.jsx check-in logic
  const handleCheckinToday = async (e) => {
    e.stopPropagation();
    if (isCheckedInToday || checkingIn) return;

    // If challenge requires text or photo proof, redirect to detail screen for input
    if (topActive?.checkin_type === "text" || topActive?.checkin_type === "photo") {
      onSelectChallenge(topActive.challenge_id || topActive.id);
      return;
    }

    if (typeof onCheckin === "function") {
      setCheckingIn(true);
      setCheckinMessage("");
      try {
        await onCheckin(topActive.challenge_id || topActive.id, {
          proofText: "",
          proofPhotoUrl: "",
        });
        setJustCheckedIn(true);
        setCheckinMessage(`🔥 Day ${currentDay} locked in! Streak saved.`);
        if (walletAddress) {
          await loadCalendar(topActive.challenge_id || topActive.id, walletAddress);
        }
      } catch (err) {
        setCheckinMessage(err.message || "Check-in failed");
      } finally {
        setCheckingIn(false);
      }
    } else {
      // Fallback: navigate to challenge detail
      onSelectChallenge(topActive.challenge_id || topActive.id);
    }
  };

  return (
    <div className="screen-container home-screen">
      {/* ── MODE A: RETURNING USER WITH ACTIVE CHALLENGE ───────────── */}
      {topActive ? (
        <>
          {/* Header & Compact Greeting */}
          <header className="home-header">
            <div className="home-header__greeting">
              <span className="greeting-sub">Welcome back</span>
              <h1 className="greeting-title">
                {walletAddress ? shortenWalletAddress(walletAddress, 4, 4) : "Streaker"}
              </h1>
            </div>
            <div className="home-header__badge">
              <span className="home-header__badge-dot"></span>
              <span>Active Streaker</span>
            </div>
          </header>

          {/* ACTIVE STREAK HERO (Top Priority) */}
          <section
            className="active-streak-hero"
            onClick={() => onSelectChallenge(topActive.challenge_id || topActive.id)}
            role="button"
            tabIndex={0}
            aria-label={`Active Challenge: ${topActive.title}`}
          >
            {/* Top Row: Status badge + Category */}
            <div className="active-streak-hero__header">
              <div
                className={`hero-status-pill ${
                  isCheckedInToday ? "hero-status-pill--secured" : "hero-status-pill--pending"
                }`}
              >
                <span className="hero-status-dot"></span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>{isCheckedInToday ? <><CheckCircle2 size={13} className="text-emerald" /> Checked in today</> : <><Clock size={13} /> Awaiting check-in</>}</span>
              </div>
              <CategoryBadge category={topActive.category} size="sm" />
            </div>

            {/* Big Visual Streak Counter */}
            <div className="active-streak-hero__counter-box">
              <div className="streak-flame-wrap">
                <span className="streak-flame-icon"><Flame size={24} className="text-gold" /></span>
              </div>
              <div className="streak-number-col">
                <span className="streak-big-number">{currentStreak}</span>
                <span className="streak-unit-label">DAY STREAK</span>
              </div>
            </div>

            {/* Challenge Title & Day progress info */}
            <div className="active-streak-hero__info">
              <h2 className="active-streak-hero__title">{topActive.title}</h2>
              <div className="active-streak-hero__meta">
                <span className="meta-day">Day {currentDay} of {durationDays}</span>
                <span className="meta-divider">•</span>
                <span className="meta-stake">
                  {topActive.stake_amount || topActive.stake_nim || 0.5} NIM staked
                </span>
              </div>
            </div>

            {/* Progress Bar & Day Tracker */}
            <div className="active-streak-hero__progress-section">
              <div className="hero-progress-bar-track">
                <div
                  className="hero-progress-bar-fill"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <div className="hero-progress-labels">
                <span>
                  {currentStreak} of {durationDays} days completed
                </span>
                <span className="text-gold-bright">{progressPercent}%</span>
              </div>

              {/* Compact 7-day mini track */}
              <div className="hero-days-track">
                {trackDays.map((d, idx) => {
                  const isPastOrChecked = d.checkedIn;
                  const isToday = d.isToday || d.date === todayStr;
                  return (
                    <div
                      key={d.dayNumber || idx}
                      className={`track-day-dot ${
                        isPastOrChecked
                          ? "track-day-dot--checked"
                          : isToday
                          ? isCheckedInToday
                            ? "track-day-dot--checked"
                            : "track-day-dot--today"
                          : "track-day-dot--future"
                      }`}
                      title={`Day ${d.dayNumber}`}
                    >
                      <span className="track-day-dot__num">D{d.dayNumber}</span>
                      <span className="track-day-dot__icon">
                        {isPastOrChecked || (isToday && isCheckedInToday)
                          ? "🔥"
                          : isToday
                          ? "⚡"
                          : "○"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Feedback message if any */}
            {checkinMessage && (
              <div className="hero-checkin-feedback">
                <span>{checkinMessage}</span>
              </div>
            )}

            {/* Primary CTA button */}
            <div className="active-streak-hero__cta-wrap">
              {isCheckedInToday ? (
                <button
                  type="button"
                  className="btn btn--checked-in btn--full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectChallenge(topActive.challenge_id || topActive.id);
                  }}
                >
                  <span className="btn__icon"><CheckCircle2 size={16} className="text-emerald" /></span>
                  <span>Checked in today</span>
                  <span className="btn__sub-arrow">View Details →</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary btn--hero-checkin btn--full"
                  disabled={checkingIn}
                  onClick={handleCheckinToday}
                >
                  <span className="btn__icon">{checkingIn ? <Clock size={16} /> : <Flame size={16} className="text-gold" />}</span>
                  <span>
                    {checkingIn
                      ? "Recording check-in..."
                      : topActive.checkin_type === "text"
                      ? "Submit Today's Note"
                      : topActive.checkin_type === "photo"
                      ? "Submit Today's Photo"
                      : "Check in today"}
                  </span>
                </button>
              )}
              <p className="hero-cta-hint">
                {isCheckedInToday
                  ? `Day ${currentDay} secured! Come back tomorrow to continue your streak.`
                  : `Tap to lock in Day ${currentDay} and keep your ${
                      topActive.stake_amount || topActive.stake_nim || 0.5
                    } NIM safe.`}
              </p>
            </div>
          </section>

          {/* Other active streaks if user has multiple */}
          {otherActive.length > 0 && (
            <section className="home-other-streaks">
              <div className="other-streaks-header">
                <h3>Other Active Streaks</h3>
                <span className="other-streaks-count">{otherActive.length}</span>
              </div>
              <div className="other-streaks-list">
                {otherActive.map((item) => (
                  <div
                    key={item.id || item.challenge_id}
                    className="other-streak-card"
                    onClick={() => onSelectChallenge(item.challenge_id || item.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="other-streak-card__left">
                      <CategoryBadge category={item.category} size="sm" />
                      <span className="other-streak-card__title">{item.title}</span>
                    </div>
                    <div className="other-streak-card__right">
                      <span className="other-streak-badge">
                        Day {item.current_streak || 1}/{item.duration_days || 7}
                      </span>
                      <span className="other-streak-arrow">→</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Compact Quick Actions */}
          <section className="home-quick-actions">
            <button
              type="button"
              className="btn btn--outline-gold quick-action-btn"
              onClick={() => onNavigate("create-challenge")}
            >
              <span className="btn__icon"><Plus size={16} /></span>
              <span>Create Challenge</span>
            </button>
            <button
              type="button"
              className="btn btn--secondary quick-action-btn"
              onClick={() => onNavigate("browse")}
            >
              <span className="btn__icon"><Search size={16} /></span>
              <span>Browse Challenges</span>
            </button>
          </section>
        </>
      ) : completedChallenges.length > 0 ? (
        /* ── MODE B: COMPLETED / BETWEEN STREAKS ───────────────────── */
        <section className="home-completed-state">
          <div className="completed-state-header">
            <span className="completed-state__icon"><Trophy size={40} className="text-gold" /></span>
            <h1 className="completed-state__title">Your next streak is waiting.</h1>
            <p className="completed-state__subtitle">
              You've completed {completedChallenges.length} challenge
              {completedChallenges.length > 1 ? "s" : ""}. Keep your momentum alive with a new
              commitment!
            </p>
          </div>

          <div className="completed-summary-list">
            {completedChallenges.slice(0, 3).map((item) => (
              <div
                key={item.id || item.challenge_id}
                className="completed-summary-card"
                onClick={() => onSelectChallenge(item.challenge_id || item.id)}
                role="button"
                tabIndex={0}
              >
                <div className="completed-summary-card__left">
                  <CategoryBadge category={item.category} size="sm" />
                  <h3 className="completed-summary-card__title">{item.title}</h3>
                </div>
                <div className="completed-summary-card__right">
                  <span className="badge badge--success"><CheckCircle2 size={12} className="inline-icon" /> Completed</span>
                  <span className="completed-summary-card__stake">
                    +{item.stake_amount || item.challenge_stake || 0.5} NIM
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="completed-state-actions">
            <button
              type="button"
              className="btn btn--primary btn--lg btn--full"
              onClick={() => onNavigate("create-challenge")}
            >
              <span className="btn__icon"><Flame size={16} /></span>
              <span>Start a New Challenge</span>
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--lg btn--full"
              onClick={() => onNavigate("browse")}
            >
              <span className="btn__icon"><Search size={16} /></span>
              <span>Browse Challenges</span>
            </button>
          </div>
        </section>
      ) : (
        /* ── MODE C: NEW USER ONBOARDING ──────────────────────────── */
        <section className="home-onboarding">
          <div className="hero-badge">
            <span className="hero-badge__dot"></span>
            <span>Powered by Nimiq</span>
          </div>

          <h1 className="onboarding-title">
            Build your streak. <br />
            <span className="text-gold">Stake NIM. Check in daily. Earn more when others quit.</span>
          </h1>

          <div className="onboarding-steps-grid">
            <div className="onboarding-step-card">
              <div className="step-card__header">
                <span className="step-card__num">01</span>
                <span className="step-card__icon"><Target size={20} className="text-gold" /></span>
              </div>
              <h3 className="step-card__title">Choose a habit</h3>
              <p className="step-card__desc">Pick fitness, coding, health, or set a custom goal.</p>
            </div>

            <div className="onboarding-step-card">
              <div className="step-card__header">
                <span className="step-card__num">02</span>
                <span className="step-card__icon"><Coins size={20} className="text-gold" /></span>
              </div>
              <h3 className="step-card__title">Stake NIM</h3>
              <p className="step-card__desc">Put real skin in the game via fast Nimiq Pay micro-stake.</p>
            </div>

            <div className="onboarding-step-card">
              <div className="step-card__header">
                <span className="step-card__num">03</span>
                <span className="step-card__icon"><Flame size={20} className="text-gold" /></span>
              </div>
              <h3 className="step-card__title">Check in daily</h3>
              <p className="step-card__desc">Log one tap before midnight to keep your streak unbroken.</p>
            </div>

            <div className="onboarding-step-card">
              <div className="step-card__header">
                <span className="step-card__num">04</span>
                <span className="step-card__icon"><Trophy size={20} className="text-gold" /></span>
              </div>
              <h3 className="step-card__title">Finish your streak</h3>
              <p className="step-card__desc">Reclaim your stake plus forfeited rewards and a NimStreak bonus.</p>
            </div>
          </div>

          <div className="onboarding-actions">
            <button
              type="button"
              className="btn btn--primary btn--lg btn--full"
              onClick={() => onNavigate("create-challenge")}
            >
              <span className="btn__icon"><Flame size={16} /></span>
              <span>Create your first challenge</span>
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--lg btn--full"
              onClick={() => onNavigate("browse")}
            >
              <span className="btn__icon"><Search size={16} /></span>
              <span>Browse challenges</span>
            </button>
          </div>
        </section>
      )}

      {/* ── REAL PLATFORM STATS GRID (Always Real Backend Data) ────── */}
      <section className="stats-section">
        <div className="section-title">
          <span>Platform Live Activity</span>
          <span className="section-badge"><Zap size={11} className="inline-icon" /> Real-time</span>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-card__icon"><Users size={20} className="text-gold" /></span>
            <span className="stat-card__val">{globalStats?.totalUsers ?? 0}</span>
            <span className="stat-card__lbl">Active Streakers</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon"><Coins size={20} className="text-gold" /></span>
            <span className="stat-card__val">{(globalStats?.totalNimStaked ?? 0).toFixed(1)}</span>
            <span className="stat-card__lbl">Total NIM Staked</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon"><Flame size={20} className="text-gold" /></span>
            <span className="stat-card__val">{globalStats?.totalCheckins ?? 0}</span>
            <span className="stat-card__lbl">Check-ins Logged</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon"><Trophy size={20} className="text-gold" /></span>
            <span className="stat-card__val">{globalStats?.activeChallenges ?? 0}</span>
            <span className="stat-card__lbl">Live Challenges</span>
          </div>
        </div>
      </section>

      {/* ── QUICK NAVIGATION CARDS ─────────────────────────────────── */}
      <section className="quick-grid">
        <div
          className="quick-card"
          onClick={() => onNavigate("my-streaks")}
          role="button"
          tabIndex={0}
        >
          <div className="quick-card__icon"><Target size={24} className="text-gold" /></div>
          <div className="quick-card__info">
            <h3>My Streaks & Badges</h3>
            <p>Track your active challenges, calendar heatmaps, and earned rewards.</p>
          </div>
          <span className="quick-card__arrow">→</span>
        </div>

        <div
          className="quick-card"
          onClick={() => onNavigate("profile")}
          role="button"
          tabIndex={0}
        >
          <div className="quick-card__icon"><ShieldCheck size={24} className="text-gold" /></div>
          <div className="quick-card__info">
            <h3>Streaker Profile</h3>
            <p>View your Nimiq identity, completed goals, and lifetime stats.</p>
          </div>
          <span className="quick-card__arrow">→</span>
        </div>
      </section>
    </div>
  );
}
