export function generateReferralCode(address) {
  if (!address || typeof address !== "string" || !address.startsWith("0x") || address.length !== 42) {
    return "";
  }
  return address.slice(-6).toUpperCase();
}

export function isValidReferralCode(code) {
  if (!code || typeof code !== "string") return false;
  return /^[A-Za-z0-9]{6}$/.test(code);
}

export function calculateReferralCommission(treasuryFee, bps = 2000) {
  const fee = Number(treasuryFee) || 0;
  const rate = bps / 10000;
  const referrerCommission = Math.round(fee * rate * 100000) / 100000;
  const netTreasuryFee = Math.round((fee - referrerCommission) * 100000) / 100000;
  return {
    referrerCommission,
    netTreasuryFee,
  };
}
