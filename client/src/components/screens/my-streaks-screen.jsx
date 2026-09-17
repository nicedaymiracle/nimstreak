import React, { useState } from "react";
import { CategoryBadge, BADGE_DEFINITIONS } from "../ui/streak-stickers.jsx";
import {
  Lock,
  Flame,
  Coins,
  Trophy,
  XCircle,
  CheckCircle2,
  Clock,
  Target,
  ShieldCheck,
} from "lucide-react";

export function MyStreaksScreen({
  walletAddress,
  onConnectWallet,
  myChallengesData,
  profileData,
  onSelectChallenge,
  onNavigate,
}) {
  const [tab, setTab] = useState("active"); // active, completed, failed

  if (!walletAddress) {
    return (
      <div className="screen-container">
        <div className="auth-gate-card">
          <span className="auth-gate-card__icon"><Lock size={36} className="text-gold" /></span>
          <h2>Connect Your Nimiq Wallet</h2>
          <p>Connect your Nimiq address to view your active streaks, progress calendars, and earned badges.</p>
          <button
            type="button"
            className="btn btn--gold-glow btn--lg"
            onClick={onConnectWallet}
          >
            Connect Nimiq Wallet
          </button>
        </div>
      </div>
    );
  }

  const activeList = myChallengesData?.active || [];
  const completedList = myChallengesData?.completed || [];
  const failedList = myChallengesData?.failed || [];
  const badges = profileData?.badges || [];
  const profile = profileData?.profile || {};

  const currentList = tab === "active" ? activeList : tab === "completed" ? completedList : failedList;
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="screen-container my-streaks-screen">
      <header className="page-header">
        <h1 className="page-title">My Streaks</h1>
        <p className="page-subtitle">Your active commitments, earned rewards, and streak history.</p>
      </header>

      {/* Overview Cards */}
      <section className="streak-stats-row">
        <div className="stat-card stat-card--highlight">
          <span className="stat-card__icon"><Flame size={20} className="text-gold" /></span>
          <span className="stat-card__val">{profile.current_active_streak || 0}</span>
          <span className="stat-card__lbl">Active Streak</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__icon"><Coins size={20} className="text-gold" /></span>
          <span className="stat-card__val">+{parseFloat(profile.total_nim_earned || 0).toFixed(2)}</span>
          <span className="stat-card__lbl">NIM Earned</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__icon"><Trophy size={20} className="text-gold" /></span>
          <span className="stat-card__val">{profile.completed_challenges || 0}</span>
          <span className="stat-card__lbl">Goals Won</span>
        </div>
      </section>

      {/* Badges Collection Rack */}
      <section className="badges-rack-section">
        <div className="badges-rack-header">
          <div>
            <h2>Badges & Achievements</h2>
            <p className="badges-rack-subtitle">Consistency milestones unlocked</p>
          </div>
          <span className="badge-count-tag">{badges.length} Unlocked</span>
        </div>

        <div className="badges-rack-grid">
          {Object.entries(BADGE_DEFINITIONS).map(([key, def]) => {
            const hasBadge = badges.some((b) => b.badge_type === key);
            return (
              <div
                key={key}
                className={`badge-item ${hasBadge ? "badge-item--unlocked" : "badge-item--locked"}`}
                title={def.description}
              >
                <div className="badge-item__icon-wrap">
                  <span className="badge-item__emoji">{def.emoji}</span>
                </div>
                <span className="badge-item__title">{def.title}</span>
                <span className="badge-item__status">{hasBadge ? "Unlocked" : "Locked"}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tabs Navigation */}
      <div className="challenge-tabs-nav" role="tablist" aria-label="Streak categories">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          className={`tab-btn ${tab === "active" ? "tab-btn--active" : ""}`}
          onClick={() => setTab("active")}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}><Flame size={13} className="text-gold" /> Active ({activeList.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "completed"}
          className={`tab-btn ${tab === "completed" ? "tab-btn--active" : ""}`}
          onClick={() => setTab("completed")}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}><Trophy size={13} className="text-gold" /> Completed ({completedList.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "failed"}
          className={`tab-btn ${tab === "failed" ? "tab-btn--active" : ""}`}
          onClick={() => setTab("failed")}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}><XCircle size={13} className="text-rose" /> Forfeited ({failedList.length})</span>
        </button>
      </div>

      {/* Challenges List */}
      <main className="my-challenges-list">
        {currentList.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              {tab === "active" ? <Target size={36} className="text-gold" /> : tab === "completed" ? <Trophy size={36} className="text-gold" /> : <ShieldCheck size={36} className="text-gold" />}
            </span>
            <h3>
              {tab === "active"
                ? "No active streaks yet"
                : tab === "completed"
                ? "No completed streaks yet"
                : "No forfeited streaks"}
            </h3>
            <p>
              {tab === "active"
                ? "Put NIM behind your daily habits and start your first streak today!"
                : tab === "completed"
                ? "Finish all daily check-ins on a challenge to reclaim your stake and win bonus rewards."
                : "Awesome discipline! You haven't forfeited any stakes."}
            </p>
            {tab === "active" && (
              <div className="empty-state-actions">
                <button
                  type="button"
                  className="btn btn--gold btn--md"
                  onClick={() => onNavigate("create-challenge")}
                >
                  + Create Challenge
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--md"
                  onClick={() => onNavigate("browse")}
                >
                  Browse Challenges
                </button>
              </div>
            )}
            {tab === "completed" && (
              <div className="empty-state-actions" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center", marginTop: "1rem" }}>
                {activeList.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--md"
                    onClick={() => setTab("active")}
                  >
                    View Active Streaks ({activeList.length})
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn--gold btn--md"
                      onClick={() => onNavigate("browse")}
                    >
                      Browse Challenges
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--md"
                      onClick={() => onNavigate("create-challenge")}
                    >
                      + Create Challenge
                    </button>
                  </>
                )}
              </div>
            )}
            {tab === "failed" && (
              <div className="empty-state-actions" style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--md"
                  onClick={() => setTab("active")}
                >
                  View Active Streaks
                </button>
              </div>
            )}
          </div>
        ) : (
          currentList.map((item) => {
            const streak = item.current_streak || 0;
            const duration = item.duration_days || 30;
            const progressPercent = Math.min(100, Math.round((streak / duration) * 100));
            const stake = item.stake_amount || item.challenge_stake || 0;
            const isTodayChecked =
              item.last_checkin_at &&
              new Date(item.last_checkin_at).toISOString().split("T")[0] === todayStr;

            return (
              <article
                key={item.id || item.challenge_id}
                className="my-challenge-item-card"
                onClick={() => onSelectChallenge(item.challenge_id || item.id)}
                role="button"
                tabIndex={0}
              >
                <div className="my-challenge-item-card__top">
                  <div className="my-challenge-card-badge-row">
                    <CategoryBadge category={item.category} />
                    {tab === "active" && (
                      <span
                        className={`mini-status-pill ${
                          isTodayChecked ? "mini-status-pill--checked" : "mini-status-pill--pending"
                        }`}
                      >
                        {isTodayChecked ? <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}><CheckCircle2 size={11} className="text-emerald" /> Checked in today</span> : <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}><Clock size={11} /> Check-in needed</span>}
                      </span>
                    )}
                  </div>
                  <span className="item-streak-badge">
                    {tab === "failed"
                      ? <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><XCircle size={11} className="text-rose" /> Lost</span>
                      : tab === "completed"
                      ? <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><Trophy size={11} className="text-gold" /> {duration}d Won</span>
                      : <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><Flame size={11} className="text-gold" /> Day {streak}/{duration}</span>}
                  </span>
                </div>

                <h3 className="my-challenge-item-card__title">{item.title}</h3>

                {/* Progress bar on active / completed */}
                {tab !== "failed" && (
                  <div className="my-challenge-item-card__progress">
                    <div className="streak-progress-bar">
                      <div
                        className="streak-progress-fill"
                        style={{ width: `${tab === "completed" ? 100 : progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="my-challenge-item-card__footer">
                  <span className="footer-stake">
                    {tab === "failed"
                      ? `Forfeited: ${stake} NIM`
                      : tab === "completed"
                      ? `Protected: ${stake} NIM`
                      : `Stake: ${stake} NIM`}
                  </span>
                  <span className="footer-link">
                    {tab === "active" ? "Continue streak →" : "View Details →"}
                  </span>
                </div>
              </article>
            );
          })
        )}
      </main>
    </div>
  );
}
