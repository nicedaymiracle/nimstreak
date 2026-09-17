<p align="center">
  <a href="https://nimstreak.vercel.app">
    <img src="client/public/nimstreak-logo.png" alt="NimStreak Logo" width="130" />
  </a>
</p>

<h1 align="center">NimStreak</h1>

<p align="center">
  <strong>Small Steps. Real Stakes. A Better You.</strong><br />
  The high-stakes habit accountability game on the Nimiq blockchain.
</p>

<p align="center">
  <a href="https://nimstreak.vercel.app"><img src="https://img.shields.io/badge/Live_App-nimstreak.vercel.app-EBB700?style=for-the-badge&logo=safari&logoColor=white" alt="Live App" /></a>
  <img src="https://img.shields.io/badge/Nimiq_2.0-Albatross_PoS-EBB700?style=for-the-badge" alt="Nimiq 2.0" />
  <img src="https://img.shields.io/badge/Nimiq_Pay-Mini_App-1F2937?style=for-the-badge" alt="Nimiq Pay" />
  <img src="https://img.shields.io/badge/Tests-78%2F78_Passing-10B981?style=for-the-badge" alt="Tests" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <a href="#-about">About</a> •
  <a href="#-the-game-loop">Game Loop</a> •
  <a href="#-why-nimstreak-works">The Psychology</a> •
  <a href="#-challenge-creation--modes">Challenges</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-core-application-screens">App Screens</a> •
  <a href="#-reward-model--quitter-pool">Reward Economics</a> •
  <a href="#-notifications-architecture">Notifications</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-financial-safety--security">Safety</a> •
  <a href="#-production-deployments">Production</a> •
  <a href="#-getting-started">Getting Started</a>
</p>

---

## 📖 About

**NimStreak** is a Nimiq-powered habit accountability Mini App that turns personal self-discipline into verifiable on-chain commitments. By staking real NIM, players put financial skin in the game to build unbreakable daily consistency. Check in every day to keep your streak alive, protect your stake, and claim bonus rewards from the **Quitter Pool** funded by participants who quit.

