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

export default function App() {
  const [screen, setScreen] = useState("home");
  const [selectedChallengeId, setSelectedChallengeId] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [myChallengesData, setMyChallengesData] = useState({ all: [], active: [], completed: [], failed: [] });
  const [profileData, setProfileData] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      setScreen("home");
    }
  };

  const handleManualConnect = (address) => {
    const formatted = setManualAddress(address);
    if (formatted) {
      showToast(`🔥 Connected as ${shortenWalletAddress(formatted, 4, 4)}`);
      setScreen("home");
    }
  };

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

      showToast("🔐 Please confirm stake payment in your Nimiq wallet...");
      const paymentResult = await sendNimiqPayment({
        recipient: DEFAULT_TREASURY_ADDRESS,
        amountNim: params.stakeNim,
        message: `NimStreak: ${params.title.slice(0, 20)}`,
      });

      const txHash = paymentResult?.hash || paymentResult?.transactionHash;
      if (!txHash) {
        throw new Error("No transaction hash returned from Nimiq wallet.");
      }

      const verifiedSender = paymentResult?.sender || params.walletAddress || walletAddress;

      showToast("⏳ Verifying on-chain stake transaction...");

      const res = await fetch(`${API_BASE_URL}/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          walletAddress: verifiedSender,
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
      showToast(`❌ ${err.message || "Failed to create challenge"}`);
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

      showToast(`🔐 Please confirm ${stakeAmount} NIM stake in your wallet...`);
      const paymentResult = await sendNimiqPayment({
        recipient: DEFAULT_TREASURY_ADDRESS,
        amountNim: stakeAmount,
        message: `NimStreak Stake Join`,
      });

      const txHash = paymentResult?.hash || paymentResult?.transactionHash;
      if (!txHash) {
        throw new Error("No transaction hash returned from Nimiq wallet.");
      }

      const verifiedSender = paymentResult?.sender || walletAddress;

      showToast("⏳ Verifying on-chain stake transaction...");

      const res = await fetch(`${API_BASE_URL}/challenges/${challengeId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: verifiedSender,
          stakeAmount,
          stakeTxHash: txHash,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to join challenge");
      }

      showToast("🎉 Successfully staked and joined challenge!");
      await fetchChallenges();
      await fetchUserData();
    } catch (err) {
      showToast(`❌ ${err.message || "Failed to join challenge"}`);
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
      showToast(`🔐 Please confirm ${stakeAmount} NIM stake in your wallet...`);
      const paymentResult = await sendNimiqPayment({
        recipient: DEFAULT_TREASURY_ADDRESS,
        amountNim: stakeAmount,
        message: `NimStreak Code Join ${inviteCode}`,
      });

      const txHash = paymentResult?.hash || paymentResult?.transactionHash;
      if (!txHash) {
        throw new Error("No transaction hash returned from Nimiq wallet.");
      }

      const verifiedSender = paymentResult?.sender || walletAddress;

      showToast("⏳ Verifying on-chain stake transaction...");

      const res = await fetch(`${API_BASE_URL}/challenges/join-by-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: verifiedSender,
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

    showToast(`💎 Payout sent! ${json.amountNim} NIM transferred to your wallet.`);
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

  // REQUIREMENT: User must be signed in with wallet to view main interface
  if (!walletAddress) {
    return (
      <div className="nimstreak-app">
        {toastMessage && (
          <div className="toast-notification">
            <span>{toastMessage}</span>
          </div>
        )}
        <WelcomeScreen
          onSignIn={handleSignIn}
          onManualConnect={handleManualConnect}
          isConnecting={isConnecting}
          walletStatus={walletStatus}
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
          <span className="brand-flame">🔥</span>
          <span className="brand-name">Nim<span className="brand-name--gold">Streak</span></span>
        </div>

        <div className="top-nav-right">
          <button
            type="button"
            className="wallet-pill-btn"
            onClick={() => setScreen("profile")}
          >
            <NimiqIdenticon address={walletAddress} size={22} />
            <span className="wallet-pill-addr">{shortenWalletAddress(walletAddress, 4, 4)}</span>
            {walletBalance !== undefined && (
              <span className="wallet-pill-bal">{walletBalance} NIM</span>
            )}
          </button>
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
            globalStats={globalStats}
            onSelectChallenge={handleSelectChallenge}
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
          />
        )}

        {screen === "create-challenge" && (
          <CreateChallengeScreen
            walletAddress={walletAddress}
            onConnectWallet={handleSignIn}
            onCreateChallenge={handleCreateChallenge}
            onCancel={() => setScreen("home")}
            submitting={submitting}
          />
        )}

        {screen === "challenge-detail" && selectedChallengeId && (
          <ChallengeDetailScreen
            challengeId={selectedChallengeId}
            walletAddress={walletAddress}
            onConnectWallet={handleSignIn}
            onCheckin={handleCheckin}
            onJoinChallenge={handleJoinChallenge}
            onClaim={handleClaimReward}
            onBack={() => setScreen("browse")}
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
    </div>
  );
}
