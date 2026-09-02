import React, { useState } from "react";
import { CATEGORIES } from "../ui/streak-stickers.jsx";
import { DURATION_OPTIONS, MIN_STAKE_NIM, DEFAULT_STAKE_NIM } from "../../config/app-config.js";

export function CreateChallengeScreen({
  walletAddress,
  onConnectWallet,
  onCreateChallenge,
  onCancel,
  submitting = false,
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("fitness");
  const [type, setType] = useState("public"); // solo, group, public
  const [durationDays, setDurationDays] = useState(30);
  const [stakeNim, setStakeNim] = useState(DEFAULT_STAKE_NIM);
  const [checkinType, setCheckinType] = useState("tap"); // tap, photo, text
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [startDateOffset, setStartDateOffset] = useState(0); // 0 = today, 1 = tomorrow
  const [formError, setFormError] = useState("");

  const estimatedQuitRate = 0.3; // 30% quit rate estimate for preview
  const estimatedParticipants = type === "solo" ? 1 : type === "group" ? 10 : 25;
  const totalEstimatedPool = estimatedParticipants * stakeNim;
  const estimatedQuitters = Math.floor(estimatedParticipants * estimatedQuitRate);
  const estimatedFinishers = Math.max(1, estimatedParticipants - estimatedQuitters);
  const estimatedQuitterPool = estimatedQuitters * stakeNim;
  const estimatedBonus = type === "solo" ? 0 : (estimatedQuitterPool / estimatedFinishers) * 0.9;
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

        {/* Title & Description */}
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

        {/* Category Picker */}
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

        {/* Challenge Mode */}
        <div className="form-group">
          <label className="form-label">Game Mode</label>
          <div className="mode-toggle-group">
            <button
              type="button"
              className={`mode-btn ${type === "solo" ? "mode-btn--active" : ""}`}
              onClick={() => setType("solo")}
            >
              <span className="mode-btn__icon">👤</span>
              <span className="mode-btn__title">Solo</span>
              <span className="mode-btn__sub">You vs yourself</span>
            </button>

            <button
              type="button"
              className={`mode-btn ${type === "group" ? "mode-btn--active" : ""}`}
              onClick={() => setType("group")}
            >
              <span className="mode-btn__icon">👥</span>
              <span className="mode-btn__title">Group</span>
              <span className="mode-btn__sub">Invite code</span>
            </button>

            <button
              type="button"
              className={`mode-btn ${type === "public" ? "mode-btn--active" : ""}`}
              onClick={() => setType("public")}
            >
              <span className="mode-btn__icon">🌐</span>
              <span className="mode-btn__title">Public</span>
              <span className="mode-btn__sub">Open to all</span>
            </button>
          </div>
        </div>

        {/* Duration Selection */}
        <div className="form-group">
          <label className="form-label">Challenge Duration</label>
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

        {/* Stake Amount */}
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
                className="stake-chip"
                onClick={() => setStakeNim(amt)}
              >
                +{amt}
              </button>
            ))}
          </div>
        </div>

        {/* Check-in Method */}
        <div className="form-group">
          <label className="form-label">Check-in Proof Type</label>
          <div className="checkin-type-grid">
            <button
              type="button"
              className={`checkin-type-btn ${checkinType === "tap" ? "checkin-type-btn--active" : ""}`}
              onClick={() => setCheckinType("tap")}
            >
              <span className="checkin-type-btn__icon">⚡</span>
              <span>1-Tap Check-in</span>
            </button>
            <button
              type="button"
              className={`checkin-type-btn ${checkinType === "text" ? "checkin-type-btn--active" : ""}`}
              onClick={() => setCheckinType("text")}
            >
              <span className="checkin-type-btn__icon">📝</span>
              <span>Text Journal</span>
            </button>
            <button
              type="button"
              className={`checkin-type-btn ${checkinType === "photo" ? "checkin-type-btn--active" : ""}`}
              onClick={() => setCheckinType("photo")}
            >
              <span className="checkin-type-btn__icon">📸</span>
              <span>Photo Proof</span>
            </button>
          </div>
        </div>

        {/* Payout Preview Card */}
        <div className="payout-preview-card">
          <div className="payout-preview-card__header">
            <span className="payout-preview-card__icon">💰</span>
            <h4>Estimated Reward Calculation</h4>
          </div>

          <div className="preview-breakdown">
            <div className="preview-row">
              <span>Your Stake Locked:</span>
              <span className="text-bold">{stakeNim.toFixed(2)} NIM</span>
            </div>
            {type !== "solo" && (
              <>
                <div className="preview-row">
                  <span>Est. Forfeit Bonus:</span>
                  <span className="text-gold">+{estimatedBonus.toFixed(2)} NIM</span>
                </div>
                <div className="preview-divider" />
                <div className="preview-row preview-row--total">
                  <span>Est. Finisher Payout:</span>
                  <span className="text-gold-bright text-bold">
                    {estimatedTotalReturn.toFixed(2)} NIM 💎
                  </span>
                </div>
              </>
            )}
            {type === "solo" && (
              <div className="preview-note">
                Solo challenges return 100% of your {stakeNim.toFixed(2)} NIM upon completing all {durationDays} days.
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn--gold-glow btn--lg btn--full"
            disabled={submitting}
          >
            {submitting ? "Confirming Nimiq Stake..." : `Stake ${stakeNim} NIM & Start Challenge 🔥`}
          </button>
        </div>
      </form>
    </div>
  );
}
