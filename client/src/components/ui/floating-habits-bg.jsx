import React, { useEffect, useRef, useMemo } from "react";

/**
 * FloatingHabitsBackground (Floating Challenges Canvas)
 *
 * High-performance 60fps HTML5 Canvas rendering drifting challenge cards,
 * glowing ambient orbs, and golden stardust particles.
 * Designed for NimStreak mobile & desktop screens.
 */

const DEFAULT_CHALLENGES = [
  { emoji: "🏃", title: "5km Morning Run", stake: "1 NIM", streak: "Day 6", color: "#06B6D4" },
  { emoji: "💻", title: "7 Days of Coding", stake: "0.5 NIM", streak: "Day 7", color: "#3B82F6" },
  { emoji: "🧘", title: "15m Daily Meditation", stake: "1 NIM", streak: "Day 12", color: "#10B981" },
  { emoji: "💪", title: "50 Pushups Daily", stake: "0.5 NIM", streak: "Day 19", color: "#F59E0B" },
  { emoji: "💧", title: "Drink 2.5L Water", stake: "0.5 NIM", streak: "Day 24", color: "#38BDF8" },
  { emoji: "📚", title: "Read 25 Pages", stake: "1 NIM", streak: "Day 15", color: "#8B5CF6" },
  { emoji: "⚡", title: "Deep Work 2 Hours", stake: "2 NIM", streak: "Day 9", color: "#EAB308" },
  { emoji: "🍳", title: "Eating Healthy Daily", stake: "0.5 NIM", streak: "Day 4", color: "#10B981" },
  { emoji: "💰", title: "Saving Daily", stake: "0.5 NIM", streak: "Day 21", color: "#FFC425" },
  { emoji: "🌅", title: "Wake Up at 6:00 AM", stake: "1 NIM", streak: "Day 28", color: "#F97316" },
  { emoji: "📵", title: "No Social Media", stake: "1.5 NIM", streak: "Day 11", color: "#EC4899" },
  { emoji: "🚶", title: "10,000 Daily Steps", stake: "0.5 NIM", streak: "Day 33", color: "#14B8A6" },
  { emoji: "🎯", title: "Daily Habit Sprint", stake: "1 NIM", streak: "Day 5", color: "#E9B213" },
  { emoji: "💎", title: "Bonus Pool Winner", stake: "+5.2 NIM", streak: "Streak Won", color: "#FFD700" },
];

const MAX_DPR = 2;

