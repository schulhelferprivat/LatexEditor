import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bridge, bridgeUnreachable, bridgeDownloads } from '../src/infra/bridge';

afterEach(() => vi.unstubAllGlobals());

describe('bridge connection errors', () => {
  it('offers both portable downloads alongside an unreachable bridge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(new Bridge().connect()).rejects.toThrow(bridgeUnreachable);
    expect(bridgeDownloads.map((download) => download.url.split('/').at(-1))).toEqual([
      'LatexHelper-Bridge-Windows.exe',
      'LatexHelper-Bridge-macOS-arm64.zip',
    ]);
  });

  it('preserves the existing 403 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Zugriff verweigert', { status: 403 })));
    await expect(new Bridge().connect()).rejects.toThrow(
      'Bridge verweigert den Zugriff. Bitte die App über http://localhost:38471/ öffnen und den Zugriff auf lokale Geräte erlauben.',
    );
  });
});
