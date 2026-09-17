import React, { useState, useEffect } from "react";
import { NimiqIdenticon } from "../ui/avatar-circle.jsx";
import {
  ShieldCheck,
  Pencil,
  Copy,
  Check,
  Flame,
  Zap,
  Coins,
  Lock,
  Trophy,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  Bell,
  RefreshCw,
} from "lucide-react";
import { BADGE_DEFINITIONS } from "../ui/streak-stickers.jsx";
import { shortenWalletAddress } from "../../utils/ui-helpers.js";
import { NotificationPreferencesModal } from "../ui/notification-preferences-modal.jsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export function ProfileScreen({
  walletAddress,
  onConnectWallet,
  onDisconnectWallet,
  profileData,
  onUpdateDisplayName,
  onSelectChallenge,
  onBrowseChallenges,
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);

  // Transaction history state
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txFilter, setTxFilter] = useState("all"); // all, stakes, payouts

  useEffect(() => {
    if (!walletAddress) return;
    let isMounted = true;
    setTxLoading(true);

    fetch(`${API_BASE}/transactions/${walletAddress}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
        }
      })
      .catch((err) => {
        console.warn("[profile:transactions] error:", err.message);
      })
      .finally(() => {
        if (isMounted) setTxLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [walletAddress]);

  if (!walletAddress) {
    return (
      <div className="screen-container">
        <div className="auth-gate-card">
          <span className="auth-gate-card__icon">
            <ShieldCheck size={36} className="text-gold" />
          </span>
          <h2>Connect Your Wallet</h2>
          <p>Connect your Nimiq account to view your global ranking, badges, habit stats, and transaction history.</p>
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

  const filteredTxs = transactions.filter((tx) => {
    if (txFilter === "stakes") return tx.type === "stake";
    if (txFilter === "payouts") return tx.type === "payout" || tx.type === "bonus";
    return true;
  });

  return (
    <div className="screen-container profile-screen">
      {/* Profile Header Card */}
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
              <div className="profile-name-edit-actions">
                <button type="submit" className="btn btn--gold btn--sm" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
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
                title="Edit display name"
                aria-label="Edit display name"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}

          <div
            className="profile-address-pill"
            onClick={handleCopyAddress}
            role="button"
            tabIndex={0}
            title="Click to copy stable profile address"
          >
            <span className="profile-address-tag">Profile ID:</span>
            <span className="profile-address-val">{shortenWalletAddress(walletAddress, 6, 6)}</span>
            <span className="copy-badge">
              {copied ? (
                <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                  Copied! <Check size={11} />
                </span>
              ) : (
                <Copy size={12} />
              )}
            </span>
          </div>
        </div>

        <div className="profile-actions-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setShowNotifModal(true)}
            title="Notification Settings"
          >
            <Bell size={14} className="text-gold" />
            <span>Reminders</span>
          </button>
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
        <div className="section-header-compact">
          <h2 className="section-title">Habit Performance Metrics</h2>
          <span className="section-subtitle">Verified on-chain streak history</span>
        </div>
        <div className="matrix-grid">
          <div className="matrix-card">
            <span className="matrix-card__icon"><Flame size={18} className="text-gold" /></span>
            <span className="matrix-card__val">{profile.current_active_streak || 0}</span>
            <span className="matrix-card__lbl">Active Streak</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon"><Zap size={18} className="text-gold" /></span>
            <span className="matrix-card__val">{profile.longest_streak_ever || 0}</span>
            <span className="matrix-card__lbl">Best Streak Ever</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon"><Coins size={18} className="text-gold" /></span>
            <span className="matrix-card__val">+{parseFloat(profile.total_nim_earned || 0).toFixed(1)}</span>
            <span className="matrix-card__lbl">NIM Won</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon"><Lock size={18} className="text-gold" /></span>
            <span className="matrix-card__val">{parseFloat(profile.total_nim_staked || 0).toFixed(1)}</span>
            <span className="matrix-card__lbl">Total Staked</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon"><Trophy size={18} className="text-gold" /></span>
            <span className="matrix-card__val">{profile.completed_challenges || 0}</span>
            <span className="matrix-card__lbl">Completed</span>
          </div>

          <div className="matrix-card">
            <span className="matrix-card__icon"><XCircle size={18} className="text-rose" /></span>
            <span className="matrix-card__val">{profile.failed_challenges || 0}</span>
            <span className="matrix-card__lbl">Forfeited</span>
          </div>
        </div>
      </section>

      {/* Transaction History Section */}
      <section className="profile-tx-section">
        <div className="section-header-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 className="section-title">Transaction History</h2>
            <span className="section-subtitle">Verified Nimiq Pay stakes and payouts</span>
          </div>
          <div className="tx-filter-pills" style={{ display: "flex", gap: "0.35rem" }}>
            <button
              type="button"
              className={`filter-pill ${txFilter === "all" ? "filter-pill--active" : ""}`}
              onClick={() => setTxFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-pill ${txFilter === "stakes" ? "filter-pill--active" : ""}`}
              onClick={() => setTxFilter("stakes")}
            >
              Stakes
            </button>
            <button
              type="button"
              className={`filter-pill ${txFilter === "payouts" ? "filter-pill--active" : ""}`}
              onClick={() => setTxFilter("payouts")}
            >
              Payouts
            </button>
          </div>
        </div>

        <div className="tx-history-container">
          {txLoading ? (
            <div className="tx-loading-row" style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
              <RefreshCw size={20} className="animate-spin text-gold" style={{ margin: "0 auto 0.5rem" }} />
              <p style={{ fontSize: "0.85rem" }}>Loading transactions...</p>
            </div>
          ) : filteredTxs.length === 0 ? (
            <div className="empty-sub-card">
              <span className="empty-sub-card__icon"><Coins size={28} className="text-gold" /></span>
              <h4>No transactions recorded</h4>
              <p>
                {txFilter === "stakes"
                  ? "You haven't staked on any challenges yet."
                  : txFilter === "payouts"
                  ? "No payouts or rewards received yet. Complete a streak to claim your rewards!"
                  : "Join an open challenge or stake NIM to record your first on-chain transaction."}
              </p>
              {onBrowseChallenges && (
                <button
                  type="button"
                  className="btn btn--gold btn--sm"
                  style={{ marginTop: "0.75rem" }}
                  onClick={onBrowseChallenges}
                >
                  Browse Challenges
                </button>
              )}
            </div>
          ) : (
            <div className="tx-list" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {filteredTxs.map((tx) => {
                const isStake = tx.type === "stake";
                const isPayout = tx.type === "payout" || tx.type === "bonus";
                const isConfirmed = tx.status === "confirmed";
                const isFailed = tx.status === "failed";

                return (
                  <div key={tx.id} className="tx-card" style={{
                    padding: "0.85rem 1rem",
                    borderRadius: "0.75rem",
                    background: "var(--navy-surface)",
                    border: "1px solid var(--navy-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                      <div style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "0.5rem",
                        background: isStake ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                        border: isStake ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(34, 197, 94, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {isStake ? (
                          <ArrowUpRight size={18} className="text-rose" />
                        ) : (
                          <ArrowDownLeft size={18} className="text-green-400" />
                        )}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            color: isStake ? "#f87171" : "#4ade80",
                          }}>
                            {isStake ? "Stake Committed" : tx.type === "bonus" ? "Bonus Reward" : "Stake + Reward Payout"}
                          </span>
                        </div>

                        <h4
                          style={{
                            fontSize: "0.88rem",
                            fontWeight: 600,
                            color: "#fff",
                            margin: "0.15rem 0",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            cursor: onSelectChallenge ? "pointer" : "default",
                          }}
                          onClick={() => onSelectChallenge && onSelectChallenge(tx.challenge_id)}
                          title="View challenge"
                        >
                          {tx.challenge_title}
                        </h4>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          <span>{new Date(tx.timestamp).toLocaleDateString()} {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {tx.tx_hash && (
                            <a
                              href={`https://nimiq.watch/#${tx.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", color: "var(--gold)" }}
                              title="View on Nimiq Watch"
                            >
                              <span>{shortenWalletAddress(tx.tx_hash, 4, 4)}</span>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: isStake ? "#f87171" : "#4ade80",
                      }}>
                        {isStake ? `-${tx.amount}` : `+${tx.amount}`} NIM
                      </div>

                      <span style={{
                        display: "inline-block",
                        marginTop: "0.2rem",
                        fontSize: "0.7rem",
                        padding: "0.1rem 0.45rem",
                        borderRadius: "9999px",
                        fontWeight: 600,
                        background: isConfirmed ? "rgba(34, 197, 94, 0.15)" : isFailed ? "rgba(239, 68, 68, 0.15)" : "rgba(234, 179, 8, 0.15)",
                        color: isConfirmed ? "#4ade80" : isFailed ? "#f87171" : "#facc15",
                        border: isConfirmed ? "1px solid rgba(34, 197, 94, 0.3)" : isFailed ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(234, 179, 8, 0.3)",
                      }}>
                        {isConfirmed ? "Confirmed" : isFailed ? "Failed" : "Pending"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Earned Badges */}
      <section className="profile-badges-section">
        <div className="section-header-compact">
          <h2 className="section-title">Earned Badges ({badges.length})</h2>
          <span className="section-subtitle">Milestone achievements</span>
        </div>
        <div className="profile-badges-grid">
          {badges.length === 0 ? (
            <div className="empty-sub-card">
              <span className="empty-sub-card__icon">⭐</span>
              <p>No badges earned yet. Complete your first streak milestone to unlock achievements!</p>
            </div>
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
                    <span className="profile-badge-card__desc">{def.description}</span>
                    <span className="profile-badge-card__date">
                      Unlocked: {new Date(b.earned_at).toLocaleDateString()}
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
          <div className="section-header-compact">
            <h2 className="section-title">Recent Challenge Activity</h2>
            <span className="section-subtitle">Latest habits participated in</span>
          </div>
          <div className="recent-list">
            {recent.map((r) => (
              <div
                key={r.id || r.challenge_id}
                className="recent-row"
                onClick={() => onSelectChallenge(r.challenge_id)}
                role="button"
                tabIndex={0}
              >
                <div className="recent-row__info">
                  <h4>{r.title}</h4>
                  <span className="recent-row__sub">
                    Streak: {r.current_streak} days · {r.stake_amount} NIM
                  </span>
                </div>
                <span
                  className={`recent-row__status ${
                    r.status === "failed"
                      ? "recent-row__status--forfeit"
                      : r.status === "completed"
                      ? "recent-row__status--won"
                      : "recent-row__status--active"
                  }`}
                >
                  {r.status === "failed" ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <XCircle size={12} className="text-rose" /> Forfeited
                    </span>
                  ) : r.status === "completed" ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Trophy size={12} className="text-gold" /> Won
                    </span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Flame size={12} className="text-gold" /> Active
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notification Preferences Modal */}
      <NotificationPreferencesModal
        isOpen={showNotifModal}
        onClose={() => setShowNotifModal(false)}
      />
    </div>
  );
}
