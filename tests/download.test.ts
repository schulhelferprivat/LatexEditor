import { describe, it, expect } from 'vitest';
import {
  bridgeDownload,
  bridgeDownloadOptions,
  macArmDownload,
  windowsDownload,
} from '../src/infra/download';

const chrome = (platform: string, os: string) => ({
  platform,
  userAgent: `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36`,
});

describe('bridgeDownload', () => {
  it('offers the executable for Windows', () => {
    expect(bridgeDownload(chrome('Win32', 'Windows NT 10.0; Win64; x64'))).toBe(windowsDownload);
    expect(bridgeDownload({ platform: 'Windows' })).toBe(windowsDownload);
  });

  it('offers the Apple Silicon ZIP for macOS, which reports Intel in the agent', () => {
    expect(bridgeDownload(chrome('MacIntel', 'Macintosh; Intel Mac OS X 10_15_7'))).toBe(macArmDownload);
    expect(bridgeDownload({ platform: 'macOS' })).toBe(macArmDownload);
  });

  it('has no package for Linux or mobile', () => {
    expect(bridgeDownload(chrome('Linux x86_64', 'X11; Linux x86_64'))).toBeUndefined();
    expect(bridgeDownload(chrome('Linux armv8l', 'Linux; Android 14; Pixel 8'))).toBeUndefined();
    expect(bridgeDownload({ platform: 'iPhone' })).toBeUndefined();
    expect(bridgeDownload({ platform: 'MacIntel', maxTouchPoints: 5 })).toBeUndefined();
    expect(bridgeDownload({})).toBeUndefined();
  });

  it.each(['/', '/LatexEditor/', '/another-project/'])(
    'resolves downloads and checksums below %s',
    (base) => {
      const options = bridgeDownloadOptions(base);
      expect(options.map((option) => option.url)).toEqual([
        `${base}downloads/LatexHelper-Bridge-Windows.exe`,
        `${base}downloads/LatexHelper-Bridge-macOS-arm64.zip`,
      ]);
      for (const option of options) expect(option.checksumUrl).toBe(`${option.url}.sha256`);
    },
  );
});
