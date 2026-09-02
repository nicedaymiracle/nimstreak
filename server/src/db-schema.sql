-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  type TEXT NOT NULL DEFAULT 'solo', -- solo, group, public
  duration_days INTEGER NOT NULL DEFAULT 30,
  stake_nim DECIMAL(18, 5) NOT NULL DEFAULT 1.0,
  stake_luna BIGINT NOT NULL DEFAULT 100000,
  checkin_type TEXT NOT NULL DEFAULT 'tap', -- tap, photo, text
  created_by TEXT NOT NULL, -- NQ address
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, cancelled
  max_participants INTEGER DEFAULT 50,
  invite_code TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Participants table
CREATE TABLE IF NOT EXISTS challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  stake_tx_hash TEXT,
  stake_amount DECIMAL(18, 5) NOT NULL,
  stake_luna BIGINT NOT NULL DEFAULT 100000,
  status TEXT NOT NULL DEFAULT 'active', -- active, failed, completed
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_checkins INTEGER DEFAULT 0,
  failed_at TIMESTAMP,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(challenge_id, wallet_address)
);

-- Check-ins table
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  checkin_date DATE NOT NULL,
  proof_text TEXT,
  proof_photo_url TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(challenge_id, wallet_address, checkin_date)
);

-- Payouts table with idempotency constraint
CREATE TABLE IF NOT EXISTS nimstreak_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES challenges(id),
  wallet_address TEXT NOT NULL,
  amount_nim DECIMAL(18, 5) NOT NULL,
  amount_luna BIGINT NOT NULL DEFAULT 0,
  payout_type TEXT NOT NULL, -- stake_return, bonus, stake_return_plus_bonus, refund
  tx_hash TEXT,
  status TEXT DEFAULT 'pending', -- pending, sent, failed
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(challenge_id, wallet_address, payout_type)
);

-- User profiles table
CREATE TABLE IF NOT EXISTS nimstreak_profiles (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT,
  total_challenges INTEGER DEFAULT 0,
  completed_challenges INTEGER DEFAULT 0,
  failed_challenges INTEGER DEFAULT 0,
  total_nim_staked DECIMAL(18, 5) DEFAULT 0,
  total_nim_earned DECIMAL(18, 5) DEFAULT 0,
  longest_streak_ever INTEGER DEFAULT 0,
  current_active_streak INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Badges table
CREATE TABLE IF NOT EXISTS nimstreak_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  badge_type TEXT NOT NULL, -- streak_7, streak_30, streak_100, first_win, etc
  challenge_id UUID REFERENCES challenges(id),
  earned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(wallet_address, badge_type, challenge_id)
);

-- Indexes for optimal performance and financial constraints
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_category ON challenges(category);
CREATE INDEX IF NOT EXISTS idx_challenges_invite_code ON challenges(invite_code);
CREATE INDEX IF NOT EXISTS idx_participants_wallet ON challenge_participants(wallet_address);
CREATE INDEX IF NOT EXISTS idx_participants_challenge ON challenge_participants(challenge_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_stake_tx_hash ON challenge_participants(stake_tx_hash) WHERE stake_tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkins_wallet_date ON checkins(wallet_address, checkin_date);
CREATE INDEX IF NOT EXISTS idx_profiles_streak ON nimstreak_profiles(current_active_streak DESC, longest_streak_ever DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nimstreak_payouts_unique ON nimstreak_payouts(challenge_id, wallet_address, payout_type);
