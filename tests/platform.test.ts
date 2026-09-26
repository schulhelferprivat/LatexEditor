import { describe, it, expect } from 'vitest';
import { insecureChromium, isChromiumBrowser, supportsFileSystemAccess } from '../src/infra/platform';

const agents = {
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
};

describe('isChromiumBrowser', () => {
  it('recognises Chrome and Edge', () => {
    expect(isChromiumBrowser({ userAgent: agents.chrome })).toBe(true);
    expect(isChromiumBrowser({ userAgent: agents.edge })).toBe(true);
  });

  it('rejects Firefox and Safari', () => {
    expect(isChromiumBrowser({ userAgent: agents.firefox })).toBe(false);
    expect(isChromiumBrowser({ userAgent: agents.safari })).toBe(false);
    expect(isChromiumBrowser({})).toBe(false);
  });

  it('trusts the brand list over the agent string', () => {
    expect(
      isChromiumBrowser({ userAgent: agents.firefox, brands: [{ brand: 'Chromium', version: '140' }] }),
    ).toBe(true);
  });
});

describe('supportsFileSystemAccess', () => {
  it('needs the picker and a secure context', () => {
    expect(supportsFileSystemAccess({ hasFilePicker: true, secureContext: true })).toBe(true);
    expect(supportsFileSystemAccess({ hasFilePicker: false, secureContext: true })).toBe(false);
    expect(supportsFileSystemAccess({ hasFilePicker: true, secureContext: false })).toBe(false);
  });
});

describe('insecureChromium', () => {
  it('separates a plain-http Chromium from a foreign browser', () => {
    expect(insecureChromium({ userAgent: agents.chrome, secureContext: false })).toBe(true);
    expect(insecureChromium({ userAgent: agents.chrome, secureContext: true })).toBe(false);
    expect(insecureChromium({ userAgent: agents.firefox, secureContext: false })).toBe(false);
  });
});
