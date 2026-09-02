import React, { useState } from "react";
import { FloatingHabitsBackground } from "../ui/floating-habits-bg.jsx";

export function WelcomeScreen({
  onSignIn,
  isConnecting = false,
  walletStatus = "",
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="welcome-screen-wrapper">
      {/* Dynamic Colorful Floating Tasks & Mesh Orbs Background */}
      <FloatingHabitsBackground />

      <div className="welcome-card">
        {!showDetails ? (
          /* Primary First Screen: Nimiq Wallet Sign In Guard */
          <div className="wallet-notice-view">
            <div className="notice-icon-wrap">
              <span className="notice-icon">📱</span>
            </div>

            <h1 className="modal-title text-gold" style={{ fontSize: "1.7rem", marginBottom: "0.75rem" }}>
              Nimiq Wallet Sign-In
            </h1>

            <div className="notice-message-box">
              <p className="notice-primary-text">
                Sign in with your <strong>Nimiq Wallet</strong> or <strong>NimiqPay</strong> to enter <strong>NimStreak</strong>.
              </p>
              <p className="notice-secondary-text">
                Your wallet signs your daily habit streak commitments and stakes your NIM securely on the blockchain.
              </p>
            </div>

            {walletStatus && (
              <div style={{ margin: "0.5rem 0", fontSize: "0.8rem", color: "var(--gold-light)", textAlign: "center" }}>
                {walletStatus}
              </div>
            )}

            <div className="notice-actions-grid">
              <button
                type="button"
                className="btn btn--gold-glow btn--full btn--lg"
                disabled={isConnecting}
                onClick={onSignIn}
              >
                {isConnecting ? (
                  <span>Connecting Nimiq Wallet... ⏳</span>
                ) : (
                  <>
                    <span>Sign In with Nimiq Wallet</span>
                    <span>🔑</span>
                  </>
                )}
              </button>
            </div>

            <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ color: "var(--gold-primary)", fontSize: "0.8rem" }}
                onClick={() => setShowDetails(true)}
              >
                ℹ️ What is NimStreak? Learn More
              </button>
            </div>
          </div>
        ) : (
          /* Secondary Info View */
          <div className="program-details-view">
            <div className="welcome-flame-circle" style={{ width: "56px", height: "56px", marginBottom: "0.75rem" }}>
              <span className="welcome-flame-emoji" style={{ fontSize: "1.8rem" }}>🔥</span>
            </div>

            <h2 className="welcome-title" style={{ fontSize: "1.45rem" }}>
              About <span className="text-gold">NimStreak</span>
            </h2>

            <p className="welcome-subtitle" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
              The habit accountability game on Nimiq. Stake real crypto on your goals, stay consistent, and win rewards.
            </p>

            <div className="welcome-steps-grid">
              <div className="welcome-step-item">
                <span className="step-icon">🎯</span>
                <div className="step-content">
                  <h3>1. Pick a Challenge</h3>
                  <p>Fitness, coding, meditation, health, or custom daily routines.</p>
                </div>
              </div>

              <div className="welcome-step-item">
                <span className="step-icon">🔒</span>
                <div className="step-content">
                  <h3>2. Stake NIM (Skin in the Game)</h3>
                  <p>Lock your stake. Check in every day before midnight UTC.</p>
                </div>
              </div>

              <div className="welcome-step-item">
                <span className="step-icon">🏆</span>
                <div className="step-content">
                  <h3>3. Win Bonus NIM</h3>
                  <p>Miss a day = lose your stake. Finish = get stake + forfeit bonus!</p>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn--gold-glow btn--full"
                onClick={() => {
                  setShowDetails(false);
                  onSignIn();
                }}
              >
                Sign In to Play 🔥
              </button>

              <button
                type="button"
                className="btn btn--ghost btn--full btn--sm"
                onClick={() => setShowDetails(false)}
              >
                ← Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
