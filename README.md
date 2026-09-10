# NimStreak

> **Small Steps. Real Stakes. A Better You.**

NimStreak is a Nimiq-powered habit accountability Mini App that lets users commit NIM to personal goals, check in throughout a challenge, and receive their stake back plus a share of forfeited stakes and an additional NimStreak bonus when they successfully complete their streak.

🎯 **Live:** https://nimstreak.vercel.app

---

## Why NimStreak?

Most habit trackers make it easy to start a challenge but impose no meaningful consequence for quitting. NimStreak changes this by adding **financial accountability through NIM**.

When you join a challenge, you stake real NIM. Completing your streak returns your stake — plus a share of the forfeited stakes from everyone who quit — plus a NimStreak bonus. Walking away means your stake goes to the finishers who kept their commitment.

---

## How It Works

1. **Connect Nimiq Pay** — link your Nimiq wallet inside the NimiqPay Mini App environment
2. **Choose or create a challenge** — pick a public challenge, join by invite code, or create your own
3. **Stake NIM** — transfer your stake on-chain to confirm participation (minimum 0.5 NIM)
4. **Check in daily** — tap "Check In" each day of the challenge to record your progress
5. **Complete the challenge** — finish all required days to become an eligible finisher
6. **Receive eligible rewards** — claim your stake return, forfeited pool share, and NimStreak bonus

> **Note:** Daily habit completion currently relies on user check-ins and optional proof description, not automatic verification of physical activity.

---

## Features

- ✅ Nimiq Pay wallet connection
- ✅ Create public and private challenges
- ✅ NIM staking with on-chain transaction verification
- ✅ Daily check-ins with streak calendar
- ✅ Challenge leaderboards
- ✅ Forfeited-stake reward pool (100% distributed to finishers)
- ✅ NimStreak bonus payout
- ✅ Invite codes and challenge sharing
- ✅ First Step badge for challenge creation
- ✅ Profile and streak statistics
- ✅ Anti-replay protection
- ✅ Payout idempotency and stale recovery
- ✅ Treasury balance guard
- ✅ Sequential payout execution (concurrency-safe)
- ✅ BigInt Luna accounting

---

## Reward Model

### Individual NimStreak Bonus

```
individualBonus = min(originalStake × 50%, 5 NIM)
```

### Challenge-Wide Bonus Cap

The total NimStreak bonus across all finishers in a single challenge is capped at **20 NIM**. When the sum of individual theoretical bonuses exceeds this cap, bonuses are proportionally scaled using integer Luna accounting with deterministic remainder distribution.

### Forfeited Pool

100% of forfeited stakes are distributed proportionally among eligible finishers. The NimStreak treasury takes **0% fee** from the forfeited pool.

### Total Eligible Payout

```
Total = original stake return
      + share of 100% forfeited pool
      + actual scaled NimStreak bonus
```

### Example

> A, B, C, and D each stake **10 NIM**.
> A and B complete the challenge. C and D forfeit.
>
> Forfeited pool = 20 NIM → each finisher receives 10 NIM
> Individual bonus = min(10 × 50%, 5) = 5 NIM per finisher
> Total bonus = 10 NIM → within the 20 NIM challenge cap (no scaling needed)
>
> **A and B each receive:**
> - 10 NIM stake return
> - 10 NIM forfeited pool share
> - 5 NIM NimStreak bonus
> - **= 25 NIM total**

*Actual payouts depend on challenge participation, stake amounts, and the 20 NIM bonus cap.*

---

## Nimiq Integration

- **Nimiq Pay** handles wallet connection and payment interaction within the Mini App environment
- **Stakes** are transferred on-chain from the user's wallet to the configured NimStreak treasury address
- **The backend verifies** the stake transaction on-chain before activating participation
- **Payouts** are sent on-chain from the treasury to the claimant's wallet address
- **Payout finality** requires on-chain confirmation before the payout record is marked as successful

