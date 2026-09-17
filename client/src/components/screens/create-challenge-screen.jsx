import React, { useState } from "react";
import { CATEGORIES } from "../ui/streak-stickers.jsx";
import { DURATION_OPTIONS, MIN_STAKE_NIM, DEFAULT_STAKE_NIM } from "../../config/app-config.js";
import { WorkedExampleCard } from "../ui/worked-example-card.jsx";
import {
  Zap,
  FileText,
  Camera,
  Coins,
  ShieldCheck,
  User,
  Globe,
  Users,
  Clock,
  ArrowRight,
} from "lucide-react";

export function CreateChallengeScreen({
  walletAddress,
  onConnectWallet,
  onCreateChallenge,
  onCancel,
  submitting = false,
  initialValues = null,
}) {
  const [title, setTitle] = useState(initialValues?.title || "");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [category, setCategory] = useState(initialValues?.category || "fitness");
  const [type, setType] = useState(initialValues?.type || "public"); // solo, group, public
  const [durationDays, setDurationDays] = useState(Number(initialValues?.duration || initialValues?.duration_days) || 30);
  const [stakeNim, setStakeNim] = useState(Number(initialValues?.stake_nim || initialValues?.stake) || DEFAULT_STAKE_NIM);
  const [checkinType, setCheckinType] = useState("tap"); // tap, photo, text
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [startDateOffset, setStartDateOffset] = useState(0); // 0 = today, 1 = tomorrow
  const [formError, setFormError] = useState("");

  const estimatedQuitRate = 0.3; // 30% quit rate estimate for preview
  const estimatedParticipants = type === "solo" ? 1 : type === "group" ? 10 : 25;
  const totalEstimatedPool = estimatedParticipants * stakeNim;
  const estimatedQuitters = type === "solo" ? 0 : Math.floor(estimatedParticipants * estimatedQuitRate);
  const estimatedFinishers = Math.max(1, estimatedParticipants - estimatedQuitters);
  const estimatedQuitterPool = estimatedQuitters * stakeNim;
  const estimatedBonus = type === "solo" ? Math.min(stakeNim * 0.5, 5) : (estimatedQuitterPool / estimatedFinishers);
  const estimatedTotalReturn = stakeNim + estimatedBonus;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!walletAddress) {
      if (typeof onConnectWallet === "function") onConnectWallet();
      return;
    }

    if (!title.trim() || title.trim().length < 3) {
      setFormError("Please enter a descriptive challenge title (min 3 chars)");
      return;
    }

    if (parseFloat(stakeNim) < MIN_STAKE_NIM) {
      setFormError(`Minimum stake is ${MIN_STAKE_NIM} NIM`);
      return;
    }

    setFormError("");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + startDateOffset);

    try {
      await onCreateChallenge({
        walletAddress,
        title: title.trim(),
        description: description.trim(),
        category,
        type,
        durationDays: parseInt(durationDays),
        stakeNim: parseFloat(stakeNim),
        checkinType,
        maxParticipants: parseInt(maxParticipants),
        startsAt: startDate.toISOString(),
      });
    } catch (err) {
      setFormError(err.message || "Failed to create challenge");
    }
  };

  return (
    <div className="screen-container create-screen">
      <header className="page-header">
        <button type="button" className="back-btn" onClick={onCancel}>
          ← Back
        </button>
        <h1 className="page-title">Start a Habit Challenge</h1>
        <p className="page-subtitle">Lock in your commitment with real NIM stake on the line.</p>
      </header>

      <form onSubmit={handleSubmit} className="create-form">
        {formError && <div className="form-banner form-banner--error">{formError}</div>}

        {/* ── SECTION A — CHALLENGE DETAILS ────────────────────────── */}
        <section className="create-section" aria-labelledby="section-a-heading">
          <div className="create-section-header">
            <span className="create-section-badge" aria-hidden="true">A</span>
            <div>
              <h2 id="section-a-heading" className="create-section-title">Challenge Details</h2>
              <p className="create-section-sub">Define your daily habit goal and category</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="challenge-title">
              Challenge Goal <span className="req">*</span>
            </label>
            <input
              id="challenge-title"
              type="text"
              className="form-input"
              placeholder="e.g. 30 Days of 5 AM Gym Routine"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="challenge-desc">
              Rules & Description
            </label>
            <textarea
              id="challenge-desc"
              className="form-textarea"
              placeholder="Explain what counts as a completed daily check-in..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={300}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <div className="cat-selector-grid">
              {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`cat-select-btn ${category === cat.id ? "cat-select-btn--active" : ""}`}
                  onClick={() => setCategory(cat.id)}
                >
                  <span className="cat-select-btn__emoji">{cat.emoji}</span>
                  <span className="cat-select-btn__label">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Check-in Proof Type</label>
            <div className="checkin-type-grid">
              <button
                type="button"
                className={`checkin-type-btn ${checkinType === "tap" ? "checkin-type-btn--active" : ""}`}
                onClick={() => setCheckinType("tap")}
              >
                <span className="checkin-type-btn__icon"><Zap size={16} className="text-gold" /></span>
                <span>1-Tap Check-in</span>
              </button>
              <button
                type="button"
                className={`checkin-type-btn ${checkinType === "text" ? "checkin-type-btn--active" : ""}`}
                onClick={() => setCheckinType("text")}
              >
                <span className="checkin-type-btn__icon"><FileText size={16} className="text-gold" /></span>
                <span>Text Journal</span>
              </button>
              <button
                type="button"
                className={`checkin-type-btn ${checkinType === "photo" ? "checkin-type-btn--active" : ""}`}
                onClick={() => setCheckinType("photo")}
              >
                <span className="checkin-type-btn__icon"><Camera size={16} className="text-gold" /></span>
                <span>Photo Proof</span>
              </button>
            </div>
          </div>
        </section>

        {/* ── SECTION B — COMMITMENT ────────────────────────────────── */}
        <section className="create-section" aria-labelledby="section-b-heading">
          <div className="create-section-header">
            <span className="create-section-badge" aria-hidden="true">B</span>
            <div>
              <h2 id="section-b-heading" className="create-section-title">Commitment</h2>
              <p className="create-section-sub">Duration and skin in the game</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Streak Duration</label>
            <div className="duration-grid">
              {DURATION_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`duration-pill ${durationDays === days ? "duration-pill--active" : ""}`}
                  onClick={() => setDurationDays(days)}
                >
                  {days} Days
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label" htmlFor="stake-input">
                Your NIM Stake
              </label>
              <span className="form-hint">Min {MIN_STAKE_NIM} NIM</span>
            </div>

            <div className="stake-input-wrap">
              <input
                id="stake-input"
                type="number"
                className="form-input form-input--stake"
                step="0.1"
                min={MIN_STAKE_NIM}
                max={1000}
                value={stakeNim}
                onChange={(e) => setStakeNim(parseFloat(e.target.value) || 0)}
              />
              <span className="stake-currency">NIM</span>
            </div>

            <div className="stake-quick-chips">
              {[0.5, 1.0, 2.0, 5.0, 10.0].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={`stake-chip ${stakeNim === amt ? "stake-chip--active" : ""}`}
                  onClick={() => setStakeNim(amt)}
                >
                  {amt} NIM
                </button>
              ))}
            </div>
          </div>

          {/* NIM Stake Preview Banner */}
          <div className="stake-preview-banner">
            <div className="stake-preview-banner__main">
              <span className="stake-preview-banner__icon" aria-hidden="true"><Coins size={20} className="text-gold" /></span>
              <div className="stake-preview-banner__details">
                <span className="stake-preview-banner__label">Locked On-Chain</span>
                <span className="stake-preview-banner__val">{Number(stakeNim || 0).toFixed(1)} NIM</span>
              </div>
            </div>
            <div className="stake-preview-banner__guarantee">
              <span className="stake-preview-banner__shield" aria-hidden="true"><ShieldCheck size={16} className="text-emerald" /></span>
              <span className="stake-preview-banner__guarantee-text">100% Refundable</span>
            </div>
          </div>
        </section>

        {/* ── SECTION C — CHALLENGE TYPE ────────────────────────────── */}
        <section className="create-section" aria-labelledby="section-c-heading">
          <div className="create-section-header">
            <span className="create-section-badge" aria-hidden="true">C</span>
            <div>
              <h2 id="section-c-heading" className="create-section-title">Challenge Type</h2>
              <p className="create-section-sub">Choose who can participate in this streak</p>
            </div>
          </div>

          <div className="form-group">
            <div className="mode-toggle-group">
              <button
                type="button"
                className={`mode-btn ${type === "solo" ? "mode-btn--active" : ""}`}
                onClick={() => setType("solo")}
              >
                <span className="mode-btn__icon"><User size={20} className="text-gold" /></span>
                <span className="mode-btn__title">Solo</span>
                <span className="mode-btn__sub">You vs yourself</span>
              </button>

              <button
                type="button"
                className={`mode-btn ${type === "public" ? "mode-btn--active" : ""}`}
                onClick={() => setType("public")}
              >
                <span className="mode-btn__icon"><Globe size={20} className="text-gold" /></span>
                <span className="mode-btn__title">Public</span>
                <span className="mode-btn__sub">Open community</span>
              </button>

              <button
                type="button"
                className={`mode-btn ${type === "group" ? "mode-btn--active" : ""}`}
                onClick={() => setType("group")}
              >
                <span className="mode-btn__icon"><Users size={20} className="text-gold" /></span>
                <span className="mode-btn__title">Group</span>
                <span className="mode-btn__sub">Invite code only</span>
              </button>
            </div>
          </div>
        </section>

        {/* ── REVIEW / SUMMARY AREA ─────────────────────────────────── */}
        <div className="create-summary-card">
          <div className="create-summary-header">
            <span className="create-summary-title">Challenge Summary</span>
            <span className="create-summary-type-tag">
              {type === "solo" ? "Solo Mode" : type === "group" ? "Group Mode" : "Public Mode"}
            </span>
          </div>

          <div className="create-summary-pills-row">
            <div className="create-summary-pill">
              <span className="create-summary-pill__icon"><Clock size={14} className="text-gold" /></span>
              <span className="create-summary-pill__text">{durationDays} Days</span>
            </div>
            <div className="create-summary-pill create-summary-pill--stake">
              <span className="create-summary-pill__icon"><Coins size={14} className="text-gold" /></span>
              <span className="create-summary-pill__text">{Number(stakeNim || 0).toFixed(1)} NIM Stake</span>
            </div>
          </div>

          <div className="create-summary-body">
            <p className="create-summary-desc">
              Complete your challenge and get your original {Number(stakeNim || 0).toFixed(1)} NIM stake back.
              {type === "solo"
                ? " In solo mode, your principal stake is 100% protected even if you miss a check-in. Complete 100% of days to unlock an eligible NimStreak completion bonus!"
                : " If other participants quit, their forfeited stakes form a Quitter Pool shared equally among successful finishers with 0% treasury deductions."}
            </p>

            <p className="create-summary-sub">
              {type === "solo"
                ? "Complete 100% of required days → 100% stake returned + eligible completion bonus. Miss a day → 100% stake returned + no bonus. No Quitter Pool."
                : "Complete 100% of required days → 100% stake returned + share of Quitter Pool + completion bonus. Miss a day → stake forfeited into Quitter Pool for finishers."}
            </p>

            {/* Expandable Worked Example Accordion */}
            <WorkedExampleCard
              isCollapsible={true}
              defaultExpanded={false}
              showBonusNote={true}
              challengeType={type}
            />
          </div>
        </div>

        {/* Nimiq Pay Authorization Guidance */}
        <div className="payment-approval-guidance">
          <div className="payment-guidance-step">
            <ShieldCheck size={18} className="text-gold flex-shrink-0" aria-hidden="true" />
            <div>
              <div className="guidance-title">Payment Authorization via Nimiq Pay</div>
              <p className="guidance-desc">
                Nimiq Pay will open to securely authorize your {Number(stakeNim || 0).toFixed(1)} NIM stake. Your NimStreak profile remains connected to your account, while Nimiq Pay handles transaction approval and determines the wallet account used. The challenge is created once verified on-chain.
              </p>
            </div>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn--gold-glow btn--lg btn--full btn--create-cta"
            disabled={submitting}
          >
            {submitting ? "Confirming in Nimiq Wallet..." : "Create Challenge →"}
          </button>
        </div>
      </form>
    </div>
  );
}
