import React, { useState, useEffect, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import {
  WelcomeScreen,
  HomeScreen,
  BrowseScreen,
  CreateChallengeScreen,
  ChallengeDetailScreen,
  MyStreaksScreen,
  ProfileScreen,
} from "./components/screens/index.js";
import { AppBottomNav, NimiqIdenticon } from "./components/ui/index.js";
import { useNimiqWallet } from "./hooks/use-nimiq-wallet.js";
import { API_BASE_URL, SOCKET_SERVER_URL, DEFAULT_TREASURY_ADDRESS } from "./config/index.js";
import { shortenWalletAddress } from "./utils/ui-helpers.js";
import { Smartphone, X, Copy, Bell } from "lucide-react";
import { NotificationCenter } from "./components/ui/notification-center.jsx";
import { NotificationPreferencesModal } from "./components/ui/notification-preferences-modal.jsx";
import { registerServiceWorker, isPushSupported } from "./utils/device-notifications.js";
import {
  evaluateNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getStoredNotifications,
} from "./utils/notification-engine.js";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [selectedChallengeId, setSelectedChallengeId] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [myChallengesData, setMyChallengesData] = useState({ all: [], active: [], completed: [], failed: [] });
  const [profileData, setProfileData] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [desktopNoticeOpen, setDesktopNoticeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [initialInviteCode, setInitialInviteCode] = useState("");
  const [pendingChallengeId, setPendingChallengeId] = useState(null);
  const [repeatChallengeData, setRepeatChallengeData] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => getStoredNotifications());

  // Register background service worker for push notifications on supported browsers
  useEffect(() => {
    if (isPushSupported()) {
      registerServiceWorker().catch(() => {});
    }
  }, []);

  // Parse share/invite deep link query parameters on initial mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cId = params.get("challenge") || params.get("challengeId");
      const inv = params.get("invite") || params.get("code");
      const targetScreen = params.get("screen");
      if (cId) {
        setPendingChallengeId(cId);
        setSelectedChallengeId(cId);
        setScreen("challenge-detail");
      } else if (targetScreen) {
        setScreen(targetScreen);
      }
      if (inv) {
        setInitialInviteCode(inv.toUpperCase());
      }
    } catch (err) {
      console.warn("Could not parse invite link params:", err);
    }
  }, []);

  // Nimiq wallet hook
  const {
    address: walletAddress,
    balance: walletBalance,
    walletStatus,
    isConnecting,
    isNimiqPay,
    connectWallet,
    disconnectWallet,
    setManualAddress,
    pay: sendNimiqPayment,
  } = useNimiqWallet();

  
  // Helper for user-friendly transaction feedback adhering to safety UX rules
  const handleTxError = (err) => {
    const msg = err?.message || "";
    if (/cancel|abort|reject|declined|closed|denied/i.test(msg)) {
      showToast("Payment cancelled. No stake was committed.");
      return;
    }
    if (/timeout|pending|verifying|waiting/i.test(msg)) {
      showToast("Transaction submitted. On-chain verification is in progress...");
      return;
    }
    showToast(`Transaction failed: ${msg}. Your stake was not committed. You can safely try again.`);
  };

  // Evaluate in-app accountability notifications whenever data refreshes
  useEffect(() => {
    const res = evaluateNotifications({
      challenges,
      myChallenges: myChallengesData,
      payouts: profileData?.payouts || [],
      activeInvite: initialInviteCode ? { code: initialInviteCode } : null,
    });
    setNotifications(res.allNotifications);
  }, [challenges, myChallengesData, profileData, initialInviteCode]);

  const handleNotificationClick = (notif) => {
    const updated = markNotificationAsRead(notif.id);
    setNotifications(updated);
    setNotificationsOpen(false);

    if (notif.action) {
      if (notif.action.screen === "challenge-detail" && notif.action.challengeId) {
        setSelectedChallengeId(notif.action.challengeId);
        setScreen("challenge-detail");
      } else if (notif.action.screen === "profile") {
        setScreen("profile");
      }
    }
  };

  // Socket instance
  const socket = useMemo(() => {
    return io(SOCKET_SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
    });
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  // Fetch Public Challenges
  const fetchChallenges = useCallback(async () => {
    try {
      setLoadingChallenges(true);
      const res = await fetch(`${API_BASE_URL}/challenges`);
      if (res.ok) {
        const data = await res.json();
        setChallenges(data || []);
      }
    } catch (err) {
      console.warn("Could not load challenges:", err.message);
    } finally {
      setLoadingChallenges(false);
    }
  }, []);

  // Fetch Global Stats
  const fetchGlobalStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/stats/global`);
      if (res.ok) {
        const data = await res.json();
        setGlobalStats(data);
      }
    } catch (err) {
      console.warn("Could not load global stats:", err.message);
    }
  }, []);

  // Fetch User's Challenges & Profile
  const fetchUserData = useCallback(async () => {
    if (!walletAddress) {
      setMyChallengesData({ all: [], active: [], completed: [], failed: [] });
      setProfileData(null);
      return;
    }

    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`${API_BASE_URL}/profile/${walletAddress}`),
        fetch(`${API_BASE_URL}/my-challenges/${walletAddress}`),
      ]);

      if (pRes.ok) {
        const pJson = await pRes.json();
        setProfileData(pJson);
      }
      if (cRes.ok) {
        const cJson = await cRes.json();
        setMyChallengesData(cJson);
      }
    } catch (err) {
      console.warn("Could not load user data:", err.message);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchChallenges();
    fetchGlobalStats();
  }, [fetchChallenges, fetchGlobalStats]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Global socket events
  useEffect(() => {
    if (!socket) return;

    socket.on("global:streak_activity", (event) => {
      fetchGlobalStats();
      if (event.type === "created") {
        fetchChallenges();
      }
    });

    return () => {
      socket.off("global:streak_activity");
    };
  }, [socket, fetchChallenges, fetchGlobalStats]);

  // Sign In Handler from Welcome Screen
  const handleSignIn = async () => {
    const addr = await connectWallet();
    if (addr) {
      showToast(`🔥 Signed in as ${shortenWalletAddress(addr, 4, 4)}`);
      if (pendingChallengeId) {
        setSelectedChallengeId(pendingChallengeId);
        setScreen("challenge-detail");
      } else if (initialInviteCode) {
        setScreen("browse");
      } else {
        setScreen("home");
      }
    }
  };

  const handleManualConnect = (address) => {
    const formatted = setManualAddress(address);
    if (formatted) {
      showToast(`🔥 Connected as ${shortenWalletAddress(formatted, 4, 4)}`);
      if (pendingChallengeId) {
        setSelectedChallengeId(pendingChallengeId);
        setScreen("challenge-detail");
      } else if (initialInviteCode) {
        setScreen("browse");
      } else {
        setScreen("home");
      }
    }
  };

  // If already authenticated and deep link was provided, navigate to destination
  useEffect(() => {
    if (walletAddress && pendingChallengeId) {
      setSelectedChallengeId(pendingChallengeId);
      setScreen("challenge-detail");
    }
  }, [walletAddress, pendingChallengeId]);

  // Navigate to single challenge detail
  const handleSelectChallenge = (id) => {
    setSelectedChallengeId(id);
    setScreen("challenge-detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Create Challenge Handler with Real On-Chain Stake Payment
  const handleCreateChallenge = async (params) => {
    setSubmitting(true);
    try {
      if (typeof sendNimiqPayment !== "function") {
        throw new Error("Nimiq payment provider not available. Please connect a Nimiq wallet.");
      }

      showToast("Please confirm stake payment in Nimiq Pay...");
      const paymentResult = await sendNimiqPayment({
        recipient: DEFAULT_TREASURY_ADDRESS,
        amountNim: params.stakeNim,
        message: `NimStreak: ${params.title.slice(0, 20)}`,
      });

      const txHash = paymentResult?.hash || paymentResult?.transactionHash;
      if (!txHash) {
        throw new Error("No transaction hash returned from Nimiq wallet.");
      }

      const stableProfileAddress = params.walletAddress || walletAddress;
      const actualFundingAddress = paymentResult?.sender;

      showToast("⏳ Verifying on-chain stake transaction...");

      const res = await fetch(`${API_BASE_URL}/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          walletAddress: stableProfileAddress,
          fundingAddress: actualFundingAddress,
          stakeTxHash: txHash,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to create challenge");
      }

      const created = await res.json();
      showToast(`🔥 Challenge created! Day 1 starts now.`);
      await fetchChallenges();
      await fetchUserData();
      setSelectedChallengeId(created.id);
      setScreen("challenge-detail");
    } catch (err) {
      handleTxError(err);
      if (err.message && (err.message.includes("Nimiq Pay Mobile App") || err.message.includes("payment provider"))) {
        setDesktopNoticeOpen(true);
      }
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  // Join Challenge Handler with Real On-Chain Stake Payment
  const handleJoinChallenge = async (challengeId, stakeAmount) => {
    if (!walletAddress) {
      handleSignIn();
      return;
    }

    try {
      if (typeof sendNimiqPayment !== "function") {
        throw new Error("Nimiq payment provider not available. Please connect a Nimiq wallet.");
      }

      showToast(`Please confirm ${stakeAmount} NIM stake in Nimiq Pay...`);
      const paymentResult = await sendNimiqPayment({
        recipient: DEFAULT_TREASURY_ADDRESS,
        amountNim: stakeAmount,
        message: `NimStreak Stake Join`,
      });

      const txHash = paymentResult?.hash || paymentResult?.transactionHash;
      if (!txHash) {
        throw new Error("No transaction hash returned from Nimiq wallet.");
      }

      showToast("⏳ Verifying on-chain stake transaction...");

      const res = await fetch(`${API_BASE_URL}/challenges/${challengeId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          fundingAddress: paymentResult?.sender,
          stakeAmount,
          stakeTxHash: txHash,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to join challenge");
      }

      showToast("🎉 Stake confirmed on-chain! Challenge joined.");
      await fetchChallenges();
      await fetchUserData();
    } catch (err) {
      handleTxError(err);
      if (err.message && (err.message.includes("Nimiq Pay Mobile App") || err.message.includes("payment provider"))) {
        setDesktopNoticeOpen(true);
      }
      throw err;
    }
  };

  // Join By Code Handler with Real Stake Payment
  const handleJoinByCode = async (inviteCode) => {
    if (!walletAddress) {
      handleSignIn();
      return;
    }

    try {
      // 1. Look up challenge to get stake amount
      const checkRes = await fetch(`${API_BASE_URL}/challenges?search=${encodeURIComponent(inviteCode)}`);
      let stakeAmount = 1.0;
      if (checkRes.ok) {
        const list = await checkRes.json();
        const found = list.find((c) => (c.invite_code || "").toUpperCase() === inviteCode.toUpperCase());
        if (found) stakeAmount = parseFloat(found.stake_nim) || 1.0;
      }

      // 2. Pay stake
      showToast(`Please confirm ${stakeAmount} NIM stake in Nimiq Pay...`);
      const paymentResult = await sendNimiqPayment({
        recipient: DEFAULT_TREASURY_ADDRESS,
        amountNim: stakeAmount,
        message: `NimStreak Code Join ${inviteCode}`,
      });

      const txHash = paymentResult?.hash || paymentResult?.transactionHash;
      if (!txHash) {
        throw new Error("No transaction hash returned from Nimiq wallet.");
      }

      showToast("⏳ Verifying on-chain stake transaction...");

      const res = await fetch(`${API_BASE_URL}/challenges/join-by-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          fundingAddress: paymentResult?.sender,
          inviteCode,
          stakeTxHash: txHash,
          stakeAmount,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Invalid invite code or already joined");
      }

      const data = await res.json();
      showToast("🎉 Joined group challenge via code!");
      await fetchChallenges();
      await fetchUserData();
      if (data?.challenge?.id) {
        setSelectedChallengeId(data.challenge.id);
        setScreen("challenge-detail");
      }
    } catch (err) {
      showToast(`❌ ${err.message || "Failed to join via invite code"}`);
      if (err.message && (err.message.includes("Nimiq Pay Mobile App") || err.message.includes("payment provider"))) {
        setDesktopNoticeOpen(true);
      }
      throw err;
    }
  };

  // Claim Winner Payout Handler
  const handleClaimReward = async (challengeId) => {
    if (!walletAddress) {
      handleSignIn();
      return;
    }

    const res = await fetch(`${API_BASE_URL}/challenges/${challengeId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "Failed to claim reward");
    }

    const destShort = json.fundingAddress
      ? ` to ${json.fundingAddress.slice(0, 4)}...${json.fundingAddress.slice(-4)}`
      : "";
    showToast(`💎 Payout sent! ${json.amountNim} NIM transferred${destShort}.`);
    await fetchChallenges();
    await fetchUserData();
    return json;
  };

  // Daily Checkin Handler
  const handleCheckin = async (challengeId, { proofText, proofPhotoUrl }) => {
    const res = await fetch(`${API_BASE_URL}/challenges/${challengeId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        proofText,
        proofPhotoUrl,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error || "Check-in failed");
    }

    const json = await res.json();
    showToast("🔥 Daily check-in logged! Streak saved.");
    await fetchUserData();
    return json;
  };

  // Update Display Name
  const handleUpdateDisplayName = async (displayName) => {
    const res = await fetch(`${API_BASE_URL}/profile/${walletAddress}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });

    if (!res.ok) {
      throw new Error("Failed to update display name");
    }
    showToast("✅ Profile name updated");
    await fetchUserData();
  };

  const isPreviewingChallenge = !walletAddress && Boolean(selectedChallengeId || pendingChallengeId);

  // If user is unauthenticated and NOT previewing a shared challenge, show WelcomeScreen
  if (!walletAddress && !isPreviewingChallenge) {
    return (
      <div className="nimstreak-app nimstreak-app--welcome">
        {toastMessage && (
          <div className="toast-notification">
            <span>{toastMessage}</span>
          </div>
        )}
        <WelcomeScreen
          challenges={challenges}
          onSignIn={handleSignIn}
          onManualConnect={handleManualConnect}
          isConnecting={isConnecting}
          walletStatus={walletStatus}
          inviteHint={
            initialInviteCode
              ? `Invite code ${initialInviteCode} detected! Connect your wallet to join.`
              : ""
          }
        />
      </div>
    );
  }

  return (
    <div className="nimstreak-app">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="app-top-nav">
        <div
          className="app-brand"
          onClick={() => {
            setScreen("home");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          role="button"
          tabIndex={0}
        >
          <img src="/nimstreak-logo.png" alt="" className="brand-logo-img" width="28" height="28" aria-hidden="true" />
          <span className="brand-name">Nim<span className="brand-name--gold">Streak</span></span>
        </div>

        <div className="top-nav-right">
          {walletAddress && (
            <button
              type="button"
              className="notif-bell-btn"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Open notifications"
            >
              <Bell size={20} />
              {notifications.filter((n) => !n.read).length > 0 && (
                <span className="notif-bell-badge" />
              )}
            </button>
          )}

          {walletAddress ? (
            <button
              type="button"
              className="top-nav-avatar-btn"
              onClick={() => setScreen("profile")}
              aria-label="Player Profile"
            >
              <NimiqIdenticon address={walletAddress} size={30} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--gold btn--sm"
              onClick={handleSignIn}
              style={{ padding: "0.4rem 0.8rem", fontSize: "0.82rem" }}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main View Area */}
      <main className="app-main-viewport">
        {screen === "home" && (
          <HomeScreen
            walletAddress={walletAddress}
            onConnectWallet={handleSignIn}
            onNavigate={(nextScreen) => {
              setScreen(nextScreen);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            myChallenges={myChallengesData.all}
            myChallengesData={myChallengesData}
            globalStats={globalStats}
            onSelectChallenge={handleSelectChallenge}
            onCheckin={handleCheckin}
          />
        )}

        {screen === "browse" && (
          <BrowseScreen
            challenges={challenges}
            loading={loadingChallenges}
            onSelectChallenge={handleSelectChallenge}
            onJoinByCode={handleJoinByCode}
            walletAddress={walletAddress}
            onConnectWallet={handleSignIn}
            initialInviteCode={initialInviteCode}
            onCreateChallengeNav={() => setScreen("create-challenge")}
          />
        )}

        {screen === "create-challenge" && (
          <CreateChallengeScreen
            walletAddress={walletAddress}
            onConnectWallet={handleSignIn}
            onCreateChallenge={async (params) => {
              await handleCreateChallenge(params);
              setRepeatChallengeData(null);
            }}
            onCancel={() => {
              setRepeatChallengeData(null);
              setScreen("home");
            }}
            submitting={submitting}
            initialValues={repeatChallengeData}
          />
        )}

        {(screen === "challenge-detail" || isPreviewingChallenge) && (selectedChallengeId || pendingChallengeId) && (
          <ChallengeDetailScreen
            challengeId={selectedChallengeId || pendingChallengeId}
            walletAddress={walletAddress}
            onConnectWallet={handleSignIn}
            onCheckin={handleCheckin}
            onJoinChallenge={handleJoinChallenge}
            onClaim={handleClaimReward}
            onRepeatChallenge={(params) => {
              setRepeatChallengeData(params);
              setScreen("create-challenge");
            }}
            onBack={() => {
              if (isPreviewingChallenge) {
                setSelectedChallengeId(null);
                setPendingChallengeId(null);
              } else {
                setScreen("browse");
              }
            }}
            apiBaseUrl={API_BASE_URL}
            socket={socket}
          />
        )}

        {screen === "my-streaks" && (
          <MyStreaksScreen
            walletAddress={walletAddress}
            onConnectWallet={handleSignIn}
            myChallengesData={myChallengesData}
            profileData={profileData}
            onSelectChallenge={handleSelectChallenge}
            onNavigate={(nextScreen) => {
              setScreen(nextScreen);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {screen === "profile" && (
          <ProfileScreen
            walletAddress={walletAddress}
            onConnectWallet={handleSignIn}
            onDisconnectWallet={() => {
              disconnectWallet();
              showToast("Wallet disconnected");
            }}
            profileData={profileData}
            onUpdateDisplayName={handleUpdateDisplayName}
            onSelectChallenge={handleSelectChallenge}
            onBrowseChallenges={() => setScreen("browse")}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <AppBottomNav
        screen={screen}
        onNavigate={(nextScreen) => {
          setScreen(nextScreen);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        walletAddress={walletAddress}
        onConnectWallet={handleSignIn}
      />

      {/* In-App Accountability Notification Center */}
      <NotificationCenter
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => setNotifications(markAllNotificationsAsRead())}
        onNotificationClick={handleNotificationClick}
        onOpenSettings={() => {
          setNotificationsOpen(false);
          setNotifPrefsOpen(true);
        }}
        onBrowseChallenges={() => {
          setNotificationsOpen(false);
          setScreen("browse");
        }}
      />

      {/* In-App Notification Preferences Modal */}
      <NotificationPreferencesModal
        isOpen={notifPrefsOpen}
        onClose={() => setNotifPrefsOpen(false)}
        walletAddress={walletAddress}
      />

      {/* Desktop Nimiq Pay Staking Environment Guidance Modal */}
      {desktopNoticeOpen && (
        <div className="modal-overlay" onClick={() => setDesktopNoticeOpen(false)}>
          <div
            className="modal-card desktop-notice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="desktop-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setDesktopNoticeOpen(false)}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem" }} aria-hidden="true">
              <Smartphone size={40} className="text-gold" />
            </div>
            <h2 id="desktop-modal-title" style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)", textAlign: "center", marginBottom: "0.5rem" }}>
              Nimiq Pay Mobile App Required
            </h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5, textAlign: "center", marginBottom: "1.25rem" }}>
              NimStreak uses <strong>Nimiq Pay</strong> to securely authorize real NIM staking transactions. Your NimStreak profile remains connected, while Nimiq Pay handles transaction approval and determines the funding account with biometric security.
            </p>
            <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "1rem", marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                <span style={{ background: "var(--gold-gradient)", color: "#000", fontWeight: 700, borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", flexShrink: 0 }}>1</span>
                <span>Open the <strong>Nimiq Pay</strong> app on your mobile device.</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                <span style={{ background: "var(--gold-gradient)", color: "#000", fontWeight: 700, borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", flexShrink: 0 }}>2</span>
                <span>Navigate to <strong>Mini Apps</strong> and open <strong>NimStreak</strong>.</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                <span style={{ background: "var(--gold-gradient)", color: "#000", fontWeight: 700, borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", flexShrink: 0 }}>3</span>
                <span>Confirm your NIM stake with native biometric authorization!</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn--gold"
                style={{ flex: 1, padding: "0.75rem" }}
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText("https://nimstreak.vercel.app");
                    showToast("Copied app link to clipboard!");
                  }
                  setDesktopNoticeOpen(false);
                }}
              >
                Copy App Link
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ padding: "0.75rem 1.25rem" }}
                onClick={() => setDesktopNoticeOpen(false)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
