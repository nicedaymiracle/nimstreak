import gsap from "gsap";

// Check-in button press — fire effect
export function animateCheckin(buttonEl, streakNumberEl) {
  if (!buttonEl) return;
  const tl = gsap.timeline();
  tl.to(buttonEl, { scale: 0.92, duration: 0.1, ease: "power2.in" })
    .to(buttonEl, { scale: 1.08, duration: 0.2, ease: "back.out(3)" })
    .to(buttonEl, { scale: 1, duration: 0.15, ease: "power2.out" });

  if (streakNumberEl) {
    tl.fromTo(
      streakNumberEl,
      { scale: 0.5, color: "#E9B213" },
      { scale: 1.4, duration: 0.3, ease: "back.out(2)" },
      "-=0.2"
    );
    tl.to(streakNumberEl, { scale: 1, duration: 0.2 });
  }
}

// Streak calendar — day by day reveal
export function animateCalendar(dayEls) {
  if (!dayEls || dayEls.length === 0) return;
  gsap.fromTo(
    dayEls,
    { scale: 0, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.3, stagger: 0.02, ease: "back.out(2)" }
  );
}

// Failed participant — stake lost animation
export function animateStakeLost(cardEl, amountEl) {
  if (!cardEl) return;
  const tl = gsap.timeline();
  if (amountEl) {
    tl.to(amountEl, { color: "#D94432", duration: 0.3 });
  }
  tl.to(cardEl, { x: -8, duration: 0.05, yoyo: true, repeat: 5 });
  if (amountEl) {
    tl.to(amountEl, { opacity: 0, y: -20, duration: 0.4 });
  }
}

// Challenge complete — celebration
export function animateChallengeComplete(cardEl, bonusEl) {
  if (!cardEl) return;
  const tl = gsap.timeline();
  tl.to(cardEl, {
    boxShadow: "0 0 60px rgba(233, 178, 19, 0.8)",
    duration: 0.4,
  });
  if (bonusEl) {
    tl.fromTo(
      bonusEl,
      { scale: 0, opacity: 0 },
      { scale: 1.3, opacity: 1, duration: 0.4, ease: "back.out(2)" }
    );
    tl.to(bonusEl, { scale: 1, duration: 0.2 });
  }
}
