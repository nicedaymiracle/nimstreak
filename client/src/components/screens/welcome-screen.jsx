import React, { useState } from "react";
import { FloatingHabitsBackground } from "../ui/floating-habits-bg.jsx";
import {
  Target,
  Lock,
  Zap,
  Trophy,
  Info,
  Flame,
  Link2,
  ArrowRight,
  Wallet,
} from "lucide-react";

// Real NimStreak Habit & Challenge Presets for Desktop Continuous Upward Stream
const REAL_CHALLENGE_CARDS = [
  {
    id: "health",
    titleDesktop: "Eating Healthy Daily",
    titleMobile: "Eat Healthy",
    streak: "7 Days",
    stake: "0.5 NIM",
    theme: "emerald",
    color: "#10B981",
    badgeBg: "rgba(16, 185, 129, 0.14)",
    borderColor: "rgba(16, 185, 129, 0.35)",
    glowColor: "rgba(16, 185, 129, 0.15)",
    tiltDesktop: "-4deg",
    tiltMobile: "-2deg",
    desktopLane: "lane-desktop-1",
    desktopDuration: "36s",
    desktopDelay: "0s",
    icon: "leaf",
  },
  {
    id: "reading",
    titleDesktop: "Read 25 Pages",
    titleMobile: "Read 25 Pages",
    streak: "7 Days",
    stake: "1 NIM",
    theme: "blue",
    color: "#38BDF8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
    glowColor: "rgba(56, 189, 248, 0.15)",
    tiltDesktop: "+3deg",
    tiltMobile: "+3deg",
    desktopLane: "lane-desktop-2",
    desktopDuration: "42s",
    desktopDelay: "-8s",
    icon: "book",
  },
  {
    id: "pushups",
    titleDesktop: "50 Pushups Daily",
    titleMobile: "50 Pushups",
    streak: "7 Days",
    stake: "0.5 NIM",
    theme: "amber",
    color: "#F59E0B",
    badgeBg: "rgba(245, 158, 11, 0.14)",
    borderColor: "rgba(245, 158, 11, 0.35)",
    glowColor: "rgba(245, 158, 11, 0.15)",
    tiltDesktop: "-3deg",
    tiltMobile: "-3deg",
    desktopLane: "lane-desktop-3",
    desktopDuration: "38s",
    desktopDelay: "-5s",
    icon: "dumbbell",
  },
  {
    id: "nosocial",
    titleDesktop: "No Social Media",
    titleMobile: "No Social Media",
    streak: "7 Days",
    stake: "1 NIM",
    theme: "rose",
    color: "#F43F5E",
    badgeBg: "rgba(244, 63, 94, 0.14)",
    borderColor: "rgba(244, 63, 94, 0.35)",
    glowColor: "rgba(244, 63, 94, 0.15)",
    tiltDesktop: "+4deg",
    tiltMobile: "+3deg",
    desktopLane: "lane-desktop-4",
    desktopDuration: "34s",
    desktopDelay: "-12s",
    icon: "nosocial",
  },
  {
    id: "coding",
    titleDesktop: "7 Days of Coding",
    titleMobile: "7 Days Coding",
    streak: "7 Days",
    stake: "0.5 NIM",
    theme: "indigo",
    color: "#818CF8",
    badgeBg: "rgba(129, 140, 248, 0.14)",
    borderColor: "rgba(129, 140, 248, 0.35)",
    glowColor: "rgba(129, 140, 248, 0.15)",
    tiltDesktop: "-3deg",
    tiltMobile: "+2deg",
    desktopLane: "lane-desktop-1",
    desktopDuration: "36s",
    desktopDelay: "-18s",
    icon: "code",
  },
  {
    id: "water",
    titleDesktop: "Drink Water Daily",
    titleMobile: "Drink Water",
    streak: "7 Days",
    stake: "0.5 NIM",
    theme: "cyan",
    color: "#06B6D4",
    badgeBg: "rgba(6, 182, 212, 0.14)",
    borderColor: "rgba(6, 182, 212, 0.35)",
    glowColor: "rgba(6, 182, 212, 0.15)",
    tiltDesktop: "+2deg",
    tiltMobile: "0deg",
    desktopLane: "lane-desktop-4",
    desktopDuration: "34s",
    desktopDelay: "-29s",
    icon: "droplet",
  },
  {
    id: "wakeup",
    titleDesktop: "Wake Up at 6:00 AM",
    titleMobile: "Wake Up 6 AM",
    streak: "7 Days",
    stake: "0.5 NIM",
    theme: "orange",
    color: "#F97316",
    badgeBg: "rgba(249, 115, 22, 0.14)",
    borderColor: "rgba(249, 115, 22, 0.35)",
    glowColor: "rgba(249, 115, 22, 0.15)",
    tiltDesktop: "+4deg",
    tiltMobile: "+2deg",
    desktopLane: "lane-desktop-2",
    desktopDuration: "42s",
    desktopDelay: "-29s",
    icon: "sun",
  },
  {
    id: "walk",
    titleDesktop: "Daily Walk",
    titleMobile: "Daily Walk",
    streak: "7 Days",
    stake: "0.5 NIM",
    theme: "teal",
    color: "#14B8A6",
    badgeBg: "rgba(20, 184, 166, 0.14)",
    borderColor: "rgba(20, 184, 166, 0.35)",
    glowColor: "rgba(20, 184, 166, 0.15)",
    tiltDesktop: "-4deg",
    tiltMobile: "-3deg",
    desktopLane: "lane-desktop-3",
    desktopDuration: "38s",
    desktopDelay: "-24s",
    icon: "walk",
  },
  // Distant depth layers
  {
    id: "meditate",
    titleDesktop: "Meditate Daily",
    titleMobile: "Meditate Daily",
    streak: "7 Days",
    stake: "0.5 NIM",
    theme: "gold",
    color: "#EAB308",
    badgeBg: "rgba(234, 179, 8, 0.14)",
    borderColor: "rgba(234, 179, 8, 0.25)",
    glowColor: "rgba(234, 179, 8, 0.10)",
    tiltDesktop: "-5deg",
    tiltMobile: "-2deg",
    desktopLane: "lane-desktop-distant-left",
    desktopDuration: "48s",
    desktopDelay: "-15s",
    icon: "meditate",
    isDistant: true,
  },
  {
    id: "sleep",
    titleDesktop: "Sleep Early",
    titleMobile: "Sleep Early",
    streak: "7 Days",
    stake: "0.5 NIM",
    theme: "purple",
    color: "#A855F7",
    badgeBg: "rgba(168, 85, 247, 0.14)",
    borderColor: "rgba(168, 85, 247, 0.25)",
    glowColor: "rgba(168, 85, 247, 0.10)",
    tiltDesktop: "+5deg",
    tiltMobile: "+3deg",
    desktopLane: "lane-desktop-distant-right",
    desktopDuration: "46s",
    desktopDelay: "-37s",
    icon: "moon",
    isDistant: true,
  },
];

