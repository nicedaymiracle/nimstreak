import React, { useMemo } from "react";

const SAMPLE_HABITS = [
  { id: 1, text: "30-Day Morning Gym", stake: "5 NIM", streak: "Day 14", emoji: "💪", color: "#E9B213" },
  { id: 2, text: "100 Days of Code", stake: "10 NIM", streak: "Day 42", emoji: "💻", color: "#3B82F6" },
  { id: 3, text: "Daily 15m Meditation", stake: "2 NIM", streak: "Day 8", emoji: "🧘", color: "#10B981" },
  { id: 4, text: "+18.5 NIM Bonus Won!", stake: "Winner", streak: "Complete", emoji: "💎", color: "#F59E0B" },
  { id: 5, text: "Read 25 Pages Daily", stake: "3 NIM", streak: "Day 21", emoji: "📚", color: "#8B5CF6" },
  { id: 6, text: "No Sugar Sprint", stake: "5 NIM", streak: "Day 19", emoji: "🥗", color: "#EC4899" },
  { id: 7, text: "5km Morning Run", stake: "4 NIM", streak: "Day 6", emoji: "🏃‍♂️", color: "#06B6D4" },
  { id: 8, text: "Deep Work 4 Hours", stake: "8 NIM", streak: "Day 33", emoji: "⚡", color: "#EAB308" },
  { id: 9, text: "Drink 3L Water Habit", stake: "1 NIM", streak: "Day 12", emoji: "💧", color: "#38BDF8" },
  { id: 10, text: "Wake up at 5:30 AM", stake: "5 NIM", streak: "Day 27", emoji: "🌅", color: "#F97316" },
];

export function FloatingHabitsBackground() {
  const items = useMemo(() => {
    return SAMPLE_HABITS.map((item, idx) => ({
      ...item,
      left: `${(idx * 23 + 7) % 86}%`,
      top: `${(idx * 19 + 5) % 88}%`,
      duration: `${14 + (idx % 6) * 3}s`,
      delay: `${(idx * 1.8) % 7}s`,
      scale: 0.82 + (idx % 4) * 0.08,
    }));
  }, []);

  return (
    <div className="floating-habits-bg-container" aria-hidden="true">
      {/* Dynamic Animated Ambient Glow Orbs */}
      <div className="ambient-orb ambient-orb--gold"></div>
      <div className="ambient-orb ambient-orb--blue"></div>
      <div className="ambient-orb ambient-orb--purple"></div>
      <div className="ambient-orb ambient-orb--emerald"></div>

      {/* Floating Habit Cards Stream */}
      <div className="floating-cards-layer">
        {items.map((card) => (
          <div
            key={card.id}
            className="floating-habit-card"
            style={{
              left: card.left,
              top: card.top,
              animationDuration: card.duration,
              animationDelay: card.delay,
              transform: `scale(${card.scale})`,
              borderColor: `${card.color}33`,
            }}
          >
            <div className="f-card-header">
              <span className="f-card-emoji">{card.emoji}</span>
              <span className="f-card-title">{card.text}</span>
            </div>
            <div className="f-card-meta">
              <span className="f-card-streak" style={{ color: card.color }}>
                🔥 {card.streak}
              </span>
              <span className="f-card-stake">{card.stake}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