- **Live Frontend:** [https://nimstreak.vercel.app](https://nimstreak.vercel.app)
- **Live Backend API:** [https://nimstreak-api.fly.dev/api](https://nimstreak-api.fly.dev/api)
- **Target Network:** Nimiq 2.0 Albatross PoS Mainnet (`Network ID: 24`)

---

## 🎮 The Game Loop

Most habit trackers fail because **quitting is free**. When there are no consequences for skipping day 4 of your workout or coding sprint, your brain easily chooses comfortable defeat.

**NimStreak turns daily consistency into a high-stakes competitive game:**

```
  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
  │ 1. JOIN QUEST   │ ────► │ 2. STAKE NIM    │ ────► │ 3. CHECK IN     │
  │ Pick habit &    │       │ Deposit crypto  │       │ Tap daily before│
  │ duration (7-30d)│       │ into the pot    │       │ midnight UTC    │
  └─────────────────┘       └─────────────────┘       └────────┬────────┘
                                                               │
                                  ┌────────────────────────────┴───────────────────────────┐
                                  ▼                                                        ▼
                         ❌ Missed Check-in / Quit                          🔥 100% Days Completed
                                  │                                                        │
                                  ▼                                                        ▼
                         💀 STAKE FORFEITED                               🏆 VICTORY PAYOUT
                         Your deposit goes to the                         • 100% original stake back
                         active Quitter Pool                              • Equal share of Quitter Pool
                                  │                                       • Scaled NimStreak bonus
                                  └───────────────────────────────────────────────►┘
```

> **The Hook:** Stay disciplined and you take home the forfeited stakes of everyone who quit. Break your promise, and your coins fund the winners.

---

## 🔄 Challenge Lifecycle & Statuses

Every NimStreak challenge progresses through a deterministic, strictly verified state machine:

```
  ┌──────────────┐     ┌──────────────┐     ┌───────────────────────────────────┐
  │ 1. OPEN      │ ──► │ 2. ACTIVE    │ ──► │ 3. OUTCOME                        │
  │ Registration │     │ Daily check- │     ├─────────────────┬─────────────────┤
  │ & staking    │     │ in window    │     │ A. COMPLETED    │ B. FORFEITED    │
  └──────────────┘     └──────────────┘     │ 100% days done  │ Missed check-in │
                                            └────────┬────────┴─────────────────┘
                                                     ▼
                                            ┌─────────────────┐
                                            │ 4. PROCESSING   │
                                            │ Sequential lock │
                                            │ & treasury safe │
                                            └────────┬────────┘
                                                     ▼
                                            ┌─────────────────┐
                                            │ 5. CONFIRMED    │
                                            │ Paid on-chain or│
                                            │ retryable state │
                                            └─────────────────┘
```

1. **`open` (Registration Open):** Challenge is created, creator stake is verified on-chain, and challengers can join.
2. **`active` (Active Challenge):** Challengers check in once every 24 hours before midnight UTC to protect their streak and stake.
3. **`completed` (Streak Won):** Challenger successfully completes 100% of duration days. Eligible to claim original stake return plus bonus.
4. **`forfeited` (Stake Forfeited):** A daily check-in was missed before the deadline. The stake is moved to the challenge reward pool for finishers.
5. **`payout processing` (Verifying On-Chain):** Treasury payout has been signed and broadcast; awaiting blockchain confirmation.
6. **`paid` (Reward Paid & Confirmed):** Payout confirmed on-chain on Nimiq 2.0 with a verifiable Nimiq Watch transaction hash.
7. **`failed` (Payout Needs Retry):** If treasury check or broadcast encounters an RPC issue, state remains safely retryable without losing claim eligibility.

---

## 🧠 Why NimStreak Works

- **Loss Aversion:** Behavioral economics proves people work twice as hard to avoid losing $10 as they do to gain $10. Staking real NIM activates loss aversion for positive life change.
- **Social Accountability:** Create private challenges with friends, share invite codes, and compete on live challenge leaderboards.
- **Visible Momentum:** The interactive streak calendar turns daily discipline into tangible, colorful momentum you refuse to break.
- **Zero-Friction Crypto:** Runs natively inside the **Nimiq Pay Mini App** ecosystem with instant checkout, fast Albatross finality, and tiny transaction fees.

---

## ⚔️ Challenge Creation & Modes

NimStreak supports flexible habit commitment setups:
- **Solo Challenges:** Single-player discipline mode. Perfect for personal goals where you want skin in the game. If you complete all days, your full stake is returned with an eligible NimStreak completion bonus.
- **Challenges with Friends & Groups:** Multiplayer community pots where participants share a communal reward pool. Participants who miss check-ins forfeit their stakes to the finishers.
- **Custom Parameters:**
  - **Category:** Fitness (💪), Learning (📚), Coding (💻), Health (🥗), Mindfulness (🧘), Finance (💰), Custom (🎯).
  - **Duration:** 7 Days, 14 Days, 21 Days, or 30 Days.
  - **Stake Amount:** Flexible commitment between 0.5 NIM and 100 NIM.
  - **Access Mode:** Public discovery in Browse or Private challenge with a unique 6-character invite code (e.g. `STREAK`, `CODE26`).

---

## ⚡ How It Works

### Step 1: Connect Nimiq Pay
Tap **"Continue with Nimiq Pay"** to link your non-custodial wallet inside the Mini App environment. No seed phrases to enter, no complex network switches. Users outside Nimiq Pay can connect via standard Nimiq Wallet or paste an address for view mode.

### Step 2: Choose or Create a Challenge
Browse trending community challenges in Browse or spin up your own custom challenge with customized duration and stakes.

### Step 3: Stake Your NIM
Confirm your stake transaction through Nimiq Pay. The backend verifies the transaction directly on the Nimiq blockchain via RPC before granting you active participant status. Anti-replay protection ensures transaction hashes cannot be reused.

### Step 4: Check In Daily
Open NimStreak once per day before midnight UTC and hit **"Check In"**. Add optional proof notes or reflections to chronicle your journey. Watch your streak flame climb!

### Step 5: Claim Your Rewards
Survive the challenge to cross the finish line. Claim your prize directly back to your Nimiq address with a single tap, verified on-chain.

---

## 📱 Core Application Screens

---

### 1. 🌟 The Landing & Welcome Page
> *Floating habit universe, compact sign-in, and friction-free Web3 onboarding.*

<p align="center">
  <img src="docs/screenshots/landing-page.png" alt="NimStreak Landing Page" width="850" />
</p>

The **Landing Page** welcomes challengers into an interactive, gamified habit ecosystem:
- **Floating Habit Canvas:** A lively animated background of ambient challenge cards (*"Wake Up at 6:00 AM"*, *"7 Days of Coding"*, *"50 Pushups Daily"*, *"Meditate Daily"*, *"Read 25 Pages"*, *"No Social Media"*) showcasing real habit commitments happening across the network.
- **Compact Sign-In Card:** Streamlined, focused interface centered around the primary *"Continue with Nimiq Pay"* CTA, secondary Nimiq Wallet option, and invite code detection pill.
- **Interactive Onboarding Modal:** Newcomers can tap *"What is NimStreak? Learn More"* to view a step-by-step explainer breakdown of how staking, daily check-ins, and the Quitter Pool work before connecting.

---

### 2. ⚡ The Player Dashboard (Home)
> *Your daily mission control center and habit launchpad.*

<p align="center">
  <img src="docs/screenshots/home-dashboard.png" alt="NimStreak Player Dashboard" width="850" />
</p>

The **Player Dashboard** serves as the central mission control once your wallet is connected:
- **4-Step Habit Loop Quick Guide:** Directly reinforces the core discipline cycle—*Choose a Habit* ➔ *Stake NIM* ➔ *Check In Daily* ➔ *Finish Your Streak*.
- **Instant Launch CTAs:** One-click shortcuts to create a challenge or browse active community pots.
- **Live Platform Activity Feed:** Real-time on-chain stats displaying active challengers, total NIM staked across active pots, and current streaks network-wide.

---

### 3. 🔍 Browse & Discover Challenges
> *Explore community pots, filter by habit category, or enter VIP invite codes.*

<p align="center">
  <img src="docs/screenshots/browse-challenges.png" alt="NimStreak Browse Challenges" width="850" />
</p>

The **Browse Page** is where players discover active challenges created by other streakers:
- **Private Invite Code Portal:** Dedicated entry field allowing players to join exclusive private challenges using 6-character access codes (e.g. `STREAK`, `GYM2026`).
- **Instant Search & Filter Chips:** Fast keyword search across habit titles alongside category filter tabs (Fitness, Learning, Coding, Health, Mindfulness, Finance).
- **Active-Only Discovery Guard:** Expired, completed, or inactive challenges are automatically filtered out from public discovery.
- **Challenge Cards:** Rich preview cards showing entry stake requirements (e.g. `5 NIM`), duration (`7 Days`), active participant headcount, and total accumulated prize pool.

---

### 4. 🏆 Challenge Detail, Results & Sharing
> *Detailed habit view, live participant leaderboard, results breakdown, and repeat challenges.*

The **Challenge Detail** screen adapts to every lifecycle state:
- **Consistent Lifecycle Status Pills:** Clear visual tags indicating whether registration is open, active check-in is pending/secured, or payout verification is processing.
- **Public / Unauthenticated Challenge Preview:** Shared challenge links (`/?challenge=<id>&invite=<code>`) allow visitors to view full public challenge information without connecting a wallet first.
- **Clean Challenge Sharing:** Native mobile Web Share API with clipboard fallback generates structured invitations:
  ```text
  🔥 Join my NimStreak challenge: 7 Days of Coding
  🎯 Stake: 5 NIM
  ⏱️ Duration: 7 Days
  Join here: https://nimstreak.vercel.app/?challenge=chal-123
  ```
- **Challenge Results Breakdown:** Completed challenges display a full post-quest analysis:
  - Total Participants, Finishers, and Forfeited Participants
  - Days Completed (`7/7 Days`)
  - 100% Original Stake Return + Forfeited Pool Share + NimStreak Bonus
  - On-Chain Payout Status with direct Nimiq Watch explorer link
- **Repeat Challenge:** One-tap action for finished challenges pre-fills the Create Challenge form (Title, Description, Category, Duration, Stake) for the user to review and authorize. Never automatically stakes funds without user approval.

---

### 5. 🔥 My Streaks & Habit Tracker
> *Active commitment tracker, streak flame counter, and trophy showcase.*

<p align="center">
  <img src="docs/screenshots/my-streaks.png" alt="NimStreak My Streaks" width="850" />
</p>

The **My Streaks Page** is where daily consistency is monitored and celebrated:
- **Top Performance Trophies:** Instant view of your current **Active Streak**, total **NIM Earned** from bonus payouts, and total **Goals Won**.
- **Badges & Achievements Trophy Case:** Unlocks dynamic achievements as you level up your consistency (*First Step*, *7 Day Streak*, *30 Day Streak*, *100 Day Streak*, *Challenge Winner*, *Iron Will*).
- **Lifecycle Tabs with Actionable Empty States:**
  - **Active:** View live challenges, countdown timers, and tap daily check-ins. Actionable shortcuts to browse or create when empty.
  - **Completed:** View completed victories with results breakdown, repeat challenge actions, and on-chain claim buttons.
  - **Forfeited:** Historical archive of broken streaks with encouraging feedback to restart.

---

### 6. 👤 Player Profile & Transaction History
> *Decoupled wallet identity, customizable profile, lifetime consistency stats, and verified transaction history.*

<p align="center">
  <img src="docs/screenshots/player-profile.png" alt="NimStreak Player Profile" width="850" />
</p>

The **Player Profile** showcases your verifiable blockchain reputation:
- **Identicon & Display Name:** Features your deterministic Nimiq Identicon avatar and editable streaker alias (e.g. `Streaker_QC0T`).
- **Decoupled Wallet Identity:** Displays your stable profile ID (`NQ60...QC0T`) with one-click copy, keeping your stats persistent even when switching signing accounts in Nimiq Pay.
- **Habit Performance Metrics Grid:** Active streak, best streak, NIM won, total staked, completed challenges, and forfeited count.
- **Verified Transaction History:** Real-time on-chain transaction log populated from verified blockchain records:
  - **Types:** Stake Committed (`-X NIM`), Stake + Reward Payout (`+X NIM`), Bonus Reward (`+X NIM`)
  - **Filters:** All, Stakes, Payouts
  - **Status:** Confirmed (green), Pending / Verifying (gold), Failed (red)
  - **Explorer Links:** Direct link to every transaction hash on Nimiq Watch (`https://nimiq.watch/#<hash>`)
  - **Actionable Empty State:** Quick CTA to browse active challenges when no transactions exist.

---

### 7. 🔔 Dual Device Push & In-App Notification Center
> *True background device push notifications with seamless in-app fallback and anti-spam accountability.*

NimStreak delivers real phone/device notifications to keep you on track, powered by a backend scheduler and W3C Web Push:
- **True Background Device Notifications:** On supported mobile and desktop browsers (Android Chrome/Firefox, iOS 16.4+ Home Screen PWA, desktop browsers), notifications arrive on your device lock screen even when NimStreak is completely closed.
- **Seamless Nimiq Pay In-App Fallback:** Inside Nimiq Pay's mobile WebView (where OS push bridges are restricted), NimStreak automatically falls back to the in-app **Notification Center** (bell icon in top navigation) with immediate real-time delivery.
- **6 Accountability Notification Types:**
  1. 🔥 **Daily Check-in:** *"🔥 Time to check in: [Challenge Title]. You haven't checked in today. Keep your streak alive!"* Sent at the user's configured reminder time.
  2. ⚠️ **Streak at Risk:** *"⚠️ Streak at Risk: [Challenge Title]. You haven't checked in today! Only a few hours remain to protect your stake."* Dispatched late in the evening if still uncompleted.
  3. 🚀 **Challenge Starting:** *"🚀 Challenge Started: [Challenge Title] is now live! Day 1 is waiting for you."* Sent to participants on the start date.
  4. 🎉 **Challenge Completed:** *"🎉 Challenge Completed: [Challenge Title]! Congratulations! You conquered all days. Your stake has been reclaimed."*
  5. 💰 **Reward Confirmed:** *"💰 Reward Confirmed on Nimiq! [X] NIM reward has been confirmed on-chain. Tap to view transaction."* Strictly triggered **only after** on-chain payout confirmation.
  6. 👀 **Challenge Invitation:** *"👀 You've been invited to a NimStreak challenge. Think you can finish it?"*
- **Actionable Deep Links:** Tapping a notification opens NimStreak directly at the relevant screen:
  - Daily Check-in & Streak at Risk → Relevant Challenge Detail (`/?challenge=<id>`)
  - Challenge Starting → Relevant Challenge Detail (`/?challenge=<id>`)
  - Challenge Completed → Challenge Results (`/?challenge=<id>&view=results`)
  - Reward Confirmed → Profile Transaction History (`/?screen=profile&tab=transactions`)
  - Invitation → Challenge Preview (`/?challenge=<id>&invite=<code>`)
- **Backend Scheduler Source of Truth:**
  - A persistent server-side scheduler (`server/src/notification-scheduler.js`) runs periodically and in daily cron routines.
  - Does NOT rely on frontend timers or keep-alive loops that stop when the tab or app is closed.
- **Notification Preferences & Permission Flow:**
  - Dedicated notification settings modal with custom alert times (Morning, Midday, Afternoon, Evening, Night).
  - Category toggles for Daily Reminders, Challenge Lifecycle, Rewards, and Invitations.
  - Transparent device push status badge: *Active*, *Blocked in Browser*, *Available*, or *In-App Mode (Nimiq Pay)*.
  - Graceful permission handling: never repeatedly nags users who declined browser notification prompts.
- **Strict Anti-Spam & Deduplication Rules:**
  - Maximum 1 daily reminder per active challenge per day.
  - **Zero reminders if the participant has already checked in today.**
  - Exactly 1 completion notification per challenge.
  - Exactly 1 reward confirmation notification per confirmed transaction hash.
  - Zero duplicate alerts triggered simply by reopening the application.

---

## 💰 Reward Model & Quitter Pool

NimStreak implements a mathematically balanced, non-inflationary reward economy:

```
  Total Finisher Payout = Original Stake Return + Share of Quitter Pool + NimStreak Bonus
```

### 1. 100% Forfeited Pool Distribution
When participants miss a daily check-in, their full stake is forfeited and placed into the challenge Quitter Pool. Upon challenge completion, **100% of this pool is distributed equally** among all surviving finishers.

### 2. Individual Bonus Cap
To preserve healthy habit-forming incentives while preventing runaway treasury depletion, an optional platform bonus is awarded up to **50% of original stake**, capped at a maximum of **5 NIM per individual finisher**.

### 3. Challenge Bonus Cap
To protect treasury solvency, the total bonus payout across **all finishers in a single challenge can never exceed 20 NIM**. If 100 players finish a 10 NIM challenge, the bonus scales proportionally so total liability is strictly bounded:

```
  Bonus Per Finisher = min(5 NIM, (20 NIM / Number of Finishers), 50% of Stake)
```

### 📊 Example Scenario (4 Players, 10 NIM Stake Each)

| Player | Stake | Status | Stake Return | Quitter Share | Bonus | Total Payout |
|---|---|---|---|---|---|---|
| **Alice** | 10 NIM | Completed 🔥 | 10 NIM | +10 NIM | +5 NIM | **25 NIM** (+150%) |
| **Bob** | 10 NIM | Completed 🔥 | 10 NIM | +10 NIM | +5 NIM | **25 NIM** (+150%) |
| **Charlie** | 10 NIM | Quit Day 3 💀 | 0 NIM | 0 NIM | 0 NIM | **0 NIM** |
| **Dave** | 10 NIM | Quit Day 5 💀 | 0 NIM | 0 NIM | 0 NIM | **0 NIM** |

*Quitter Pool = 20 NIM (Charlie + Dave). Split equally between Alice and Bob.*

---

## 🎯 Key Game Features

- 🔥 **Dynamic Streak Flame & Heatmap:** Interactive visual calendar tracking every active and past check-in.
- ⚡ **Instant Nimiq Pay Staking:** Seamless one-click blockchain transactions.
- 🛡️ **Anti-Replay Verification:** Cryptographically validates transaction hashes on-chain before admitting participants.
- 🏆 **Global & Challenge Leaderboards:** Compete for the longest streaks and most disciplined habits.
- 🎖️ **Badge & Achievement System:** Unlock badges like *First Step*, *7-Day Warrior*, and *Centurion*.
- 🔗 **Private Challenges & Invite Codes:** Generate custom 6-character codes to rally your team, gym buddies, or DAO.
- 📱 **Mobile-First Responsive Design:** Built specifically for modern mobile viewports inside the Nimiq Pay webview.
- 🔔 **Dual Push & In-App Notifications:** Anti-spam notification engine with customizable reminder times and deduplication.
- 📜 **On-Chain Transaction History:** Verified ledger of every stake committed and payout received with Nimiq Watch links.
- 🔄 **Repeat Challenge & Deep Link Preview:** Instant challenge rematches and unauthenticated public preview of shared challenges.
- 🔒 **Sequential Payout Mutex:** Server-side async lock prevents double-claims and race conditions during simultaneous reward withdrawals.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Nimiq Pay Mini App                            │
│           React 18 + Vite SPA (Hosted on Vercel)                       │
│    Nimiq Mini App SDK • Identicons • GSAP Animation Engine             │
│    Service Worker (/sw.js) • Web Push Client Manager                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS REST + WebSocket
┌───────────────────────────────────▼────────────────────────────────────┐
│                         NimStreak Core API                             │
│               Node.js + Express (Hosted on Fly.io)                     │
│  • On-chain RPC verification         • Daily streak evaluator          │
│  • Payout lock & mutex queue         • Challenge & checkin management  │
│  • VAPID Web Push Scheduler          • Anti-spam dedup registry        │
└───────────────────┬─────────────────────────────────┬──────────────────┘
                    │                                 │
┌───────────────────▼─────────────┐     ┌─────────────▼──────────────────┐
│        Google Cloud             │     │      Nimiq 2.0 Blockchain      │
│      Cloud Firestore            │     │       Albatross PoS Mainnet    │
│  • Challenges & participants    │     │  • Stake transaction receipt   │
│  • Push subscriptions & logs    │     │  • Liquid treasury balance     │
│  • Anti-replay hash index       │     │  • Automated payout broadcast  │
│  • Daily check-in timestamps    │     │  • Verifiable block hashes     │
└─────────────────────────────────┘     └────────────────────────────────┘
```

---

## 👤 Wallet Identity Architecture

NimStreak decouples **Profile Identity** from **On-chain Funding Wallets**:
- **Stable Profile (`NQ48...`):** Your persistent identity. Stores your badges, streak statistics, display name, and active challenge roster.
- **Funding Wallet (`NQ77...`):** The actual blockchain address that signed and broadcast the stake transaction.
- **Safety First:** Payouts are sent directly to the verified funding address that deposited the stake, preventing impersonation attacks while allowing multi-account Nimiq Pay users to keep all their stats under one roof.

---

## 🔒 Financial Safety & Security

- **Strict Luna Arithmetic:** All calculations use native Nimiq Luna integers (`1 NIM = 100,000 Luna`) via JavaScript `BigInt`. Zero floating-point drift.
- **Mutex Payout Queue:** Payout requests are executed sequentially through an in-memory lock, eliminating double-spending concurrency races.
- **Treasury Null Guard:** If Nimiq RPC is unreachable or returns `null` for the treasury balance, payouts **fail safely before broadcast**, preserving claim eligibility for retry.
- **On-Chain Confirmation:** A payout is only finalized in the database after the transaction is confirmed on the Nimiq Albatross blockchain.
- **Anti-Replay Protection:** Every incoming stake hash is recorded in a dedicated uniqueness index to prevent replaying past transactions.
- **Server-Side Secret Isolation:** Private keys, Firebase service accounts, and VAPID private keys are strictly loaded via environment variables and never leaked to the client.

---

## ⚠️ Known Limitations & Transparency

- **Nimiq Pay WebView Push Limitation:** While NimStreak fully supports real background device push notifications (Web Push + Service Worker) in normal mobile browsers (Android Chrome/Firefox and iOS 16.4+ PWA), embedded WebViews inside the Nimiq Pay mobile app do not expose native push notification bridges or background service worker push reception. For users running strictly inside Nimiq Pay, NimStreak gracefully falls back to the in-app Notification Center, ensuring 100% feature coverage without missed accountability.
- **Treasury Custody Model:** Stakes are held in the secure NimStreak treasury rather than a smart contract. The competition version prioritizes rapid settlement and seamless user experience over decentralized escrow.
- **Self-Reported Check-ins:** Proof is currently based on honor-system check-ins and reflections. Automatic biometric/GPS verification is slated for future milestones.
- **Single-Node Mutex:** The in-memory payout queue secures a single backend instance. Multi-region horizontal scaling will adopt Redis-backed distributed locks.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Client** | React 18, Vite 7, GSAP animations, Nimiq Mini App SDK, Nimiq Identicons, Service Worker |
| **Server** | Node.js 20, Express, Socket.IO, Web-Push (RFC 8291/8292), `@nimiq/core` (Albatross v2) |
| **Storage** | Google Cloud Firestore (with in-memory fallback for local development & testing) |
| **Network** | Nimiq 2.0 Albatross PoS Mainnet (`Network ID: 24`) |
| **Infra** | Vercel (Frontend SPA) • Fly.io (Backend API) |

---

## 🌐 Production Deployments

| Component | Target URL | Description |
|---|---|---|
| **Frontend Web App** | [https://nimstreak.vercel.app](https://nimstreak.vercel.app) | Production SPA on Vercel |
| **Backend API** | [https://nimstreak-api.fly.dev/api](https://nimstreak-api.fly.dev/api) | Production API on Fly.io |
| **Health Endpoint** | [https://nimstreak-api.fly.dev/api/health](https://nimstreak-api.fly.dev/api/health) | API liveness & network status |
| **VAPID Public Key** | [https://nimstreak-api.fly.dev/api/notifications/vapid-public-key](https://nimstreak-api.fly.dev/api/notifications/vapid-public-key) | Web Push encryption public key |

---

## 📂 Project Structure

```
nimstreak/
├── client/                      # React + Vite Frontend
│   ├── public/                  # Static assets, logos, and Service Worker (sw.js)
│   ├── src/
│   │   ├── components/
│   │   │   ├── screens/         # Welcome, Home, Browse, Detail, My Streaks, Profile
│   │   │   └── ui/              # Modals, Navigation, Notifications, Badges, Heatmap
│   │   ├── config/              # API and Nimiq network configuration
│   │   ├── hooks/               # useNimiqWallet and Web3 account resolution
│   │   └── utils/               # Formatting, animations, device notifications, identicons
│   └── package.json
├── server/                      # Node.js Express Backend
│   ├── src/
│   │   ├── index.js             # HTTP routes, push endpoints & WebSocket handlers
│   │   ├── db.js                # Firestore database & memory fallback
│   │   ├── notification-scheduler.js # VAPID push engine & scheduler
│   │   ├── nimstreak-payout.js  # Payout engine, mutex & bonus math
│   │   └── constants/           # Network endpoints
│   ├── tests/                   # Test suite (78 tests, 9 suites)
│   └── package.json
├── .gitignore
├── LICENSE                      # MIT
├── README.md
└── vercel.json                  # Frontend deployment routing
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- A modern browser with Nimiq Pay or Nimiq Hub wallet

### 1. Clone & Install

```bash
git clone https://github.com/nicedaymiracle/nimstreak.git
cd nimstreak

# Install client & server
cd client && npm install
cd ../server && npm install
```

### 2. Environment Setup

**Client (`client/.env.local`):**
```env
VITE_API_BASE_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
VITE_NIMIQ_NETWORK=mainnet
VITE_NIMIQ_TREASURY_ADDRESS=NQ68LS475LF6C7CUMVB6KL55YSFGPEXJADJ0
```

**Server (`server/.env`):**
```env
PORT=4000
NIMIQ_RPC_URL=https://rpc.nimiqwatch.com
NIMIQ_TREASURY_ADDRESS=NQ68LS475LF6C7CUMVB6KL55YSFGPEXJADJ0
NIMIQ_TREASURY_PRIVATE_KEY=your_private_key_here
FIREBASE_SERVICE_ACCOUNT=your_service_account_json_here
ADMIN_TOKEN=your_admin_secret
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:team@nimstreak.app
```

### 3. Run Development Servers

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🧪 Testing

NimStreak features a comprehensive 78-test automated test suite across 9 suites:

```bash
npm test --prefix server
```

```
✔ Challenge Discovery & Stale Filter Safety Layer
✔ Challenge Lifecycle, Transactions & Accountability Notifications
✔ Device Notifications & Background Push Scheduler
✔ NimStreak Persistence Layer (Firestore & In-Memory Fallback)
✔ First Step Badge Awarding and Retrieval Flow
✔ Nimiq Mainnet RPC & Network Endpoints
✔ NimStreak Hybrid Bonus Funding & Financial Safety Engine
✔ Nimiq 2.0 Network ID & Payout Confirmation
✔ Payout Database Recovery & Idempotency
✔ Minimal Stable Wallet Identity Architecture

ℹ tests 78 | suites 9 | pass 78 | fail 0
```

To run frontend production build validation:

```bash
npm run build --prefix client
```

---

## 🗺️ Roadmap

- [ ] **Smart Contract Escrow:** Transition from treasury custody to trustless on-chain Nimiq escrow contracts.
- [ ] **External Activity Integrations:** Connect Strava, GitHub API, and Apple Health for verified automated check-ins.
- [ ] **Multi-Day Grace Periods:** Streak recovery passes for emergency situations.
- [ ] **Challenge NFT Badges:** Commemorative on-chain badges for major milestone completions.
- [ ] **Distributed Payout Locks:** Redis Redlock integration for multi-region clustering.

---

## 📜 License

Distributed under the MIT License. See [LICENSE](./LICENSE) for details.
