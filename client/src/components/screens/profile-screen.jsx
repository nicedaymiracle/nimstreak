import React, { useState } from "react";
import { NimiqIdenticon } from "../ui/avatar-circle.jsx";
import { BADGE_DEFINITIONS } from "../ui/streak-stickers.jsx";
import { shortenWalletAddress } from "../../utils/ui-helpers.js";

export function ProfileScreen({
  walletAddress,
  onConnectWallet,
  onDisconnectWallet,
  profileData,
  onUpdateDisplayName,
  onSelectChallenge,
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!walletAddress) {
    return (
      <div className="screen-container">
        <div className="auth-gate-card">
          <span className="auth-gate-card__icon">🛡️</span>
          <h2>Connect Your Wallet</h2>
          <p>Connect your Nimiq account to view your global ranking, badges, and habit stats.</p>
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

  const profile = profileData?.profile || {};
  const badges = profileData?.badges || [];
  const recent = profileData?.recentChallenges || [];

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    setSaving(true);
    try {
      await onUpdateDisplayName(nameInput.trim());
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen-container profile-screen">
      <header className="profile-header-card">
        <div className="profile-avatar-wrap">
          <NimiqIdenticon address={walletAddress} size={88} />
        </div>

        <div className="profile-identity">
          {editing ? (
            <form onSubmit={handleSaveName} className="profile-name-edit-form">
              <input
                type="text"
                className="form-input form-input--sm"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter display name"
                maxLength={25}
                autoFocus
              />
              <button type="submit" className="btn btn--gold btn--sm" disabled={saving}>
                Save
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="profile-name-row">
              <h1 className="profile-display-name">
                {profile.display_name || "Streaker"}
              </h1>
              <button
                type="button"
                className="edit-name-btn"
                onClick={() => {
                  setNameInput(profile.display_name || "");
                  setEditing(true);
                }}
                title="Edit name"
              >
                ✏️
              </button>
            </div>
          )}

          <div className="profile-address-pill" onClick={handleCopyAddress}>
            <span>{shortenWalletAddress(walletAddress, 6, 6)}</span>
            <span className="copy-badge">{copied ? "Copied!" : "📋"}</span>
          </div>
        </div>

        <div className="profile-actions-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm text-danger"
            onClick={onDisconnectWallet}
          >
            Disconnect Wallet
          </button>
        </div>
      </header>

      {/* Lifetime Stats Matrix */}
      <section className="profile-matrix-section">
        <h2 className="section-title">Habit Metrics</h2>
        <div className="matrix-grid">
          <div className="matrix-card">
            <span className="matrix-card__icon">🔥</span>
            <span className="matrix-card__val">{profile.current_active_streak || 0}</span>
            <span className="matrix-card__lbl">Active Streak</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon">⚡</span>
            <span className="matrix-card__val">{profile.longest_streak_ever || 0}</span>
            <span className="matrix-card__lbl">Best Streak Ever</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon">💎</span>
            <span className="matrix-card__val">+{parseFloat(profile.total_nim_earned || 0).toFixed(1)}</span>
            <span className="matrix-card__lbl">NIM Won</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon">🔒</span>
            <span className="matrix-card__val">{parseFloat(profile.total_nim_staked || 0).toFixed(1)}</span>
            <span className="matrix-card__lbl">Total Staked</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon">🏆</span>
            <span className="matrix-card__val">{profile.completed_challenges || 0}</span>
            <span className="matrix-card__lbl">Completed</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon">💀</span>
            <span className="matrix-card__val">{profile.failed_challenges || 0}</span>
            <span className="matrix-card__lbl">Forfeited</span>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="profile-badges-section">
        <h2 className="section-title">Earned Badges ({badges.length})</h2>
        <div className="profile-badges-grid">
          {badges.length === 0 ? (
            <p className="empty-sub">No badges earned yet. Complete streaks to unlock badges!</p>
          ) : (
            badges.map((b) => {
              const def = BADGE_DEFINITIONS[b.badge_type] || {
                title: b.badge_type,
                emoji: "⭐",
                description: "Streak milestone",
              };
              return (
                <div key={b.badge_type + b.earned_at} className="profile-badge-card" title={def.description}>
                  <span className="profile-badge-card__emoji">{def.emoji}</span>
                  <div className="profile-badge-card__info">
                    <span className="profile-badge-card__title">{def.title}</span>
                    <span className="profile-badge-card__date">
                      {new Date(b.earned_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Recent Activity */}
      {recent.length > 0 && (
        <section className="profile-recent-section">
          <h2 className="section-title">Recent Challenge Activity</h2>
          <div className="recent-list">
            {recent.map((r) => (
              <div
                key={r.id || r.challenge_id}
                className="recent-row"
                onClick={() => onSelectChallenge(r.challenge_id)}
              >
                <div className="recent-row__info">
                  <h4>{r.title}</h4>
                  <span className="recent-row__sub">
                    Streak: 🔥 {r.current_streak} days · {r.stake_amount} NIM
                  </span>
                </div>
                <span className="recent-row__status">
                  {r.status === "failed" ? "💀 Forfeited" : r.status === "completed" ? "🏆 Won" : "🔥 Active"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
