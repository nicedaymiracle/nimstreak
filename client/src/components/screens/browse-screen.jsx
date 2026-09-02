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

      {/* Invite Code Box */}
      <section className="invite-code-card">
        <div className="invite-code-card__icon">🔑</div>
        <div className="invite-code-card__form-wrap">
          <h3>Have an Invite Code?</h3>
          <form onSubmit={handleJoinCode} className="invite-code-form">
            <input
              type="text"
              placeholder="e.g. FIT30 or ABC12"
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
              maxLength={10}
              className="form-input form-input--code"
            />
            <button
              type="submit"
              className="btn btn--gold btn--sm"
              disabled={codeSubmitting || !inviteCodeInput.trim()}
            >
              {codeSubmitting ? "Joining..." : "Join"}
            </button>
          </form>
          {codeError && <p className="form-error">{codeError}</p>}
        </div>
      </section>

      {/* Search & Filter Bar */}
      <div className="filter-controls">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
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
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="category-scroll-list" role="tablist">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              className={`cat-pill ${selectedCategory === cat.id ? "cat-pill--active" : ""}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <span className="cat-pill__emoji">{cat.emoji}</span>
              <span className="cat-pill__label">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Challenge Cards Grid */}
      <main className="challenges-grid">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading live challenges...</p>
          </div>
        ) : filteredChallenges.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">🎯</span>
            <h3>No challenges found</h3>
            <p>Be the first to start a challenge in this category!</p>
          </div>
        ) : (
          filteredChallenges.map((item) => {
            const participantsCount = item.active_participants_count ?? item.total_participants ?? 1;
            const quittersCount = item.quitters_count ?? 0;
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
                    <span className="c-stat__icon">💎</span>
                    <div className="c-stat__meta">
                      <span className="c-stat__val">{item.stake_nim} NIM</span>
                      <span className="c-stat__lbl">Stake</span>
                    </div>
                  </div>

                  <div className="c-stat">
                    <span className="c-stat__icon">👥</span>
                    <div className="c-stat__meta">
                      <span className="c-stat__val">{participantsCount}</span>
                      <span className="c-stat__lbl">Active</span>
                    </div>
                  </div>

                  <div className="c-stat">
                    <span className="c-stat__icon">🏆</span>
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
                    className="btn btn--primary btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectChallenge(item.id);
                    }}
                  >
                    View & Stake →
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
