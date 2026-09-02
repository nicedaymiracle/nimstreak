import React, { useEffect, useState } from "react";
import { CategoryBadge, StatusIndicator } from "../ui/streak-stickers.jsx";
import { NimiqIdenticon } from "../ui/avatar-circle.jsx";
import { shortenWalletAddress } from "../../utils/ui-helpers.js";

export function HomeScreen({
  walletAddress,
  onConnectWallet,
  onNavigate,
  myChallenges = [],
  globalStats = null,
  onSelectChallenge,
}) {
  const activeChallenges = myChallenges.filter((c) => c.status === "active");
  const topActive = activeChallenges[0];

  return (
    <div className="screen-container home-screen">
      {/* Hero Section */}
      <header className="home-hero">
        <div className="hero-badge">
          <span className="hero-badge__dot"></span>
          <span>Powered by Nimiq Blockchain</span>
        </div>

        <h1 className="hero-title">
          Stake <span className="text-gold">NIM</span> on your habits.
        </h1>
        <p className="hero-subtitle">
          Complete your daily streak to get your stake back plus a bonus from everyone who quit. Miss a day, lose your stake.
        </p>

        {/* Action Buttons */}
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => onNavigate("create-challenge")}
          >
            <span className="btn__icon">🔥</span>
            <span>Start a Challenge</span>
          </button>

          <button
            type="button"
            className="btn btn--secondary btn--lg"
            onClick={() => onNavigate("browse")}
          >
            <span className="btn__icon">🔍</span>
            <span>Browse Challenges</span>
          </button>
        </div>
      </header>

      {/* Active User Streak Banner (if joined any) */}
      {topActive ? (
        <section className="streak-hero-card" onClick={() => onSelectChallenge(topActive.challenge_id || topActive.id)}>
          <div className="streak-hero-card__header">
            <div className="streak-hero-card__badge">
              <span className="streak-flame">🔥</span>
              <span>Active Challenge</span>
            </div>
            <span className="streak-hero-card__day">
              Day {topActive.current_streak || 1} of {topActive.duration_days || 30}
            </span>
          </div>

          <h2 className="streak-hero-card__title">{topActive.title}</h2>

          <div className="streak-hero-card__stats">
            <div className="streak-stat">
              <span className="streak-stat__value">🔥 {topActive.current_streak || 0}</span>
              <span className="streak-stat__label">Current Streak</span>
            </div>
            <div className="streak-stat">
              <span className="streak-stat__value">{topActive.stake_amount || topActive.stake_nim} NIM</span>
              <span className="streak-stat__label">Staked</span>
            </div>
            <div className="streak-stat">
              <span className="streak-stat__value">👥 {topActive.total_participants || 1}</span>
              <span className="streak-stat__label">Streakers</span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn--gold-glow btn--full"
            onClick={(e) => {
              e.stopPropagation();
              onSelectChallenge(topActive.challenge_id || topActive.id);
            }}
          >
            <span>Open Today's Check-in</span>
            <span>→</span>
          </button>
        </section>
      ) : (
        <section className="onboarding-card">
          <div className="onboarding-card__icon">⚡</div>
          <div className="onboarding-card__content">
            <h3>Ready to build bulletproof habits?</h3>
            <p>Put skin in the game. Pick a goal, set your stake, and stay accountable.</p>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--gold"
            onClick={() => onNavigate("browse")}
          >
            Explore Goals
          </button>
        </section>
      )}

      {/* Platform Stats Grid */}
      <section className="stats-section">
        <h2 className="section-title">
          <span>Platform Live Activity</span>
          <span className="section-badge">⚡ Real-time</span>
        </h2>

        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-card__icon">👥</span>
            <span className="stat-card__val">{globalStats?.totalUsers || 24}</span>
            <span className="stat-card__lbl">Active Streakers</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon">💎</span>
            <span className="stat-card__val">{(globalStats?.totalNimStaked || 142.5).toFixed(1)}</span>
            <span className="stat-card__lbl">Total NIM Staked</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon">🔥</span>
            <span className="stat-card__val">{globalStats?.totalCheckins || 98}</span>
            <span className="stat-card__lbl">Check-ins Logged</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon">🏆</span>
            <span className="stat-card__val">{globalStats?.activeChallenges || 6}</span>
            <span className="stat-card__lbl">Live Challenges</span>
          </div>
        </div>
      </section>

      {/* Quick Navigation Cards */}
      <section className="quick-grid">
        <div
          className="quick-card"
          onClick={() => onNavigate("my-streaks")}
          role="button"
          tabIndex={0}
        >
          <div className="quick-card__icon">🎯</div>
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
          <div className="quick-card__icon">🛡️</div>
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
