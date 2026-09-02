export const APP_NAME = "NimStreak";
export const APP_TAGLINE = "Stake NIM on your habits. Complete your streak, earn rewards.";

export const DEFAULT_STAKE_NIM = 1.0;
export const MIN_STAKE_NIM = 0.5;
export const MAX_STAKE_NIM = 100.0;

export const DURATION_OPTIONS = [7, 14, 30, 60, 100];

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:4000/api" : "/api");

export const SOCKET_SERVER_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:4000" : window.location.origin);
