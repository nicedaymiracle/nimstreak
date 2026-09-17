import React, { useState } from "react";
import { X, Bell, Clock, Check, ShieldCheck } from "lucide-react";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  DEFAULT_PREFERENCES,
} from "../../utils/notification-engine";

export function NotificationPreferencesModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const [prefs, setPrefs] = useState(() => getNotificationPreferences());
  const [savedMessage, setSavedMessage] = useState(false);

  const handleToggle = (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    saveNotificationPreferences(updated);
    triggerSaved();
  };

  const handleTimeChange = (e) => {
    const updated = { ...prefs, preferredReminderTime: e.target.value };
    setPrefs(updated);
    saveNotificationPreferences(updated);
    triggerSaved();
  };

  const triggerSaved = () => {
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2000);
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
            <p className="modal-desc" style={{ fontSize: "0.8rem", margin: 0 }}>Configure accountability reminders</p>
          </div>
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
