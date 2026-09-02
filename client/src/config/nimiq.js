export const NIM_STAKE_LUNA = 100000; // 1 NIM = 100,000 Luna
export const NIM_STAKE_DISPLAY = "1 NIM";
export const DEFAULT_TREASURY_ADDRESS =
  import.meta.env.VITE_NIMIQ_TREASURY_ADDRESS || "NQ68 LS47 5LF6 C7CU MVB6 KL55 YSFG PEXJ ADJ0";
export const NIMIQ_NETWORK = import.meta.env.VITE_NIMIQ_NETWORK || "mainnet";
export const NIMIQ_HUB_URL =
  import.meta.env.VITE_NIMIQ_HUB_URL || "https://hub.nimiq.com";

export const NIMSTREAK_STORAGE_KEY = "nimstreak_connected_wallet";
export const NIMSTREAK_SESSION_KEY = "nimstreak_challenge_session";

export const NIMSTREAK_RULES = [
  "Choose your habit and set your duration (7, 14, 30, 60, or 100 days)",
  "Stake NIM to enter the accountability arena",
  "Check in every day before midnight UTC to keep your streak alive",
  "Miss one day and your stake goes to the winners prize pool",
  "Complete the entire challenge duration to claim your stake + bonus NIM from quitters",
];

export const GAME_RULES = NIMSTREAK_RULES;
