export function buildLetterCounts(word) {
  const counts = {};
  if (!word || typeof word !== "string") return counts;
  for (const char of word.toLowerCase()) {
    counts[char] = (counts[char] || 0) + 1;
  }
  return counts;
}

export function canBuildFromSource(candidate, source) {
  if (!candidate || !source) return false;
  const sourceCounts = buildLetterCounts(source);
  const candCounts = buildLetterCounts(candidate);

  for (const [char, count] of Object.entries(candCounts)) {
    if ((sourceCounts[char] || 0) < count) {
      return false;
    }
  }
  return true;
}

const COMMON_WORDS = [
  "BLOCK", "CHAIN", "LOCK", "COIN", "LOAN", "LION", "BACK", "BLACK", "LACK", "LINK", "BANK", "CLOAK",
  "NIM", "STREAK", "HABIT", "WIN", "REWARD", "CRYPTO", "DAILY", "GOAL", "FOCUS", "EARN"
];

export function deriveValidWords(source) {
  if (!source) return [];
  return COMMON_WORDS.filter((w) => canBuildFromSource(w, source));
}
