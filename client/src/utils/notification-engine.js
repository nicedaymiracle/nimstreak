/**
 * NimStreak Notification Engine & Anti-Spam Manager
 *
 * Evaluates in-app accountability notifications, enforces strict deduplication,
 * and manages user notification preferences.
 */

const NOTIFS_STORAGE_KEY = "nimstreak_notifications_v1";
const PREFS_STORAGE_KEY = "nimstreak_notification_preferences_v1";
const DEDUP_STORAGE_KEY = "nimstreak_notification_dedup_v1";

export const DEFAULT_PREFERENCES = {
  dailyReminders: true,
  challengeUpdates: true,
  rewardUpdates: true,
  invitations: true,
  preferredReminderTime: "20:00", // 8:00 PM local time
};

export function getNotificationPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveNotificationPreferences(prefs) {
  try {
    const merged = { ...DEFAULT_PREFERENCES, ...prefs };
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.warn("[notifications] Failed to save preferences:", e);
    return prefs;
  }
}

export function getStoredNotifications() {
  try {
    const raw = localStorage.getItem(NOTIFS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredNotifications(notifs) {
  try {
    // Keep max 50 recent notifications
    const trimmed = (notifs || []).slice(0, 50);
    localStorage.setItem(NOTIFS_STORAGE_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (e) {
    console.warn("[notifications] Failed to save notifications:", e);
    return notifs;
  }
}

function getDedupRegistry() {
  try {
    const raw = localStorage.getItem(DEDUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDedupRegistry(reg) {
  try {
    localStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify(reg));
  } catch (e) {
    console.warn("[notifications] Failed to save dedup registry:", e);
  }
}

/**
 * Check if a notification has already been triggered under anti-spam rules.
 */
export function isNotificationDeduplicated(dedupKey, registry = getDedupRegistry()) {
  return Boolean(registry[dedupKey]);
}

/**
 * Evaluates challenges, user status, payouts, and invites to generate
 * non-spammy in-app accountability notifications.
 */
export function evaluateNotifications({
  challenges = [],
  myChallenges = { all: [], active: [], completed: [], failed: [] },
  payouts = [],
  activeInvite = null,
  now = new Date(),
}) {
  const prefs = getNotificationPreferences();
  const dedup = getDedupRegistry();
  const existingNotifs = getStoredNotifications();
  const newNotifs = [];

  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const currentHour = now.getHours();

  // Helper to append a unique notification
  function addNotif({ id, type, title, body, action, challengeId, timestamp = now.toISOString() }) {
    if (dedup[id]) return; // Deduplicated!

    dedup[id] = { timestamp, type };
    newNotifs.push({
      id,
      type,
      title,
      body,
      action,
      challengeId,
      timestamp,
      read: false,
    });
  }

  // 1. DAILY CHECK-IN & STREAK AT RISK
  if (prefs.dailyReminders) {
    const activeList = myChallenges.active || [];
    for (const chal of activeList) {
      const challengeId = chal.challenge_id || chal.id;
      const challengeTitle = chal.title || "Challenge";

      // Check if user already checked in today
      const lastCheckin = chal.last_checkin_date || chal.last_checkin;
      const alreadyCheckedInToday = lastCheckin && lastCheckin.startsWith(todayStr);

      if (alreadyCheckedInToday) {
        // STRICT RULE: Never remind someone who already checked in today
        continue;
      }

      // Check if preferred reminder hour reached (e.g. 20:00 -> hour 20)
      const prefHour = parseInt((prefs.preferredReminderTime || "20:00").split(":")[0], 10) || 20;
      const isEvening = currentHour >= prefHour;

      if (isEvening) {
        // STREAK AT RISK: Evening reminder
        const riskKey = `streak_at_risk_${challengeId}_${todayStr}`;
        const dailyKey = `daily_checkin_${challengeId}_${todayStr}`;
        // Suppress if already sent a risk notification today
        if (!dedup[riskKey]) {
          addNotif({
            id: riskKey,
            type: "streak_at_risk",
            title: "⚠️ Don't break your streak",
            body: `You still need to check in today for "${challengeTitle}".`,
            action: { screen: "challenge-detail", challengeId },
            challengeId,
          });
          // Mark dailyKey as consumed so we don't double notify
          dedup[dailyKey] = { timestamp: now.toISOString(), type: "daily_checkin" };
        }
      } else {
        // DAILY CHECK-IN: Earlier in the day
        const dailyKey = `daily_checkin_${challengeId}_${todayStr}`;
        if (!dedup[dailyKey]) {
          addNotif({
            id: dailyKey,
            type: "daily_checkin",
            title: `🔥 Your ${challengeTitle} streak is waiting`,
            body: "You haven't checked in today. Keep your momentum going!",
            action: { screen: "challenge-detail", challengeId },
            challengeId,
          });
        }
      }
    }
  }

  // 2. CHALLENGE STARTING
  if (prefs.challengeUpdates) {
    const allJoined = myChallenges.all || [];
    for (const chal of allJoined) {
      const challengeId = chal.challenge_id || chal.id;
      const startsAt = chal.starts_at;
      if (startsAt) {
        const startDateStr = new Date(startsAt).toISOString().split("T")[0];
        if (startDateStr === todayStr && chal.challenge_status === "active") {
          const startKey = `challenge_start_${challengeId}`;
          if (!dedup[startKey]) {
            addNotif({
              id: startKey,
              type: "challenge_starting",
              title: "🚀 Your challenge starts today",
              body: `"${chal.title || 'Your challenge'}" is now live. Time to make it count!`,
              action: { screen: "challenge-detail", challengeId },
              challengeId,
            });
          }
        }
      }
    }
  }

  // 3. CHALLENGE COMPLETED
  if (prefs.challengeUpdates) {
    const completedList = myChallenges.completed || [];
    for (const chal of completedList) {
      const challengeId = chal.challenge_id || chal.id;
      const completeKey = `challenge_completed_${challengeId}`;
      if (!dedup[completeKey]) {
        addNotif({
          id: completeKey,
          type: "challenge_completed",
          title: "🎉 Challenge complete!",
          body: `Your stake for "${chal.title || 'Challenge'}" has been returned and your reward is being processed.`,
          action: { screen: "challenge-detail", challengeId },
          challengeId,
        });
      }
    }
  }

  // 4. REWARD CONFIRMED
  if (prefs.rewardUpdates) {
    for (const py of payouts) {
      const txHash = py.tx_hash;
      const isConfirmed = py.status === "sent" || py.status === "confirmed";
      if (isConfirmed && txHash) {
        const rewardKey = `reward_confirmed_${txHash}`;
        if (!dedup[rewardKey]) {
          const amt = py.amount_nim || py.total_payout_nim || py.amount || "NIM";
          addNotif({
            id: rewardKey,
            type: "reward_confirmed",
            title: "💰 Your NimStreak reward has arrived",
            body: `${amt} NIM reward confirmed on-chain. View your transaction.`,
            action: { screen: "profile", tab: "transactions" },
            challengeId: py.challenge_id,
          });
        }
      }
    }
  }

  // 5. CHALLENGE INVITATION
  if (prefs.invitations && activeInvite) {
    const inviteKey = `invite_${activeInvite.code || activeInvite.id}`;
    if (!dedup[inviteKey]) {
      addNotif({
        id: inviteKey,
        type: "challenge_invitation",
        title: "👀 You've been invited to a NimStreak challenge",
        body: `Think you can finish "${activeInvite.title || 'this challenge'}"?`,
        action: { screen: "challenge-detail", challengeId: activeInvite.id || activeInvite.challenge_id },
        challengeId: activeInvite.id || activeInvite.challenge_id,
      });
    }
  }

  if (newNotifs.length > 0) {
    saveDedupRegistry(dedup);
    const combined = [...newNotifs, ...existingNotifs];
    saveStoredNotifications(combined);
    return { newCount: newNotifs.length, allNotifications: combined };
  }

  return { newCount: 0, allNotifications: existingNotifs };
}

export function markNotificationAsRead(id) {
  const list = getStoredNotifications();
  const updated = list.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveStoredNotifications(updated);
  return updated;
}

export function markAllNotificationsAsRead() {
  const list = getStoredNotifications();
  const updated = list.map((n) => ({ ...n, read: true }));
  saveStoredNotifications(updated);
  return updated;
}

export function getUnreadNotificationCount() {
  const list = getStoredNotifications();
  return list.filter((n) => !n.read).length;
}
