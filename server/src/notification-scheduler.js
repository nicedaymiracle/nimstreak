import webpush from "web-push";
import db, {
  normalizeAddress,
  getAssociatedAddresses,
  resolveProfileWallet,
} from "./db.js";

export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY;

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY;

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:team@nimstreak.app";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (vapidErr) {
  console.warn("[vapid:init] Notice configuring VAPID:", vapidErr.message);
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

export async function sendWebPush(subscription, payload, sendFn = null) {
  const jsonPayload = typeof payload === "string" ? payload : JSON.stringify(payload);
  const dispatcher = sendFn || ((sub, data) => webpush.sendNotification(sub, data));

  try {
    const result = await dispatcher(subscription, jsonPayload);
    return { success: true, result };
  } catch (err) {
    const statusCode = err.statusCode || err.status;
    if (statusCode === 410 || statusCode === 404) {
      console.log("[push:cleanup] Subscription expired or unregistered (HTTP " + statusCode + "). Removing endpoint:", subscription.endpoint);
      await db.removePushSubscription(subscription.endpoint);
    } else {
      console.warn("[push:sendWebPush] Error dispatching push notification:", err.message);
    }
    return { success: false, error: err.message, statusCode };
  }
}

export async function runNotificationScheduler({ now = new Date(), sendNotificationFn = null } = {}) {
  const results = {
    processedChallenges: 0,
    dailyRemindersSent: 0,
    streakAtRiskSent: 0,
    challengeStartsSent: 0,
    challengeCompletedSent: 0,
    rewardsConfirmedSent: 0,
    errors: [],
  };

  const todayStr = now.toISOString().split("T")[0];
  const currentHour = now.getUTCHours();

  try {
    const challenges = await db.getChallenges({ status: "all" });
    results.processedChallenges = challenges.length;

    for (const challenge of challenges) {
      const challengeId = challenge.id;
      const participants = await db.getChallengeParticipants(challengeId);

      // A. ACTIVE CHALLENGES: Daily Reminders & Streak At Risk
      if (challenge.status === "active") {
        for (const p of participants) {
          if (p.status === "failed" || p.status === "forfeited" || p.status === "quit") {
            continue;
          }

          const profileWallet = p.profile_wallet || p.wallet_address;
          const fundingWallet = p.wallet_address;
          const normTarget = normalizeAddress(profileWallet);

          const subs = await db.getPushSubscriptions(normTarget);
          if (!subs || subs.length === 0) {
            continue;
          }

          const prefs = await db.getNotificationPreferences(normTarget);
          if (!prefs.dailyReminders) {
            continue;
          }

          // STRICT CHECK: Has user already checked in today?
          const lastCheckin = p.last_checkin_date || p.last_checkin;
          const alreadyCheckedInToday = lastCheckin && String(lastCheckin).startsWith(todayStr);
          if (alreadyCheckedInToday) {
            continue;
          }

          const checkinDoc = await db.getCheckin(challengeId, fundingWallet, todayStr);
          if (checkinDoc) {
            continue;
          }

          const prefHour = parseInt((prefs.preferredReminderTime || "20:00").split(":")[0], 10) || 20;
          const isStreakAtRiskTime = currentHour >= 22 || (currentHour >= prefHour + 2 && currentHour >= 21);

          if (isStreakAtRiskTime) {
            const riskKey = "streak_at_risk_" + challengeId + "_" + normTarget + "_" + todayStr;
            const alreadySentRisk = await db.isNotificationSent(riskKey);

            if (!alreadySentRisk) {
              const payload = {
                title: "⚠️ Streak at Risk: " + challenge.title,
                body: "You haven't checked in today! Only a few hours remain to protect your " + (p.current_streak || 0) + "-day streak and stake.",
                icon: "/nimstreak-logo.png",
                badge: "/nimstreak-logo.png",
                data: {
                  url: "/?challenge=" + challengeId,
                  challengeId,
                  type: "streak_at_risk",
                  dedupKey: riskKey,
                },
              };

              for (const sub of subs) {
                await sendWebPush(sub, payload, sendNotificationFn);
              }

              await db.recordSentNotification({
                dedupKey: riskKey,
                walletAddress: normTarget,
                type: "streak_at_risk",
                title: payload.title,
                body: payload.body,
                challengeId,
                timestamp: now.toISOString(),
              });

              const dailyKey = "daily_checkin_" + challengeId + "_" + normTarget + "_" + todayStr;
              await db.recordSentNotification({
                dedupKey: dailyKey,
                walletAddress: normTarget,
                type: "daily_checkin",
                title: "Suppressed by streak at risk",
                body: "Suppressed",
                challengeId,
                timestamp: now.toISOString(),
              });

              results.streakAtRiskSent++;
            }
          } else if (currentHour >= prefHour) {
            const dailyKey = "daily_checkin_" + challengeId + "_" + normTarget + "_" + todayStr;
            const alreadySentDaily = await db.isNotificationSent(dailyKey);

            if (!alreadySentDaily) {
              const payload = {
                title: "🔥 Time to check in: " + challenge.title,
                body: "You haven't checked in today on " + challenge.title + ". Keep your streak alive!",
                icon: "/nimstreak-logo.png",
                badge: "/nimstreak-logo.png",
                data: {
                  url: "/?challenge=" + challengeId,
                  challengeId,
                  type: "daily_checkin",
                  dedupKey: dailyKey,
                },
              };

              for (const sub of subs) {
                await sendWebPush(sub, payload, sendNotificationFn);
              }

              await db.recordSentNotification({
                dedupKey: dailyKey,
                walletAddress: normTarget,
                type: "daily_checkin",
                title: payload.title,
                body: payload.body,
                challengeId,
                timestamp: now.toISOString(),
              });

              results.dailyRemindersSent++;
            }
          }
        }
      }

      // B. CHALLENGE STARTING
      if (challenge.status === "active" && challenge.starts_at) {
        const startDateStr = new Date(challenge.starts_at).toISOString().split("T")[0];
        if (startDateStr === todayStr) {
          for (const p of participants) {
            const profileWallet = p.profile_wallet || p.wallet_address;
            const normTarget = normalizeAddress(profileWallet);

            const prefs = await db.getNotificationPreferences(normTarget);
            if (!prefs.challengeUpdates) continue;

            const startKey = "challenge_start_" + challengeId + "_" + normTarget;
            const alreadySent = await db.isNotificationSent(startKey);

            if (!alreadySent) {
              const subs = await db.getPushSubscriptions(normTarget);
              if (subs.length > 0) {
                const payload = {
                  title: "🚀 Challenge Started: " + challenge.title,
                  body: "\"" + challenge.title + "\" is now live! Day 1 is waiting for you.",
                  icon: "/nimstreak-logo.png",
                  badge: "/nimstreak-logo.png",
                  data: {
                    url: "/?challenge=" + challengeId,
                    challengeId,
                    type: "challenge_starting",
                    dedupKey: startKey,
                  },
                };

                for (const sub of subs) {
                  await sendWebPush(sub, payload, sendNotificationFn);
                }
              }

              await db.recordSentNotification({
                dedupKey: startKey,
                walletAddress: normTarget,
                type: "challenge_starting",
                title: "🚀 Challenge Started: " + challenge.title,
                body: "\"" + challenge.title + "\" is now live! Day 1 is waiting for you.",
                challengeId,
                timestamp: now.toISOString(),
              });

              results.challengeStartsSent++;
            }
          }
        }
      }

      // C. CHALLENGE COMPLETED
      if (challenge.status === "completed") {
        for (const p of participants) {
          if (p.status === "completed" || (p.current_streak && p.current_streak >= challenge.duration_days)) {
            const profileWallet = p.profile_wallet || p.wallet_address;
            const normTarget = normalizeAddress(profileWallet);

            const prefs = await db.getNotificationPreferences(normTarget);
            if (!prefs.challengeUpdates) continue;

            const completeKey = "challenge_completed_" + challengeId + "_" + normTarget;
            const alreadySent = await db.isNotificationSent(completeKey);

            if (!alreadySent) {
              const subs = await db.getPushSubscriptions(normTarget);
              if (subs.length > 0) {
                const payload = {
                  title: "🎉 Challenge Completed: " + challenge.title + "!",
                  body: "Congratulations! You conquered " + challenge.duration_days + " days. Your stake has been reclaimed and payout confirmed.",
                  icon: "/nimstreak-logo.png",
                  badge: "/nimstreak-logo.png",
                  data: {
                    url: "/?challenge=" + challengeId + "&view=results",
                    challengeId,
                    type: "challenge_completed",
                    dedupKey: completeKey,
                  },
                };

                for (const sub of subs) {
                  await sendWebPush(sub, payload, sendNotificationFn);
                }
              }

              await db.recordSentNotification({
                dedupKey: completeKey,
                walletAddress: normTarget,
                type: "challenge_completed",
                title: "🎉 Challenge Completed: " + challenge.title + "!",
                body: "Congratulations! You conquered " + challenge.duration_days + " days.",
                challengeId,
                timestamp: now.toISOString(),
              });

              results.challengeCompletedSent++;
            }
          }
        }
      }
    }

    // D. REWARD CONFIRMED: Query confirmed payouts on-chain
    const allSubs = await db.getAllPushSubscriptions();
    const subscribedWallets = new Set(allSubs.map((s) => normalizeAddress(s.wallet_address)));

    for (const normTarget of subscribedWallets) {
      const prefs = await db.getNotificationPreferences(normTarget);
      if (!prefs.rewardUpdates) continue;

      const transactions = await db.getUserTransactions(normTarget);
      for (const tx of transactions) {
        if ((tx.type === "payout" || tx.type === "bonus") && tx.status === "confirmed" && tx.tx_hash) {
          const rewardKey = "reward_confirmed_" + tx.tx_hash;
          const alreadySent = await db.isNotificationSent(rewardKey);

          if (!alreadySent) {
            const subs = await db.getPushSubscriptions(normTarget);
            if (subs.length > 0) {
              const payload = {
                title: "💰 Reward Confirmed on Nimiq!",
                body: tx.amount + " NIM reward has been confirmed on-chain. Tap to view transaction.",
                icon: "/nimstreak-logo.png",
                badge: "/nimstreak-logo.png",
                data: {
                  url: "/?screen=profile&tab=transactions",
                  challengeId: tx.challenge_id,
                  txHash: tx.tx_hash,
                  type: "reward_confirmed",
                  dedupKey: rewardKey,
                },
              };

              for (const sub of subs) {
                await sendWebPush(sub, payload, sendNotificationFn);
              }
            }

            await db.recordSentNotification({
              dedupKey: rewardKey,
              walletAddress: normTarget,
              type: "reward_confirmed",
              title: "💰 Reward Confirmed on Nimiq!",
              body: tx.amount + " NIM reward confirmed on-chain.",
              challengeId: tx.challenge_id,
              txHash: tx.tx_hash,
              timestamp: now.toISOString(),
            });

            results.rewardsConfirmedSent++;
          }
        }
      }
    }
  } catch (err) {
    console.error("[notification-scheduler:error]", err.message);
    results.errors.push(err.message);
  }

  return results;
}

export default {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  getVapidPublicKey,
  sendWebPush,
  runNotificationScheduler,
};
