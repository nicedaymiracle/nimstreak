import React, { useState, useMemo } from "react";
import { CATEGORIES, CategoryBadge, StatusIndicator } from "../ui/streak-stickers.jsx";

export function BrowseScreen({
  challenges = [],
  loading = false,
  onSelectChallenge,
  onJoinByCode,
  walletAddress,
  onConnectWallet,
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeError, setCodeError] = useState("");

  const filteredChallenges = useMemo(() => {
    return challenges.filter((c) => {
      const matchCat =
        selectedCategory === "all" || (c.category || "").toLowerCase() === selectedCategory.toLowerCase();
      const matchSearch =
        !searchQuery ||
        (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [challenges, selectedCategory, searchQuery]);

  const handleJoinCode = async (e) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;

    if (!walletAddress) {
      if (typeof onConnectWallet === "function") onConnectWallet();
      return;
    }

    setCodeSubmitting(true);
    setCodeError("");
    try {
      await onJoinByCode(inviteCodeInput.trim().toUpperCase());
      setInviteCodeInput("");
    } catch (err) {
      setCodeError(err.message || "Failed to join via invite code");
    } finally {
      setCodeSubmitting(false);
    }
  };

  return (
    <div className="screen-container browse-screen">
      <header className="page-header">
        <h1 className="page-title">Browse Challenges</h1>
        <p className="page-subtitle">Find a community challenge or join an invite-only group.</p>
      </header>

      {/* Invite Code Section */}
      <section className="invite-code-card" aria-labelledby="invite-code-heading">
        <div className="invite-code-card__header">
          <div className="invite-code-card__icon" aria-hidden="true">🔑</div>
          <div className="invite-code-card__header-text">
            <h2 id="invite-code-heading" className="invite-code-card__title">Have an Invite Code?</h2>
            <p className="invite-code-card__subtitle">
              Join a private or invite-only community streak challenge.
            </p>
          </div>
        </div>

        <form onSubmit={handleJoinCode} className="invite-code-form">
          <div className="invite-code-input-wrap">
            <input
              type="text"
              id="browse-invite-code-input"
              placeholder="e.g. STREAK7 or ABC12"
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
              maxLength={10}
              aria-label="Invite code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
              className="form-input form-input--code"
            />
          </div>
          <button
            type="submit"
            className={`btn invite-code-btn ${inviteCodeInput.trim() ? "btn--gold" : "btn--disabled"}`}
            disabled={codeSubmitting || !inviteCodeInput.trim()}
          >
            {codeSubmitting ? (
              <span>Joining...</span>
            ) : (
              <>
                <span>Join Challenge</span>
                <span className="btn__arrow" aria-hidden="true">→</span>
              </>
            )}
          </button>
        </form>
        {codeError && <p className="form-error invite-code-error" role="alert">{codeError}</p>}
      </section>

      {/* Search & Filter Bar */}
      <div className="filter-controls" aria-label="Search and category filters">
        <div className="search-input-wrap">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            id="browse-search-input"
            aria-label="Search challenges by title or habit"
            placeholder="Search challenges by title or habit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input form-input--search"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search query"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="category-scroll-list" role="tablist" aria-label="Filter challenges by category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              className={`cat-pill ${selectedCategory === cat.id ? "cat-pill--active" : ""}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <span className="cat-pill__emoji" aria-hidden="true">{cat.emoji}</span>
              <span className="cat-pill__label">{cat.label}</span>
            </button>
          ))}
          <div className="category-scroll-spacer" aria-hidden="true"></div>
        </div>
      </div>

      {/* Challenge Cards Grid */}
      <main className="challenges-grid" aria-label="Challenges list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading live challenges...</p>
          </div>
        ) : filteredChallenges.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon" aria-hidden="true">🎯</span>
            <h3>No challenges found</h3>
            <p>Be the first to start a challenge in this category!</p>
          </div>
        ) : (
          filteredChallenges.map((item) => {
            const participantsCount = item.active_participants_count ?? item.total_participants ?? 1;
            const totalPool = item.total_pool_nim ?? item.stake_nim;

            return (
              <article
                key={item.id}
                className="challenge-card"
                onClick={() => onSelectChallenge(item.id)}
                role="button"
                tabIndex={0}
              >
                <div className="challenge-card__top">
                  <CategoryBadge category={item.category} />
                  <span className="challenge-card__duration">
                    ⏱️ {item.duration_days} Days
                  </span>
                </div>

                <h2 className="challenge-card__title">{item.title}</h2>
                {item.description && (
                  <p className="challenge-card__desc">{item.description}</p>
                )}

                <div className="challenge-card__stats-row">
                  <div className="c-stat">
                    <span className="c-stat__icon" aria-hidden="true">💎</span>
                    <div className="c-stat__meta">
                      <span className="c-stat__val">{item.stake_nim} NIM</span>
                      <span className="c-stat__lbl">Stake</span>
                    </div>
                  </div>

                  <div className="c-stat">
                    <span className="c-stat__icon" aria-hidden="true">👥</span>
                    <div className="c-stat__meta">
                      <span className="c-stat__val">{participantsCount}</span>
                      <span className="c-stat__lbl">Active</span>
                    </div>
                  </div>

                  <div className="c-stat">
                    <span className="c-stat__icon" aria-hidden="true">🏆</span>
                    <div className="c-stat__meta">
                      <span className="c-stat__val">{totalPool} NIM</span>
                      <span className="c-stat__lbl">Pool</span>
                    </div>
                  </div>
                </div>

                <div className="challenge-card__footer">
                  <span className="challenge-card__type">
                    {item.type === "group" ? "👥 Group" : item.type === "solo" ? "👤 Solo" : "🌐 Public"}
                  </span>
                  <button
                    type="button"
                    className="btn btn--primary challenge-card__action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectChallenge(item.id);
                    }}
                  >
                    <span>View & Stake</span>
                    <span className="btn__arrow" aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </main>
    </div>
  );
}