> **Transparency:** The current version uses a treasury-based custody model. Stakes flow into the NimStreak treasury and are disbursed by the backend. This is not a trustless smart contract escrow. The competition version prioritises speed of delivery over full decentralisation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   NimiqPay Mini App                      │
│   React + Vite (Vercel)                                  │
│   NimiqPay SDK → wallet connection + stake payment       │
└───────────────────────┬─────────────────────────────────┘
                        │ REST + WebSocket (Socket.IO)
┌───────────────────────▼─────────────────────────────────┐
│                   NimStreak Backend                       │
│   Node.js + Express (Fly.io)                             │
│   - Challenge CRUD                                       │
│   - Check-in processing                                  │
│   - Transaction verification (Nimiq RPC)                 │
│   - Payout engine with mutex + treasury guard            │
└──────────┬───────────────────────────┬───────────────────┘
           │                           │
┌──────────▼────────┐      ┌───────────▼──────────────────┐
│  Firebase         │      │  Nimiq Albatross Network      │
│  Firestore        │      │  - Stake verification (RPC)   │
│  (DB + profiles)  │      │  - Payout broadcast (RPC)     │
└───────────────────┘      │  - On-chain confirmation      │
                           └──────────────────────────────┘
```

---

## Wallet Identity

NimStreak maintains a **stable profile identity** (the address used to register the profile) while preserving the actual Nimiq Pay **funding address** used for on-chain stake transactions.

This allows users whose active signing wallet changes between sessions to retain their challenge history, streak stats, and badge records under a consistent profile.

---

## Security

- Server-side transaction verification against the Nimiq RPC
- On-chain confirmation required before participation is activated
- Anti-replay protection (stake transaction hashes are recorded and rejected if reused)
- Payout idempotency (duplicate claim requests are detected and rejected)
- Stale payout recovery (unconfirmed payouts from previous attempts are resolved before retrying)
- Treasury balance guard (payout is blocked if available balance cannot be verified)
- Unknown treasury balance blocks payout (null balance = abort, not proceed)
- Sequential payout execution via in-memory promise-chain mutex
- BigInt Luna accounting throughout (no floating point)
- Deterministic remainder distribution for bonus scaling
- All secrets supplied through environment variables — no credentials in source code

> No third-party security audit has been performed on this codebase.

---

## Known Limitations

- Daily habit completion is based on user self-reported check-ins — external activity verification is not implemented
- Payout custody relies on the NimStreak treasury; this is not a trustless escrow
- The in-memory payout mutex protects a single backend process but is not a distributed lock — horizontal scaling would require an external distributed lock (e.g., Redis-based)
- Production-scale treasury management requires additional operational controls beyond what is currently implemented
- Automatic rollback of the challenge forfeiture model for edge cases (e.g., all participants forfeit) has not been explicitly tested at scale

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, CSS animations |
| Backend | Node.js, Express, Socket.IO |
| Database | Firebase Firestore |
| Blockchain | Nimiq Albatross (PoS Mainnet) |
| Wallet | Nimiq Pay Mini App SDK |
| Frontend Hosting | Vercel |
| Backend Hosting | Fly.io |

---

## Project Structure

```
nimstreak/
├── client/                  # React + Vite Mini App frontend
│   ├── src/
│   │   ├── components/      # UI components and screens
│   │   ├── config/          # API URLs, Nimiq config
│   │   ├── hooks/           # useNimiqWallet hook
│   │   └── utils/           # Frontend utility helpers
│   ├── index.html
│   └── package.json
├── server/                  # Node.js backend
│   ├── src/
│   │   ├── index.js         # Express API + Socket.IO
│   │   ├── db.js            # Firestore / in-memory DB
│   │   ├── nimstreak-payout.js  # Payout engine, mutex, financial safety
│   │   └── redis.js         # Redis client (Socket.IO adapter)
│   ├── tests/               # Server test suite
│   └── package.json
├── .gitignore
├── LICENSE                  # MIT
├── README.md
└── vercel.json              # Vercel deployment config
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Nimiq Pay compatible environment (or browser wallet for local testing)
- Firebase project (optional — falls back to in-memory DB for development)

### Clone & Install

```bash
git clone https://github.com/nicedaymiracle/nimstreak.git
cd nimstreak

# Install client dependencies
cd client && npm install

# Install server dependencies
cd ../server && npm install
```

