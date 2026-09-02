import React from "react";
import { launchNimiqPay } from "../../utils/nimiq-pay-links.js";

export function NimiqPayNoticeModal({
  isOpen,
  onClose,
}) {
  if (!isOpen) return null;

  const handleLaunchClick = () => {
    launchNimiqPay(window.location.href);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="wallet-notice-view">
          <div className="notice-icon-wrap">
            <span className="notice-icon">📱</span>
          </div>

          <h2 className="modal-title text-gold">NimiqPay Required</h2>
          
          <div className="notice-message-box">
            <p className="notice-primary-text">
              Sorry, <strong>NimStreak</strong> only works inside <strong>Nimiq Wallet</strong> with <strong>NimiqPay</strong> installed.
            </p>
            <p className="notice-secondary-text">
              Please open this application from your NimiqPay mini-app menu, or download the NimiqPay wallet app below.
            </p>
          </div>

          <div className="notice-actions-grid">
            <button
              type="button"
              className="btn btn--gold-glow btn--full btn--lg"
              onClick={handleLaunchClick}
            >
              <span>Open / Get NimiqPay</span>
              <span>↗</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
