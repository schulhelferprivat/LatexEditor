export type BridgeDownload = { label: string; url: string; checksumUrl: string };
export function bridgeDownloadOptions(base = import.meta.env.BASE_URL): BridgeDownload[] {
  return [
    ['Windows (x64)', 'LatexHelper-Bridge-Windows.exe'],
    ['macOS (Apple Silicon / ARM64)', 'LatexHelper-Bridge-macOS-arm64.zip'],
  ].map(([label, name]) => {
    const url = `${base.replace(/\/$/, '')}/downloads/${name}`;
    return { label, url, checksumUrl: `${url}.sha256` };
  });
}
export const bridgeDownloads = bridgeDownloadOptions();
export const [windowsDownload, macArmDownload] = bridgeDownloads;
type PlatformSource = { platform?: string; userAgent?: string; maxTouchPoints?: number };
export function bridgeDownload(source: PlatformSource): BridgeDownload | undefined {
  const text = `${source.platform ?? ''} ${source.userAgent ?? ''}`.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(text)) return undefined;
  if (/mac/.test(text) && (source.maxTouchPoints ?? 0) > 1) return undefined;
  if (/win/.test(text)) return windowsDownload;
  if (/mac/.test(text)) return macArmDownload;
  return undefined;
}
export function currentDownload(): BridgeDownload | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return bridgeDownload({
    platform: data?.platform ?? navigator.platform,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}