### Environment Configuration

**Client** — create `client/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
VITE_NIMIQ_NETWORK=mainnet
VITE_NIMIQ_TREASURY_ADDRESS=<your_treasury_address>
VITE_NIMIQ_HUB_URL=https://hub.nimiq.com
```

**Server** — create `server/.env`:

```env
PORT=4000
NIMIQ_RPC_URL=<nimiq_rpc_endpoint>
NIMIQ_TREASURY_ADDRESS=<your_treasury_address>
NIMIQ_TREASURY_PRIVATE_KEY=<secret — never commit>
FIREBASE_SERVICE_ACCOUNT=<base64_encoded_service_account_json>
ADMIN_TOKEN=<your_admin_token>
MIN_STAKE_NIM=0.5
MAX_STAKE_NIM=100
```

### Run Development Servers

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm run dev
```

---

## Environment Variables

### Server

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 4000) |
| `NIMIQ_RPC_URL` | Yes | Nimiq Albatross RPC endpoint |
| `NIMIQ_TREASURY_ADDRESS` | Yes | Treasury wallet address (NQ…) |
| `NIMIQ_TREASURY_PRIVATE_KEY` | **Secret** | Treasury signing key — never commit |
| `FIREBASE_SERVICE_ACCOUNT` | Yes (prod) | Base64 service account JSON |
| `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` | Alt | Path to service account file |
| `ADMIN_TOKEN` | Yes | Admin endpoint auth token |
| `MIN_STAKE_NIM` | No | Minimum stake (default: 0.5) |
| `MAX_STAKE_NIM` | No | Maximum stake (default: 100) |
| `SKIP_TX_VERIFICATION` | Dev only | Bypass on-chain TX checks in tests |

### Client

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Backend API base URL |
| `VITE_SOCKET_URL` | Yes | Socket.IO server URL |
| `VITE_NIMIQ_NETWORK` | Yes | `mainnet` or `testnet` |
| `VITE_NIMIQ_TREASURY_ADDRESS` | Yes | Treasury address shown to users |
| `VITE_NIMIQ_HUB_URL` | No | Nimiq Hub URL override |

---

## Testing

```bash
cd server && npm test
```

The test suite validates:
- NimStreak financial engine (reward model, bonus cap, Luna accounting)
- Payout concurrency safety (mutex, treasury null guard, balance checks)
- Wallet identity architecture (NQ48/NQ77 profile separation)
- Firestore persistence layer (in-memory fallback)
- Payout confirmation and stale recovery
- Challenge browsing and discovery
- Achievement and badge flows
- Nimiq network constants

---

## Deployment

### Frontend (Vercel)

The `vercel.json` at the repository root configures the Vercel deployment. Connect the GitHub repository to Vercel and set the client environment variables in the Vercel project settings.

### Backend (Fly.io)

The server includes a `Dockerfile` generated by `@flydotio/dockerfile`. Deploy via the Fly.io CLI:

```bash
cd server
fly deploy
```

Set server environment variables as Fly.io secrets:

```bash
fly secrets set NIMIQ_TREASURY_PRIVATE_KEY=<value>
fly secrets set FIREBASE_SERVICE_ACCOUNT=<base64_value>
```

---

## Roadmap

The following improvements are planned but not yet implemented:

- [ ] Smart contract escrow (replace treasury custody model with trustless on-chain escrow)
- [ ] Distributed payout lock (replace in-memory mutex with Redis-based lock for multi-instance deployment)
- [ ] Activity verification integrations (optional proof-of-activity via external APIs)
- [ ] Multi-day grace period logic for edge cases
- [ ] Challenge categories and discovery filters
- [ ] Push notifications for check-in reminders

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and run the test suite: `cd server && npm test`
4. Verify the client builds: `cd client && npm run build`
5. Submit a pull request with a clear description of your change

Please do not commit `.env` files, private keys, or service account credentials.

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

## Team

NimStreak was built by **Chinex Ojile** and **Miracle Alajemba**.

Miracle is a collaborator on the project and the person who introduced the team to Nimiq and the NimiqPay Mini App platform, which became the core of NimStreak's blockchain integration.
