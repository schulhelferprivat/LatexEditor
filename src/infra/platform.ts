export type BrowserSource = {
  userAgent?: string;
  brands?: { brand: string; version: string }[];
  hasFilePicker?: boolean;
  secureContext?: boolean;
};
export function supportsFileSystemAccess(source: BrowserSource): boolean {
  return !!source.hasFilePicker && source.secureContext !== false;
}
export function isChromiumBrowser(source: BrowserSource): boolean {
  const brands = source.brands?.map((entry) => entry.brand.toLowerCase()) ?? [];
  if (brands.some((brand) => brand.includes('chromium'))) return true;
  const text = (source.userAgent ?? '').toLowerCase();
  if (/firefox|fxios/.test(text)) return false;
  if (/\bedg(e|a|ios)?\//.test(text)) return true;
  return /\b(crios|chrome|chromium)\//.test(text);
}
export function currentBrowser(): BrowserSource {
  if (typeof navigator === 'undefined') return {};
  const data = (
    navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[] } }
  ).userAgentData;
  return {
    userAgent: navigator.userAgent,
    brands: data?.brands,
    hasFilePicker: typeof (window as unknown as Record<string, unknown>).showOpenFilePicker === 'function',
    secureContext: window.isSecureContext,
  };
}
export function insecureChromium(source: BrowserSource): boolean {
  return isChromiumBrowser(source) && source.secureContext === false;
}
export type InstallPrompt = {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
let captured: InstallPrompt | null = null;
export function captureInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    captured = event as unknown as InstallPrompt;
    window.dispatchEvent(new Event('installpromptready'));
  });
  window.addEventListener('appinstalled', () => {
    captured = null;
  });
}
export function pendingInstallPrompt(): InstallPrompt | null {
  return captured;
}
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    navigatorStandalone === true ||
    ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    )
  );
}
