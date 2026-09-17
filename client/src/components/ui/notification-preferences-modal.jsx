import React, { useState, useEffect } from "react";
import { X, Bell, Clock, Check, ShieldCheck, Smartphone, AlertCircle, Sparkles } from "lucide-react";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  DEFAULT_PREFERENCES,
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
        setPushFeedback("Device notifications enabled! You will receive lock screen alerts.");
        triggerSaved();
      } else if (res.status === "denied") {
        setPushFeedback("Notification permission was denied. You can enable it in browser settings.");
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
      setPushFeedback("Device notifications disabled on this device.");
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
        <button
          type="button"
          onClick={onClose}
          className="modal-close-btn"
          aria-label="Close preferences"
        >
          <X size={18} />
        </button>

        <div className="notif-prefs-header">
          <div className="notif-prefs-icon-wrap">
            <Bell size={20} className="text-gold" />
          </div>
          <div>
            <h3 className="modal-title" style={{ fontSize: "1.2rem", margin: 0 }}>Notification Settings</h3>
            <p className="modal-desc" style={{ fontSize: "0.8rem", margin: 0 }}>Configure accountability reminders & device push</p>
          </div>
        </div>

        {/* ── Device Push Notifications Status & Setup ── */}
        <div className="notif-device-card" style={{
          background: "rgba(233, 178, 19, 0.06)",
          border: "1px solid rgba(233, 178, 19, 0.2)",
          borderRadius: "0.75rem",
          padding: "1rem",
          marginBottom: "1rem"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Smartphone size={16} className="text-gold" />
              <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>Device Push Alerts</span>
            </div>
            {inNimiqPay ? (
              <span style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "1rem", background: "rgba(255,255,255,0.1)", color: "#cbd5e1" }}>
                In-App Mode (Nimiq Pay)
              </span>
            ) : !pushSupported ? (
              <span style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "1rem", background: "rgba(255,255,255,0.1)", color: "#94a3b8" }}>
                Browser Unsupported
              </span>
            ) : isSubscribed ? (
              <span style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "1rem", background: "rgba(16, 185, 129, 0.2)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.4)" }}>
                Active
              </span>
            ) : permission === "denied" ? (
              <span style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "1rem", background: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }}>
                Blocked
              </span>
            ) : (
              <span style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "1rem", background: "rgba(233, 178, 19, 0.15)", color: "var(--gold)" }}>
                Available
              </span>
            )}
          </div>

          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 0.75rem 0", lineHeight: 1.45 }}>
            {inNimiqPay
              ? "Running inside Nimiq Pay WebView. Accountability reminders, streak alerts, and payout confirmations appear instantly in your in-app Notification Center."
              : !pushSupported
              ? "Background device notifications require a modern browser with Web Push support (Chrome on Android, Safari on iOS 16.4+ PWA)."
              : isSubscribed
              ? "Device notifications are active on this device. You will be notified even when NimStreak is closed."
              : permission === "denied"
              ? "Notifications were blocked in your browser settings. To enable, update site permissions in your browser."
              : "Receive lock-screen alerts for daily check-ins, streaks at risk, and on-chain payout confirmations when NimStreak is closed."}
          </p>

          {pushFeedback && (
            <div style={{ fontSize: "0.75rem", color: "var(--gold)", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <AlertCircle size={13} />
              <span>{pushFeedback}</span>
            </div>
          )}

          {pushSupported && !inNimiqPay && permission !== "denied" && (
            <div>
              {isSubscribed ? (
                <button
                  type="button"
                  onClick={handleDisablePush}
                  disabled={pushLoading}
                  className="btn btn--secondary btn--sm"
                  style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem" }}
                >
                  {pushLoading ? "Updating..." : "Disable Device Push"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={pushLoading}
                  className="btn btn--gold btn--sm"
                  style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem" }}
                >
                  {pushLoading ? "Enabling..." : "Enable Device Notifications"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="notif-prefs-list">
          {/* Daily Reminders */}
          <div className="notif-pref-row">
            <div className="notif-pref-info">
              <span className="notif-pref-title">Daily Check-in Reminders</span>
              <span className="notif-pref-desc">Remind you before you break your active challenge streak</span>
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

          {/* Preferred Reminder Time */}
          {prefs.dailyReminders && (
            <div className="notif-time-select-row">
              <div className="notif-time-label">
                <Clock size={14} className="text-gold" />
                <span>Preferred Alert Time</span>
              </div>
              <select
                value={prefs.preferredReminderTime || "20:00"}
                onChange={handleTimeChange}
                className="form-select notif-time-picker"
              >
                <option value="09:00">Morning (9:00 AM)</option>
                <option value="12:00">Midday (12:00 PM)</option>
                <option value="17:00">Afternoon (5:00 PM)</option>
                <option value="20:00">Evening (8:00 PM)</option>
                <option value="22:00">Night (10:00 PM)</option>
              </select>
            </div>
          )}

          {/* Challenge Updates */}
          <div className="notif-pref-row">
            <div className="notif-pref-info">
              <span className="notif-pref-title">Challenge Lifecycle Updates</span>
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
            <div className="notif-pref-info">
              <span className="notif-pref-title">Reward & Payout Confirmations</span>
              <span className="notif-pref-desc">Notify when payouts and streak bonuses confirm on-chain</span>
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
            <div className="notif-pref-info">
              <span className="notif-pref-title">Challenge Invitations</span>
              <span className="notif-pref-desc">Notifications when you are invited to a new streak challenge</span>
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
        </div>

        {/* Anti-spam footer note */}
        <div className="notif-prefs-footer">
          <div className="notif-antispam-tag">
            <ShieldCheck size={14} className="text-gold" />
            <span>Anti-spam: max 1 daily reminder</span>
          </div>

          {savedMessage && (
            <span className="notif-saved-tag">
              <Check size={13} />
              <span>Saved</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationPreferencesModal;