// Dedicated 5 Real Challenge Cards for Mobile Continuous Upward Stream
const MOBILE_CHALLENGE_CARDS = [
  {
    id: "m-health",
    titleMobile: "Eat Healthy",
    titleDesktop: "Eating Healthy Daily",
    streak: "7 Days",
    stake: "0.5 NIM",
    color: "#10B981",
    badgeBg: "rgba(16, 185, 129, 0.14)",
    borderColor: "rgba(16, 185, 129, 0.35)",
    glowColor: "rgba(16, 185, 129, 0.15)",
    tiltMobile: "-2deg",
    mobileLane: "lane-mobile-1",
    mobileDuration: "44s",
    mobileDelay: "0s",
    icon: "leaf",
  },
  {
    id: "m-coding",
    titleMobile: "7 Days Coding",
    titleDesktop: "7 Days of Coding",
    streak: "7 Days",
    stake: "0.5 NIM",
    color: "#818CF8",
    badgeBg: "rgba(129, 140, 248, 0.14)",
    borderColor: "rgba(129, 140, 248, 0.35)",
    glowColor: "rgba(129, 140, 248, 0.15)",
    tiltMobile: "+2deg",
    mobileLane: "lane-mobile-1",
    mobileDuration: "44s",
    mobileDelay: "-22s",
    icon: "code",
  },
  {
    id: "m-pushups",
    titleMobile: "50 Pushups",
    titleDesktop: "50 Pushups Daily",
    streak: "7 Days",
    stake: "0.5 NIM",
    color: "#F59E0B",
    badgeBg: "rgba(245, 158, 11, 0.14)",
    borderColor: "rgba(245, 158, 11, 0.35)",
    glowColor: "rgba(245, 158, 11, 0.15)",
    tiltMobile: "-3deg",
    mobileLane: "lane-mobile-2",
    mobileDuration: "48s",
    mobileDelay: "-10s",
    icon: "dumbbell",
  },
  {
    id: "m-reading",
    titleMobile: "Read 25 Pages",
    titleDesktop: "Read 25 Pages",
    streak: "7 Days",
    stake: "1 NIM",
    color: "#38BDF8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
    glowColor: "rgba(56, 189, 248, 0.15)",
    tiltMobile: "+3deg",
    mobileLane: "lane-mobile-2",
    mobileDuration: "48s",
    mobileDelay: "-34s",
    icon: "book",
  },
  {
    id: "m-water",
    titleMobile: "Drink Water",
    titleDesktop: "Drink Water Daily",
    streak: "7 Days",
    stake: "0.5 NIM",
    color: "#06B6D4",
    badgeBg: "rgba(6, 182, 212, 0.14)",
    borderColor: "rgba(6, 182, 212, 0.30)",
    glowColor: "rgba(6, 182, 212, 0.12)",
    tiltMobile: "0deg",
    mobileLane: "lane-mobile-center",
    mobileDuration: "52s",
    mobileDelay: "-26s",
    icon: "droplet",
    isDistant: true,
  },
];

