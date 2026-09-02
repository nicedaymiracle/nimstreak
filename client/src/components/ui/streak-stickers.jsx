import React from "react";

export const CATEGORIES = [
  { id: "all", label: "All", emoji: "🌟" },
  { id: "fitness", label: "Fitness", emoji: "💪" },
  { id: "learning", label: "Learning", emoji: "📚" },
  { id: "coding", label: "Coding", emoji: "💻" },
  { id: "health", label: "Health", emoji: "🥗" },
  { id: "mindfulness", label: "Mindfulness", emoji: "🧘" },
  { id: "finance", label: "Finance", emoji: "💰" },
  { id: "custom", label: "Custom", emoji: "🎯" },
];

export const BADGE_DEFINITIONS = {
  first_challenge: {
    id: "first_challenge",
    title: "First Step",
    emoji: "🎯",
    description: "Created or joined your first habit challenge",
  },
  streak_7: {
    id: "streak_7",
    title: "7 Day Streak",
    emoji: "⚡",
    description: "Maintained a perfect 7-day uninterrupted streak",
  },
  streak_30: {
    id: "streak_30",
    title: "30 Day Streak",
    emoji: "🔥",
    description: "Crushed a 30-day consistent habit milestone",
  },
  streak_100: {
    id: "streak_100",
    title: "100 Day Streak",
    emoji: "💫",
    description: "Centurion of consistency — 100 days unbroken",
  },
  challenge_winner: {
    id: "challenge_winner",
    title: "Challenge Winner",
    emoji: "👑",
    description: "Completed full challenge duration and won bonus NIM",
  },
  iron_will: {
    id: "iron_will",
    title: "Iron Will",
    emoji: "💪",
    description: "Never missed a day across active challenges",
  },
};

export function CategoryBadge({ category, size = "md" }) {
  const cat = CATEGORIES.find((c) => c.id === (category || "").toLowerCase()) || {
    label: category || "Custom",
    emoji: "🎯",
  };

  return (
    <span className={`category-badge category-badge--${size}`}>
      <span className="category-badge__emoji">{cat.emoji}</span>
      <span className="category-badge__label">{cat.label}</span>
    </span>
  );
}

export function StatusIndicator({ status, label }) {
  let emoji = "⏳";
  let text = label || "Active";
  let statusClass = "status--active";

  switch (status) {
    case "checked_in":
      emoji = "✅";
      text = label || "Checked in today";
      statusClass = "status--checked";
      break;
    case "active":
      emoji = "🔥";
      text = label || "Active Streak";
      statusClass = "status--active";
      break;
    case "missed":
    case "failed":
      emoji = "💀";
      text = label || "Stake Forfeited";
      statusClass = "status--failed";
      break;
    case "completed":
      emoji = "🏆";
      text = label || "Completed";
      statusClass = "status--completed";
      break;
    case "pending_today":
      emoji = "⏳";
      text = label || "Check-in Pending";
      statusClass = "status--pending";
      break;
    default:
      break;
  }

  return (
    <span className={`status-pill ${statusClass}`}>
      <span className="status-pill__emoji">{emoji}</span>
      <span className="status-pill__text">{text}</span>
    </span>
  );
}
