import React from "react";
import {
  Bell,
  Flame,
  AlertTriangle,
  Rocket,
  Trophy,
  Coins,
  Mail,
  CheckCheck,
  Settings,
  X,
  ChevronRight,
} from "lucide-react";

function getNotificationIcon(type) {
  switch (type) {
    case "daily_checkin":
      return <Flame size={18} className="text-gold" />;
    case "streak_at_risk":
      return <AlertTriangle size={18} className="text-rose" />;
    case "challenge_starting":
      return <Rocket size={18} style={{ color: "#60a5fa" }} />;
    case "challenge_completed":
      return <Trophy size={18} className="text-gold" />;
    case "reward_confirmed":
      return <Coins size={18} style={{ color: "#4ade80" }} />;
    case "challenge_invitation":
      return <Mail size={18} style={{ color: "#c084fc" }} />;
    default:
      return <Bell size={18} className="text-gold" />;
  }
}

function formatRelativeTime(isoStr) {
  try {
    const diffMs = Date.now() - new Date(isoStr).getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  } catch {
    return "Recently";
  }
}

export function NotificationCenter({
  isOpen,
  onClose,
  notifications = [],
  onMarkAllRead,
  onNotificationClick,
  onOpenSettings,
  onBrowseChallenges,
}) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="modal-overlay notif-center-overlay" onClick={onClose}>
      <div className="notif-drawer-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="notif-header">
          <div className="notif-header__title-wrap">
            <div className="notif-bell-wrap">
              <Bell size={18} className="text-gold" />
              {unreadCount > 0 && <span className="notif-unread-dot" />}
            </div>
            <h3 className="notif-title">Notifications</h3>
            {unreadCount > 0 && (
              <span className="notif-count-badge">{unreadCount} new</span>
            )}
          </div>

          <div className="notif-header__actions">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="notif-action-btn"
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                <span>Mark all</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="notif-close-btn"
              aria-label="Close notifications"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="notif-list-scroll">
          {notifications.length === 0 ? (
            <div className="notif-empty-state">
              <div className="notif-empty-icon-wrap">
                <Bell size={26} className="text-gold" />
              </div>
              <h4 className="notif-empty-title">You're all caught up!</h4>
              <p className="notif-empty-desc">
                Accountability reminders, streak alerts, and reward confirmations will appear here.
              </p>
              {onBrowseChallenges && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onBrowseChallenges();
                  }}
                  className="btn btn--gold btn--sm"
                  style={{ marginTop: "0.5rem" }}
                >
                  Browse Active Challenges
                </button>
              )}
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => onNotificationClick(notif)}
                className={`notif-item-row ${notif.read ? "notif-item-row--read" : "notif-item-row--unread"}`}
                role="button"
                tabIndex={0}
              >
                <div className="notif-item-icon-box">
                  {getNotificationIcon(notif.type)}
                </div>

                <div className="notif-item-content">
                  <div className="notif-item-headline">
                    <span className="notif-item-title">{notif.title}</span>
                    <span className="notif-item-time">{formatRelativeTime(notif.timestamp)}</span>
                  </div>
                  <p className="notif-item-body">{notif.body}</p>
                  <span className="notif-item-link">
                    View details <ChevronRight size={12} />
                  </span>
                </div>

                {!notif.read && <span className="notif-row-unread-indicator" />}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="notif-footer">
          <span className="notif-footer-label">Accountability updates</span>
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="notif-footer-settings-btn"
            >
              <Settings size={13} />
              <span>Preferences</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationCenter;