function HabitIcon({ type, color }) {
  switch (type) {
    case "leaf":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      );
    case "dumbbell":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill={color} aria-hidden="true">
          <path d="M6 5v14H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2zm2 2v10h1a1 1 0 0 0 1-1v-2h4v2a1 1 0 0 0 1 1h1V7h-1a1 1 0 0 0-1 1v2h-4V8a1 1 0 0 0-1-1H8zm12-2h-2v14h2a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
        </svg>
      );
    case "book":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "code":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "droplet":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill={color} aria-hidden="true">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      );
    case "nosocial":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          <rect x="8.5" y="6" width="7" height="12" rx="1.5" />
        </svg>
      );
    case "sun":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      );
    case "walk":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="13" cy="4" r="2" fill={color} />
          <path d="M7 21l3-7 3 2v6M14 13l2-4-3-3-4 3 2 4" />
        </svg>
      );
    case "meditate":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="2" fill={color} />
          <path d="M4 19c2-2 4-3 8-3s6 1 8 3M12 9v7M8 12l4 2 4-2" />
        </svg>
      );
    case "moon":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill={color} aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    default:
      return <span>🎯</span>;
  }
}

// Crisp Streaming Habit UI Component with Upward Motion
function StreamingHabitCard({ card, isMobile = false }) {
  const title = isMobile ? card.titleMobile : card.titleDesktop;
  const tilt = isMobile ? card.tiltMobile : card.tiltDesktop;
  const laneClass = isMobile ? card.mobileLane : card.desktopLane;
  const duration = isMobile ? card.mobileDuration : card.desktopDuration;
  const delay = isMobile ? card.mobileDelay : card.desktopDelay;
  const scale = isMobile ? (card.isDistant ? "0.78" : "0.85") : (card.isDistant ? "0.88" : "1");

  return (
    <div
      className={`streaming-habit-card ${laneClass || ""} ${card.isDistant ? "floating-card--distant" : ""}`}
      style={{
        "--card-accent": card.color,
        "--card-badge-bg": card.badgeBg,
        "--card-border": card.borderColor,
        "--card-glow": card.glowColor,
        "--card-tilt": tilt,
        "--card-scale": scale,
        "--stream-duration": duration,
        "--stream-delay": delay,
      }}
    >
      <div className="habit-card-badge">
        <HabitIcon type={card.icon} color={card.color} />
      </div>
      <div className="habit-card-info">
        <span className="habit-card-title">{title}</span>
        <span className="habit-card-meta">
          <span className="meta-streak">{card.streak}</span>
          <span className="meta-sep">•</span>
          <span className="meta-stake">{card.stake}</span>
        </span>
      </div>
    </div>
  );
}