export function FloatingHabitsBackground({ challenges = [] }) {
  const canvasRef = useRef(null);

  // Combine live challenges with rich default habit presets
  const challengePool = useMemo(() => {
    const live = (challenges || [])
      .filter((c) => c && c.title)
      .map((c) => {
        let emoji = "🎯";
        let color = "#FFC425";
        const cat = (c.category || "").toLowerCase();
        if (cat.includes("fit") || cat.includes("gym") || cat.includes("pushup")) {
          emoji = "💪";
          color = "#F59E0B";
        } else if (cat.includes("run") || cat.includes("walk") || cat.includes("step")) {
          emoji = "🏃";
          color = "#06B6D4";
        } else if (cat.includes("code") || cat.includes("dev") || cat.includes("tech")) {
          emoji = "💻";
          color = "#3B82F6";
        } else if (cat.includes("health") || cat.includes("eat") || cat.includes("diet")) {
          emoji = "🥗";
          color = "#10B981";
        } else if (cat.includes("finance") || cat.includes("sav") || cat.includes("money")) {
          emoji = "💰";
          color = "#FFC425";
        } else if (cat.includes("mind") || cat.includes("medit") || cat.includes("zen")) {
          emoji = "🧘";
          color = "#8B5CF6";
        }

        return {
          emoji,
          title: c.title,
          stake: `${c.stake_nim || 0.5} NIM`,
          streak: `${c.duration_days || 7} Days`,
          color,
        };
      });

    return [...live, ...DEFAULT_CHALLENGES];
  }, [challenges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let cards = [];
    let particles = [];
    let mouseX = 0;
    let mouseY = 0;
    let mouseActive = false;

    // Ambient orbs configuration
    const ambientOrbs = [
      { xRatio: 0.15, yRatio: 0.25, r: 240, color: "rgba(255, 196, 37, 0.08)", speed: 0.0006 },
      { xRatio: 0.85, yRatio: 0.35, r: 280, color: "rgba(59, 130, 246, 0.09)", speed: 0.0008 },
      { xRatio: 0.30, yRatio: 0.80, r: 260, color: "rgba(16, 185, 129, 0.07)", speed: 0.0007 },
      { xRatio: 0.80, yRatio: 0.85, r: 220, color: "rgba(139, 92, 246, 0.08)", speed: 0.0009 },
    ];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      const isMobile = width < 640;
      const count = isMobile ? 12 : 22;

      // Seed floating challenge cards
      cards = Array.from({ length: count }, (_, i) => {
        const depth = 0.4 + Math.random() * 0.6; // 0.4 -> 1.0
        const item = challengePool[i % challengePool.length];
        return {
          ...item,
          x: Math.random() * width,
          y: Math.random() * (height + 160) - 80,
          scale: isMobile ? 0.72 + depth * 0.18 : 0.78 + depth * 0.24,
          speed: 0.18 + depth * 0.28,
          driftAmp: (Math.random() - 0.5) * 0.35,
          driftFreq: 0.008 + Math.random() * 0.012,
          driftOffset: Math.random() * Math.PI * 2,
          angle: (Math.random() - 0.5) * 0.12,
          wobbleSpeed: (Math.random() - 0.5) * 0.002,
          alpha: isMobile ? 0.45 + depth * 0.35 : 0.50 + depth * 0.40,
        };
      });

      // Seed subtle golden floating spark particles
      const sparkCount = isMobile ? 18 : 32;
      particles = Array.from({ length: sparkCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.8 + Math.random() * 1.8,
        speedY: 0.15 + Math.random() * 0.35,
        alpha: 0.2 + Math.random() * 0.5,
        twinkle: Math.random() * Math.PI * 2,
      }));
    }

    function drawAmbientOrbs(time) {
      for (const orb of ambientOrbs) {
        const ox = width * orb.xRatio + Math.cos(time * orb.speed) * 40;
        const oy = height * orb.yRatio + Math.sin(time * orb.speed * 1.3) * 35;
        const grad = ctx.createRadialGradient(ox, oy, 10, ox, oy, orb.r);
        grad.addColorStop(0, orb.color);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, orb.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawParticles(time) {
      for (const p of particles) {
        p.y -= p.speedY;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        const tw = Math.sin(time * 0.003 + p.twinkle) * 0.25;
        const finalAlpha = Math.max(0.05, Math.min(0.85, p.alpha + tw));

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 206, 68, ${finalAlpha})`;
        ctx.fill();
      }
    }

    function drawCard(card, time) {
      const w = 186 * card.scale;
      const h = 50 * card.scale;
      const r = 12 * card.scale;
      const halfW = w / 2;
      const halfH = h / 2;

      ctx.save();
      ctx.translate(card.x, card.y);
      ctx.rotate(card.angle + Math.sin(time * card.driftFreq + card.driftOffset) * 0.02);

      // Subtle reactive tilt from cursor if nearby
      if (mouseActive) {
        const dx = card.x - mouseX;
        const dy = card.y - mouseY;
        const dist = Math.hypot(dx, dy);
        if (dist < 260) {
          const force = (1 - dist / 260) * 0.06;
          ctx.rotate((dx / 260) * force);
        }
      }

      // 1. Subtle Glow / Shadow
      ctx.shadowColor = card.color;
      ctx.shadowBlur = 10 * card.scale;
      ctx.shadowOffsetY = 4 * card.scale;

      // 2. Card Background Gradient
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(-halfW, -halfH, w, h, r);
      } else {
        ctx.rect(-halfW, -halfH, w, h);
      }
      const bgGrad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
      bgGrad.addColorStop(0, `rgba(24, 32, 56, ${0.82 * card.alpha})`);
      bgGrad.addColorStop(1, `rgba(13, 18, 32, ${0.92 * card.alpha})`);
      ctx.fillStyle = bgGrad;
      ctx.fill();

      // 3. Card Accent Border
      ctx.shadowBlur = 0; // Clear shadow for crisp border
      ctx.strokeStyle = card.color;
      ctx.globalAlpha = Math.min(1, card.alpha * 0.65);
      ctx.lineWidth = 1.1 * card.scale;
      ctx.stroke();

      // 4. Left Emoji Circle Badge
      const iconR = 14.5 * card.scale;
      const iconX = -halfW + 12 * card.scale + iconR;
      const iconY = 0;

      ctx.beginPath();
      ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 0.8 * card.scale;
      ctx.stroke();

      // Emoji
      ctx.globalAlpha = Math.min(1, card.alpha * 1.15);
      ctx.font = `${Math.round(15 * card.scale)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(card.emoji, iconX, iconY + 1 * card.scale);

      // 5. Title Text
      const textLeft = iconX + iconR + 9 * card.scale;
      const maxTitleW = w - (textLeft - (-halfW)) - 10 * card.scale;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `700 ${Math.round(11.5 * card.scale)}px "Outfit", -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      let displayTitle = card.title;
      if (ctx.measureText(displayTitle).width > maxTitleW) {
        while (displayTitle.length > 3 && ctx.measureText(displayTitle + "…").width > maxTitleW) {
          displayTitle = displayTitle.slice(0, -1);
        }
        displayTitle += "…";
      }
      ctx.fillText(displayTitle, textLeft, -7.5 * card.scale);

      // 6. Streak & Stake Subline
      ctx.font = `600 ${Math.round(9.5 * card.scale)}px "Outfit", -apple-system, sans-serif`;
      ctx.fillStyle = card.color;
      ctx.fillText(card.streak, textLeft, 8.5 * card.scale);

      const streakW = ctx.measureText(card.streak).width;
      ctx.fillStyle = "#FFC425"; // Nimiq gold
      ctx.fillText(" • " + card.stake, textLeft + streakW, 8.5 * card.scale);

      ctx.restore();
    }

    function paint(time = 0) {
      ctx.clearRect(0, 0, width, height);

      // 1. Ambient atmospheric glow orbs
      drawAmbientOrbs(time);

      // 2. Drifting sparkle particles
      drawParticles(time);

      // 3. Floating challenge cards
      for (const card of cards) {
        drawCard(card, time);
      }
    }

    function tick(timestamp) {
      for (const card of cards) {
        card.y -= card.speed;
        card.x += Math.sin(timestamp * card.driftFreq + card.driftOffset) * card.driftAmp;
        card.angle += card.wobbleSpeed;

        // Wrap-around logic
        const cardH = 60 * card.scale;
        if (card.y < -cardH) {
          card.y = height + cardH + Math.random() * 40;
          card.x = Math.random() * width;
          // Pick a fresh item from pool on reset
          const fresh = challengePool[Math.floor(Math.random() * challengePool.length)];
          card.emoji = fresh.emoji;
          card.title = fresh.title;
          card.stake = fresh.stake;
          card.streak = fresh.streak;
          card.color = fresh.color;
        }
        if (card.x < -80) card.x = width + 80;
        if (card.x > width + 80) card.x = -80;
      }

      paint(timestamp);
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (reduceMotion || frame) return;
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function handleMouseMove(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      mouseActive = true;
    }

    function handleMouseLeave() {
      mouseActive = false;
    }

    function handleVisibility() {
      if (document.hidden) stop();
      else start();
    }

    function handleResize() {
      resize();
      seed();
      paint(0);
    }

    resize();
    seed();
    paint(0);

    if (reduceMotion) {
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    start();
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [challengePool]);

  return (
    <canvas
      aria-hidden="true"
      className="floating-habits-canvas floating-challenges-canvas"
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

export default FloatingHabitsBackground;
