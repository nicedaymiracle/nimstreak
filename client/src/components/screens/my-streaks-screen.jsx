import React, { useState } from "react";
import { CategoryBadge, BADGE_DEFINITIONS } from "../ui/streak-stickers.jsx";

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
          <span className="auth-gate-card__icon">🔐</span>
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

  return (
    <div className="screen-container my-streaks-screen">
      <header className="page-header">
        <h1 className="page-title">My Streaks</h1>
        <p className="page-subtitle">Your active commitments, earned rewards, and streak history.</p>
      </header>

      {/* Overview Cards */}
      <section className="streak-stats-row">
        <div className="stat-card stat-card--highlight">
          <span className="stat-card__icon">🔥</span>
          <span className="stat-card__val">{profile.current_active_streak || 0}</span>
          <span className="stat-card__lbl">Active Streak</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__icon">💎</span>
          <span className="stat-card__val">+{parseFloat(profile.total_nim_earned || 0).toFixed(2)}</span>
          <span className="stat-card__lbl">NIM Earned</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__icon">🏆</span>
          <span className="stat-card__val">{profile.completed_challenges || 0}</span>
          <span className="stat-card__lbl">Goals Won</span>
        </div>
      </section>

      {/* Badges Collection Rack */}
      <section className="badges-rack-section">
        <div className="badges-rack-header">
          <h2>Badges & Achievements</h2>
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

      {/* Tabs */}
      <div className="challenge-tabs-nav" role="tablist">
        <button
          type="button"
          className={`tab-btn ${tab === "active" ? "tab-btn--active" : ""}`}
          onClick={() => setTab("active")}
        >
          <span>🔥 Active ({activeList.length})</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "completed" ? "tab-btn--active" : ""}`}
          onClick={() => setTab("completed")}
        >
          <span>🏆 Completed ({completedList.length})</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "failed" ? "tab-btn--active" : ""}`}
          onClick={() => setTab("failed")}
        >
          <span>💀 Forfeited ({failedList.length})</span>
        </button>
      </div>

      {/* Challenges List */}
      <main className="my-challenges-list">
        {currentList.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">{tab === "active" ? "🎯" : tab === "completed" ? "🏆" : "🛡️"}</span>
            <h3>No {tab} challenges</h3>
            <p>
              {tab === "active"
                ? "You have no active challenges right now. Join or create one!"
                : tab === "completed"
                ? "Finish all daily check-ins on a challenge to win rewards!"
                : "Great job! You haven't forfeited any stakes."}
            </p>
            {tab === "active" && (
              <button
                type="button"
                className="btn btn--gold btn--sm"
                onClick={() => onNavigate("browse")}
              >
                Find a Challenge
              </button>
            )}
          </div>
        ) : (
          currentList.map((item) => (
            <article
              key={item.id || item.challenge_id}
              className="my-challenge-item-card"
              onClick={() => onSelectChallenge(item.challenge_id || item.id)}
              role="button"
              tabIndex={0}
            >
              <div className="my-challenge-item-card__top">
                <CategoryBadge category={item.category} />
                <span className="item-streak-badge">
                  {tab === "failed" ? "💀 Lost" : `🔥 Day ${item.current_streak || 1}/${item.duration_days || 30}`}
                </span>
              </div>

              <h3 className="my-challenge-item-card__title">{item.title}</h3>

              <div className="my-challenge-item-card__footer">
                <span className="footer-stake">Stake: {item.stake_amount || item.challenge_stake} NIM</span>
                <span className="footer-link">Open Details →</span>
              </div>
            </article>
          ))
        )}
      </main>
    </div>
  );
}