export function WelcomeScreen({
  challenges = [],
  onSignIn,
  onManualConnect,
  isConnecting = false,
  walletStatus = "",
  inviteHint = "",
}) {
  const [showDetails, setShowDetails] = useState(false);

  const handlePrimaryConnect = () => {
    if (typeof onSignIn === "function") {
      onSignIn();
    }
  };

  const handleSecondaryConnect = () => {
    if (typeof onSignIn === "function") {
      onSignIn();
    }
  };

  return (
    <div className="welcome-screen-wrapper">
      {/* Background: Clean dark SaaS tech grid & ambient glow */}
      <FloatingHabitsBackground />

      {/* Upward Continuous Streaming Cards Background (Behind Header, Central Card, and Footer) */}
      {!showDetails && (
        <>
          <div className="welcome-cards-stream welcome-cards-stream--desktop" aria-hidden="true">
            {REAL_CHALLENGE_CARDS.map((card) => (
              <StreamingHabitCard key={card.id} card={card} />
            ))}
          </div>

          <div className="welcome-cards-stream welcome-cards-stream--mobile" aria-hidden="true">
            {MOBILE_CHALLENGE_CARDS.map((card) => (
              <StreamingHabitCard key={card.id} card={card} isMobile />
            ))}
          </div>
        </>
      )}

      {/* Top Header Navigation */}
      <header className="welcome-nav-header">
        <div className="welcome-brand-logo">
          <img
            src="/nimstreak-logo.png"
            alt=""
            className="welcome-brand-logo-img"
            width="32"
            height="32"
            aria-hidden="true"
          />
          <span className="welcome-brand-text">NimStreak</span>
        </div>
        <div className="welcome-tagline-wrap">
          <span className="welcome-tagline-text">Small Steps. Real Stakes. A Better You.</span>
          <span className="welcome-tagline-bar" />
        </div>
      </header>

      {/* Main Single-Screen Interactive Stage */}
      <main className="welcome-stage">
        {/* Central Sign-In Modal */}
        <div className="welcome-card-anchor">
          <div className="welcome-card">
            {!showDetails ? (
              /* Mode 1: Central Nimiq Pay Sign-In Card */
              <div className="welcome-sign-view">
                <div className="welcome-logo-badge-wrap">
                  <div className="welcome-logo-badge">
                    <img
                      src="/nimstreak-logo.png"
                      alt="NimStreak"
                      className="welcome-card-brand-logo"
                      width="52"
                      height="52"
                    />
                  </div>
                </div>

                <h1 className="welcome-modal-title">
                  Nim<span className="text-gold">Streak</span>
                </h1>

                <p className="welcome-modal-subtitle">
                  Sign in with Nimiq Pay to continue
                </p>

                <p className="welcome-lead-desc">
                  Build daily habits, stake NIM, and become a better you on the blockchain.
                </p>

                {inviteHint && (
                  <div className="invite-notice-pill">
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><Link2 size={14} className="text-gold" aria-hidden="true" /> {inviteHint}</span>
                  </div>
                )}

                {walletStatus && (
                  <div className="welcome-status-pill">
                    <span>{walletStatus}</span>
                  </div>
                )}

                {/* Primary CTA: Continue with Nimiq Pay */}
                <button
                  type="button"
                  className="welcome-btn-primary-pay"
                  disabled={isConnecting}
                  onClick={handlePrimaryConnect}
                >
                  <span className="btn-pay-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                    </svg>
                  </span>
                  <span className="btn-pay-text">
                    {isConnecting ? "Connecting Nimiq Pay..." : "Continue with Nimiq Pay"}
                  </span>
                  <span className="btn-pay-arrow" aria-hidden="true">→</span>
                </button>

                {/* OR Divider */}
                <div className="welcome-or-divider">
                  <span className="divider-line" />
                  <span className="divider-text">OR</span>
                  <span className="divider-line" />
                </div>

                {/* Secondary CTA: Use Nimiq Wallet Instead */}
                <button
                  type="button"
                  className="welcome-btn-secondary-wallet"
                  disabled={isConnecting}
                  onClick={handleSecondaryConnect}
                >
                  <span className="btn-wallet-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="#FFC425">
                      <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />
                    </svg>
                  </span>
                  <span>Use Nimiq Wallet Instead</span>
                </button>

                {/* Learn More Toggle */}
                <div className="welcome-learn-more-wrap">
                  <button
                    type="button"
                    className="welcome-learn-more-btn"
                    onClick={() => setShowDetails(true)}
                  >
                    <span className="info-icon" aria-hidden="true"><Info size={15} /></span>
                    <span>What is NimStreak? Learn More</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Mode 2: About NimStreak (2x2 onboarding steps) */
              <div className="program-details-view">
                <div className="welcome-flame-circle">
                  <img
                    src="/nimstreak-logo.png"
                    alt="NimStreak"
                    className="welcome-about-logo-img"
                    width="38"
                    height="38"
                  />
                </div>

                <h2 className="welcome-title">
                  About <span className="text-gold">NimStreak</span>
                </h2>

                <p className="welcome-subtitle">
                  The habit accountability game on Nimiq. Stake real crypto on your goals, stay consistent, and win rewards.
                </p>

                {/* 2x2 Onboarding Steps Grid */}
                <div className="onboarding-steps-grid">
                  <div className="onboarding-step-card">
                    <div className="step-card__header">
                      <span className="step-card__num">01</span>
                      <span className="step-card__icon" aria-hidden="true"><Target size={20} className="text-gold" /></span>
                    </div>
                    <h4 className="step-card__title">Choose a habit</h4>
                    <p className="step-card__desc">Pick fitness, coding, health, or custom daily routines.</p>
                  </div>

                  <div className="onboarding-step-card">
                    <div className="step-card__header">
                      <span className="step-card__num">02</span>
                      <span className="step-card__icon" aria-hidden="true"><Lock size={20} className="text-gold" /></span>
                    </div>
                    <h4 className="step-card__title">Stake NIM</h4>
                    <p className="step-card__desc">Lock your stake on-chain with Nimiq. Skin in the game.</p>
                  </div>

                  <div className="onboarding-step-card">
                    <div className="step-card__header">
                      <span className="step-card__num">03</span>
                      <span className="step-card__icon" aria-hidden="true"><Zap size={20} className="text-gold" /></span>
                    </div>
                    <h4 className="step-card__title">Check in daily</h4>
                    <p className="step-card__desc">Check in every day before midnight UTC to keep your streak.</p>
                  </div>

                  <div className="onboarding-step-card">
                    <div className="step-card__header">
                      <span className="step-card__num">04</span>
                      <span className="step-card__icon" aria-hidden="true"><Trophy size={20} className="text-gold" /></span>
                    </div>
                    <h4 className="step-card__title">Finish streak</h4>
                    <p className="step-card__desc">Get your stake back plus a share of the forfeited bonus pool!</p>
                  </div>
                </div>

                <div className="modal-actions" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="welcome-btn-primary-pay"
                    onClick={() => {
                      setShowDetails(false);
                      handlePrimaryConnect();
                    }}
                  >
                    <span className="btn-pay-text" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>Sign In to Play <Flame size={16} className="text-gold inline-icon" aria-hidden="true" /></span>
                    <span className="btn-pay-arrow" aria-hidden="true">→</span>
                  </button>

                  <button
                    type="button"
                    className="welcome-btn-secondary-wallet"
                    onClick={() => setShowDetails(false)}
                  >
                    <span>← Back</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Footer with Trust Badges */}
      <footer className="welcome-footer-bar">
        <div className="welcome-footer-powered">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="#FFC425" aria-hidden="true">
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />
          </svg>
          <span>Powered by Nimiq</span>
        </div>

        <div className="welcome-trust-badges">
          <div className="welcome-trust-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#FFC425" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
            <span>Secure by Nimiq</span>
          </div>

          <div className="welcome-trust-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#FFC425" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Real Accountability</span>
          </div>

          <div className="welcome-trust-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#FFC425" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>A Better You</span>
          </div>
        </div>

        <div className="welcome-footer-motto">
          <span>Stake. Commit. Grow.</span>
          <span className="motto-accent-bar" />
        </div>
      </footer>
    </div>
  );
}

export default WelcomeScreen;
