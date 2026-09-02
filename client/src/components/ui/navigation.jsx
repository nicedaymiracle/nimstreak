import React from "react";
import { shortenWalletAddress } from "../../utils/ui-helpers.js";

function NavIcon({ name }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "1.8",
    viewBox: "0 0 24 24",
    width: "22",
    height: "22",
  };

  const paths = {
    home: (
      <>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9.5V20h11V9.5" />
      </>
    ),
    browse: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    "my-streaks": (
      <>
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M6 20c1.2-3.5 3.5-5 6-5s4.8 1.5 6 5" />
      </>
    ),
  };

  return <svg aria-hidden="true" {...common}>{paths[name] || paths.home}</svg>;
}

export function AppBottomNav({ screen, onNavigate, walletAddress, onConnectWallet }) {
  const items = [
    { id: "home", label: "Home", icon: "home" },
    { id: "browse", label: "Browse", icon: "browse" },
    { id: "my-streaks", label: "My Streaks", icon: "my-streaks" },
    { id: "profile", label: "Profile", icon: "profile" },
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => {
        const isHomeOrBrowse = item.id === "home" || item.id === "browse";
        const isLocked = !walletAddress && !isHomeOrBrowse;
        const isActive = screen === item.id || (item.id === "browse" && screen === "challenge-detail");

        const handleClick = () => {
          if (isLocked) {
            if (typeof onConnectWallet === "function") {
              onConnectWallet();
            }
            return;
          }
          onNavigate(item.id);
        };

        return (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}
            onClick={handleClick}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.55rem 0.25rem",
              fontSize: "0.72rem",
              fontWeight: isActive ? 800 : 600,
              opacity: isLocked ? 0.45 : 1,
              cursor: "pointer",
              transition: "opacity 0.2s ease, transform 0.15s ease",
            }}
            title={isLocked ? "Connect Nimiq Wallet to unlock" : item.label}
          >
            <NavIcon name={item.icon} />
            <span className="bottom-nav__label" style={{ marginTop: "3px" }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
