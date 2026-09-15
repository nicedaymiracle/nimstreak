import React from "react";
import { launchNimiqPay } from "../../utils/nimiq-pay-links.js";
import { Smartphone, ArrowUpRight, X } from "lucide-react";

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
          <X size={18} />
        </button>

        <div className="wallet-notice-view">
          <div className="notice-icon-wrap">
            <Smartphone size={36} className="text-gold" aria-hidden="true" />
          </div>

          <h2 className="modal-title text-gold">Nimiq Pay Required</h2>
          
          <div className="notice-message-box">
            <p className="notice-primary-text">
              NimStreak uses <strong>Nimiq Pay</strong> to securely approve NIM transactions.
            </p>
            <p className="notice-secondary-text">
              Your NimStreak profile stays connected to your account, while Nimiq Pay handles transaction approval and determines the wallet account used for the payment.
            </p>
            <p className="notice-secondary-text" style={{ marginTop: "0.5rem" }}>
              Please open NimStreak from the Mini Apps section inside the Nimiq Pay app, or install Nimiq Pay on your mobile device below.
            </p>
          </div>

          <div className="notice-actions-grid">
            <button
              type="button"
              className="btn btn--gold-glow btn--full btn--lg"
              onClick={handleLaunchClick}
            >
              <span>Open / Get Nimiq Pay</span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NimiqPayNoticeModal;
