import React, { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Coins,
  Users,
  ArrowRight,
  ShieldCheck,
  Trophy,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

/**
 * WorkedExampleCard
 *
 * Educational, visual breakdown of how NimStreak habit staking, forfeits,
 * and rewards work in practice.
 *
 * Parameters:
 *   - defaultExpanded: boolean (whether the accordion is open by default)
 *   - isCollapsible: boolean (allows user to toggle)
 *   - showBonusNote: boolean (whether to include the separate NimStreak bonus explanation)
 */
export function WorkedExampleCard({
  defaultExpanded = true,
  isCollapsible = false,
  showBonusNote = true,
  className = "",
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`worked-example-card ${className}`}>
      {/* Header / Toggle bar */}
      <div
        className={`worked-example-header ${isCollapsible ? "worked-example-header--clickable" : ""}`}
        onClick={isCollapsible ? () => setExpanded(!expanded) : undefined}
        role={isCollapsible ? "button" : undefined}
        tabIndex={isCollapsible ? 0 : undefined}
        aria-expanded={isCollapsible ? expanded : undefined}
        onKeyDown={
          isCollapsible
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded(!expanded);
                }
              }
            : undefined
        }
      >
        <div className="worked-example-header__title-wrap">
          <div className="worked-example-icon-badge">
            <Coins size={16} className="text-gold" aria-hidden="true" />
          </div>
          <div>
            <h4 className="worked-example-title">How Staking & Rewards Work</h4>
            <span className="worked-example-subtitle">10-second worked example</span>
          </div>
        </div>

        {isCollapsible && (
          <button
            type="button"
            className="worked-example-toggle-btn"
            aria-label={expanded ? "Collapse worked example" : "Expand worked example"}
            tabIndex={-1}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      {/* Expandable / Visible Content Body */}
      {(!isCollapsible || expanded) && (
        <div className="worked-example-body">
          {/* Challenge Meta Pill */}
          <div className="example-challenge-meta">
            <div className="example-challenge-badge">
              <span className="example-dot" aria-hidden="true" />
              <span className="example-challenge-name">Challenge: "7 Days of Coding"</span>
            </div>
            <div className="example-challenge-stats">
              <span>
                <Users size={12} className="inline-icon" aria-hidden="true" /> 4 participants
              </span>
              <span>•</span>
              <span>10 NIM stake each</span>
              <span>•</span>
              <span className="text-gold font-bold">40 NIM total staked</span>
            </div>
          </div>

          {/* Visual Participants Grid */}
          <div className="example-participants-grid">
            <div className="example-participant-card example-participant-card--complete">
              <div className="example-participant-header">
                <span className="example-p-avatar">A</span>
                <span className="example-p-name">Participant A</span>
              </div>
              <div className="example-p-status example-p-status--complete">
                <CheckCircle2 size={13} className="text-emerald" aria-hidden="true" />
                <span>Complete (7/7)</span>
              </div>
            </div>

            <div className="example-participant-card example-participant-card--complete">
              <div className="example-participant-header">
                <span className="example-p-avatar">B</span>
                <span className="example-p-name">Participant B</span>
              </div>
              <div className="example-p-status example-p-status--complete">
                <CheckCircle2 size={13} className="text-emerald" aria-hidden="true" />
                <span>Complete (7/7)</span>
              </div>
            </div>

            <div className="example-participant-card example-participant-card--quit">
              <div className="example-participant-header">
                <span className="example-p-avatar">C</span>
                <span className="example-p-name">Participant C</span>
              </div>
              <div className="example-p-status example-p-status--quit">
                <XCircle size={13} className="text-rose" aria-hidden="true" />
                <span>Quit (Day 3)</span>
              </div>
            </div>

            <div className="example-participant-card example-participant-card--quit">
              <div className="example-participant-header">
                <span className="example-p-avatar">D</span>
                <span className="example-p-name">Participant D</span>
              </div>
              <div className="example-p-status example-p-status--quit">
                <XCircle size={13} className="text-rose" aria-hidden="true" />
                <span>Quit (Day 5)</span>
              </div>
            </div>
          </div>

          {/* Economics Flow Banner */}
          <div className="example-math-flow">
            <div className="example-math-step">
              <span className="example-math-label">Forfeited Pool</span>
              <span className="example-math-val text-rose font-bold">20 NIM</span>
              <span className="example-math-desc">2 quitters forfeit stakes</span>
            </div>

            <div className="example-math-arrow" aria-hidden="true">
              <ArrowRight size={16} />
            </div>

            <div className="example-math-step">
              <span className="example-math-label">Split Between Finishers</span>
              <span className="example-math-val text-emerald font-bold">10 NIM each</span>
              <span className="example-math-desc">0% platform take</span>
            </div>

            <div className="example-math-arrow" aria-hidden="true">
              <ArrowRight size={16} />
            </div>

            <div className="example-math-step example-math-step--highlight">
              <span className="example-math-label">Each Finisher Gets</span>
              <span className="example-math-val text-gold font-bold">20 NIM Total</span>
              <span className="example-math-desc">10 Stake + 10 Reward</span>
            </div>
          </div>

          {/* Clear Calculation Breakdown Card */}
          <div className="example-outcome-breakdown">
            <div className="example-outcome-row">
              <div className="example-outcome-left">
                <ShieldCheck size={14} className="text-emerald" aria-hidden="true" />
                <span>Original 10 NIM Stake</span>
              </div>
              <span className="example-outcome-tag">100% Returned</span>
            </div>

            <div className="example-outcome-row">
              <div className="example-outcome-left">
                <Trophy size={14} className="text-gold" aria-hidden="true" />
                <span>Forfeited Pool Reward Share</span>
              </div>
              <span className="example-outcome-tag text-gold">+10 NIM</span>
            </div>

            <div className="example-outcome-total">
              <span>Total Received per Finisher:</span>
              <span className="example-total-highlight">20 NIM</span>
            </div>
          </div>

          {/* Separate NimStreak Bonus Note */}
          {showBonusNote && (
            <div className="example-bonus-note">
              <Sparkles size={13} className="text-gold flex-shrink-0" aria-hidden="true" />
              <span>
                <strong>Optional Protocol Bonus:</strong> NimStreak may provide a separate bonus based on existing rules (up to 50% of original stake, max 5 NIM per finisher, challenge-level max of 20 NIM), scaled proportionally when required.
              </span>
            </div>
          )}

          {/* Educational Disclaimer */}
          <div className="example-disclaimer">
            <Info size={11} className="flex-shrink-0" aria-hidden="true" />
            <span>
              This is an illustrative example of challenge economics. Actual outcomes depend on total participants,
              completion rates, and forfeit rules.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkedExampleCard;
