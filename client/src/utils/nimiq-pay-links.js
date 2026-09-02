/**
 * Smart NimiqPay & Wallet Launcher
 */

export function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || "";
  return /android|iphone|ipad|ipod/i.test(ua);
}

export function launchNimiqPay({ onDesktopConnect, targetUrl = window.location.href } = {}) {
  const isMobile = isMobileDevice();

  if (isMobile) {
    const encodedUrl = encodeURIComponent(targetUrl);
    const deepLink = `nimiqpay://miniapp?url=${encodedUrl}`;
    
    const isAndroid = /android/i.test(navigator.userAgent);
    const storeUrl = isAndroid
      ? "https://play.google.com/store/apps/details?id=com.nimiq.pay"
      : "https://apps.apple.com/app/nimiq-pay/id6475734568";

    const start = Date.now();
    window.location.href = deepLink;

    setTimeout(() => {
      if (document.hidden || Date.now() - start > 2200) return;
      window.location.href = storeUrl;
    }, 1500);
  } else {
    // On Laptop / Desktop: Connect Nimiq Wallet & enter app directly
    if (typeof onDesktopConnect === "function") {
      onDesktopConnect();
    }
  }
}
