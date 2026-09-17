import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  Smartphone,
  Bell,
  BarChart2,
  Gift,
  Users,
  Clock,
  Info,
  ChevronDown,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "../../utils/notification-engine";
import {
  isPushSupported,
  isInsideNimiqPay,
  getDeviceNotificationPermission,
  subscribeToDeviceNotifications,
  unsubscribeFromDeviceNotifications,
  hasActivePushSubscription,
  syncPreferencesWithBackend,
} from "../../utils/device-notifications";

export function NotificationPreferencesModal({ isOpen, onClose, walletAddress }) {
  if (!isOpen) return null;

  const [prefs, setPrefs] = useState(() => getNotificationPreferences());
  const [savedMessage, setSavedMessage] = useState(false);
  const [pushSupported] = useState(() => isPushSupported());
  const [inNimiqPay] = useState(() => isInsideNimiqPay());
  const [permission, setPermission] = useState(() => getDeviceNotificationPermission());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushFeedback, setPushFeedback] = useState("");

  useEffect(() => {
    let mounted = true;
    if (pushSupported && !inNimiqPay) {
      hasActivePushSubscription().then((active) => {
        if (mounted) setIsSubscribed(active);
      });
    }
    return () => {
      mounted = false;
    };
  }, [pushSupported, inNimiqPay]);

  const handleToggle = (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    saveNotificationPreferences(updated);
    if (walletAddress) {
      syncPreferencesWithBackend(walletAddress, updated);
    }
    triggerSaved();
  };

  const handleTimeChange = (e) => {
    const updated = { ...prefs, preferredReminderTime: e.target.value };
    setPrefs(updated);
    saveNotificationPreferences(updated);
    if (walletAddress) {
      syncPreferencesWithBackend(walletAddress, updated);
    }
    triggerSaved();
  };

  const triggerSaved = () => {
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2000);
  };

  const handleEnablePush = async () => {
    if (!walletAddress) {
      setPushFeedback("Please connect your wallet first to enable device push.");
      return;
    }
    try {
      setPushLoading(true);
      setPushFeedback("");
      const res = await subscribeToDeviceNotifications(walletAddress);
      setPermission(getDeviceNotificationPermission());
      if (res.success) {
        setIsSubscribed(true);
        setPushFeedback("Device notifications enabled!");
        triggerSaved();
      } else if (res.status === "denied") {
        setPushFeedback("Notification permission was denied. Enable in browser settings.");
      }
    } catch (err) {
      setPushFeedback(err.message || "Failed to enable notifications.");
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePush = async () => {
    try {
      setPushLoading(true);
      await unsubscribeFromDeviceNotifications(walletAddress);
      setIsSubscribed(false);
      setPushFeedback("Device notifications disabled.");
      triggerSaved();
    } catch (err) {
      setPushFeedback("Failed to unsubscribe: " + err.message);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card notif-prefs-card" onClick={(e) => e.stopPropagation()}>
        {/* Header with Back Button */}
        <div className="notif-settings-header">
          <button
            type="button"
            onClick={onClose}
            className="notif-back-btn"
            aria-label="Go back"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="notif-settings-title-wrap">
            <h2 className="notif-settings-title">Notification Settings</h2>
            <p className="notif-settings-subtitle">Stay on track with reminders and updates.</p>
          </div>
        </div>

        {/* ── Device Push Alerts Card ── */}
        <div className="notif-device-card">
          <div className="notif-device-top">
            <div className="notif-device-title-wrap">
              <div className="notif-gold-icon-box">
                <Smartphone size={18} />
              </div>
              <span className="notif-device-title">Device Push Alerts</span>
            </div>
            {inNimiqPay ? (
              <span className="notif-badge-pill notif-badge-pill--muted">
                In-App Mode (Nimiq Pay)
              </span>
            ) : !pushSupported ? (
              <span className="notif-badge-pill notif-badge-pill--muted">
                Browser Unsupported
              </span>
            ) : isSubscribed ? (
              <span className="notif-badge-pill notif-badge-pill--active">
                Active
              </span>
            ) : permission === "denied" ? (
              <span className="notif-badge-pill notif-badge-pill--blocked">
                Blocked
              </span>
            ) : (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={pushLoading}
                className="notif-badge-btn"
              >
                {pushLoading ? "Enabling..." : "Enable Push"}
              </button>
            )}
          </div>

          <p className="notif-device-desc">
            {inNimiqPay
              ? "Running inside Nimiq Pay. You'll receive reminders, streak alerts, and payout confirmations in your in-app Notification Center."
              : !pushSupported
              ? "Background device notifications require a modern browser with Web Push support."
              : isSubscribed
              ? "Device notifications are active on this device. You will be notified even when NimStreak is closed."
              : permission === "denied"
              ? "Notifications were blocked in your browser. Update site permissions in browser settings to enable."
              : "Receive lock-screen alerts for daily check-ins, streaks at risk, and on-chain payout confirmations."}
          </p>

          {!inNimiqPay && pushSupported && permission !== "denied" && isSubscribed && (
            <div style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={handleDisablePush}
                disabled={pushLoading}
                className="btn btn--secondary btn--sm"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {pushLoading ? "Updating..." : "Disable Device Push"}
              </button>
            </div>
          )}

          {pushFeedback && (
            <div className="notif-push-feedback">
              <AlertCircle size={13} />
              <span>{pushFeedback}</span>
            </div>
          )}
        </div>

        {/* ── Notification Preferences Section ── */}
        <div className="notif-section-header">
          <h3 className="notif-section-title">Notification Preferences</h3>
          <p className="notif-section-subtitle">Choose what you want to be notified about.</p>
        </div>

        <div className="notif-prefs-list">
          {/* Daily Reminders */}
          <div className="notif-pref-row">
            <div className="notif-gold-icon-box">
              <Bell size={18} />
            </div>
            <div className="notif-pref-info">
              <span className="notif-pref-title">Daily Check-in Reminders</span>
              <span className="notif-pref-desc">Remind you before you break your streak</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle("dailyReminders")}
              className={`pref-toggle ${prefs.dailyReminders ? "pref-toggle--active" : ""}`}
              aria-label="Toggle daily reminders"
            >
              <span className="pref-toggle-thumb" />
            </button>
          </div>

          {/* Challenge Updates */}
          <div className="notif-pref-row">
            <div className="notif-gold-icon-box">
              <BarChart2 size={18} />
            </div>
            <div className="notif-pref-info">
              <span className="notif-pref-title">Challenge Updates</span>
              <span className="notif-pref-desc">Alerts when challenges start, complete, or finalize</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle("challengeUpdates")}
              className={`pref-toggle ${prefs.challengeUpdates ? "pref-toggle--active" : ""}`}
              aria-label="Toggle challenge updates"
            >
              <span className="pref-toggle-thumb" />
            </button>
          </div>

          {/* Reward Updates */}
          <div className="notif-pref-row">
            <div className="notif-gold-icon-box">
              <Gift size={18} />
            </div>
            <div className="notif-pref-info">
              <span className="notif-pref-title">Reward & Payout Confirmations</span>
              <span className="notif-pref-desc">Notify when payouts and bonuses confirm on-chain</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle("rewardUpdates")}
              className={`pref-toggle ${prefs.rewardUpdates ? "pref-toggle--active" : ""}`}
              aria-label="Toggle reward updates"
            >
              <span className="pref-toggle-thumb" />
            </button>
          </div>

          {/* Challenge Invitations */}
          <div className="notif-pref-row">
            <div className="notif-gold-icon-box">
              <Users size={18} />
            </div>
            <div className="notif-pref-info">
              <span className="notif-pref-title">Challenge Invitations</span>
              <span className="notif-pref-desc">When you're invited to a challenge</span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle("invitations")}
              className={`pref-toggle ${prefs.invitations ? "pref-toggle--active" : ""}`}
              aria-label="Toggle challenge invitations"
            >
              <span className="pref-toggle-thumb" />
            </button>
          </div>

          {/* Preferred Alert Time */}
          <div className="notif-pref-row notif-pref-row--time">
            <div className="notif-gold-icon-box">
              <Clock size={18} />
            </div>
            <div className="notif-pref-info">
              <span className="notif-pref-title">Preferred Alert Time</span>
            </div>
            <div className="notif-select-wrapper">
              <select
                value={prefs.preferredReminderTime || "20:00"}
                onChange={handleTimeChange}
                className="notif-time-select"
                aria-label="Preferred Alert Time"
              >
                <option value="09:00">9:00 AM</option>
                <option value="12:00">12:00 PM</option>
                <option value="17:00">5:00 PM</option>
                <option value="20:00">8:00 PM</option>
                <option value="22:00">10:00 PM</option>
              </select>
              <ChevronDown size={14} className="notif-select-arrow" />
            </div>
          </div>
        </div>

        {/* ── Bottom Information Callout ── */}
        <div className="notif-info-callout">
          <div className="notif-info-icon">
            <Info size={16} />
          </div>
          <span className="notif-info-text">
            You can change these settings anytime from your profile.
          </span>
          {savedMessage && (
            <span className="notif-saved-pill">
              <Check size={12} />
              <span>Saved</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationPreferencesModal;
