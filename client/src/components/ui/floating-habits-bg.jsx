import React, { useEffect, useRef } from "react";

/**
 * FloatingHabitsBackground (NimStreak Dark Mode SaaS Atmosphere)
 *
 * Modeled after nimword's high-performance canvas background:
 * - Clean, deep navy / near-black base
 * - Fine dark SaaS grid overlay
 * - Subtle ambient gradient glows
 * - Sparse, gentle drifting stardust particles
 *
 * Fully respects prefers-reduced-motion, auto-stops when tab is hidden,
 * capped at 2x DPR.
 */
const MAX_DPR = 2;

export function FloatingHabitsBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let particles = [];

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
      const isMobile = width < 768;
      const count = isMobile ? 16 : 28;

      particles = Array.from({ length: count }, () => {
        const depth = 0.3 + Math.random() * 0.7;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.6 + depth * 1.4,
          speedY: 0.10 + depth * 0.22,
          drift: (Math.random() - 0.5) * 0.15,
          alpha: 0.15 + depth * 0.35,
          twinkle: Math.random() * Math.PI * 2,
          color: Math.random() > 0.4 ? "255, 196, 37" : "147, 197, 253",
        };
      });
    }

    function paint(time = 0) {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle drifting sparks
      for (const p of particles) {
        const tw = Math.sin(time * 0.002 + p.twinkle) * 0.2;
        const finalAlpha = Math.max(0.06, Math.min(0.65, p.alpha + tw));

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${finalAlpha})`;
        ctx.fill();
      }
    }

    function tick(timestamp) {
      for (const p of particles) {
        p.y -= p.speedY;
        p.x += p.drift;

        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
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
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <>
      {/* Subtle modern dark tech grid overlay with radial vignette mask */}
      <div className="welcome-grid-overlay" aria-hidden="true" />
      {/* Soft atmospheric gradient glows */}
      <div className="welcome-ambient-glow welcome-ambient-glow--gold" aria-hidden="true" />
      <div className="welcome-ambient-glow welcome-ambient-glow--blue" aria-hidden="true" />
      {/* Canvas for sparse sparkling micro-particles */}
      <canvas aria-hidden="true" className="welcome-sparks-canvas" ref={canvasRef} />
    </>
  );
}

export default FloatingHabitsBackground;
