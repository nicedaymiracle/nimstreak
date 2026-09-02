export function calculateWeeklySeasonBonus(leaderboard = [], totalPool = 1.75) {
  const top3 = leaderboard.slice(0, 3);
  const weights = [1.0, 0.5, 0.25];

  const payouts = top3.map((player, idx) => ({
    rank: idx + 1,
    address: player.address,
    amount: weights[idx] || 0,
  }));

  const totalDistributed = payouts.reduce((sum, p) => sum + p.amount, 0);

  return {
    payouts,
    totalDistributed,
  };
}
