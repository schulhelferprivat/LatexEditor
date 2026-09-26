const releases = 'https://github.com/schulhelferprivat/LatexEditor/releases';
export const releasesPage = `${releases}/latest`;
const asset = (name: string) => `${releases}/latest/download/${name}`;
export type BridgeDownload = { label: string; url: string };
export const windowsDownload: BridgeDownload = {
  label: 'Windows (x64)',
  url: asset('LatexHelper-Windows-x64-Setup.exe'),
};
export const macArmDownload: BridgeDownload = {
  label: 'macOS (Apple Silicon)',
  url: asset('LatexHelper-macOS-arm64.dmg'),
};
export const macIntelDownload: BridgeDownload = {
  label: 'macOS (Intel)',
  url: asset('LatexHelper-macOS-x64.dmg'),
};
type PlatformSource = { platform?: string; userAgent?: string };
export function bridgeDownload(source: PlatformSource): BridgeDownload | undefined {
  const text = `${source.platform ?? ''} ${source.userAgent ?? ''}`.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(text)) return undefined;
  if (/win/.test(text)) return windowsDownload;
  if (/mac/.test(text)) return macArmDownload;
  return undefined;
}
export function currentDownload(): BridgeDownload | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return bridgeDownload({ platform: data?.platform ?? navigator.platform, userAgent: navigator.userAgent });
}
