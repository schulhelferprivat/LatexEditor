import { describe, it, expect, vi } from 'vitest';
const fs = vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => {} },
    configurable: true,
  });
  return {
    permission: vi.fn(async () => {}),
    write: vi.fn(async () => {}),
    lastDocument: vi.fn(async () => undefined),
    readConfig: vi.fn(),
    optionalText: vi.fn(async (): Promise<string | null> => null),
    collectFiles: vi.fn(),
    fileTypes: [],
    ConflictError: Error,
  };
});
vi.mock('../src/infra/files', () => fs);
import { AppController } from '../src/domain/app';
import type { Capabilities } from '../src/domain/types';

const capabilities = {
  version: '1',
  engines: ['lualatex'],
  tools: ['lualatex'],
  preamble: true,
  texDir: null,
  gnuplotDir: null,
  gnuplotPath: null,
} as unknown as Capabilities;

function controller(connect: () => Promise<Capabilities>) {
  const app = new AppController();
  app.bridge.connect = connect;
  return app;
}

describe('bridge offline state', () => {
  it('marks the bridge offline when the handshake fails', async () => {
    const app = controller(() => Promise.reject(new Error('nope')));
    await app.connectBridge();
    expect(app.state.bridgeOffline).toBe(true);
    expect(app.state.capabilities).toBeUndefined();
  });

  it('clears stale capabilities when a connected bridge disappears', async () => {
    let up = true;
    const app = controller(() => (up ? Promise.resolve(capabilities) : Promise.reject(new Error('gone'))));
    await app.connectBridge();
    expect(app.state.capabilities).toBe(capabilities);
    up = false;
    await app.connectBridge();
    expect(app.state.bridgeOffline).toBe(true);
    expect(app.state.capabilities).toBeUndefined();
  });

  it('recovers and resets the status when the bridge returns', async () => {
    let up = false;
    const app = controller(() => (up ? Promise.resolve(capabilities) : Promise.reject(new Error('gone'))));
    await app.connectBridge();
    app.state.status = 'irgendwas';
    up = true;
    await app.connectBridge();
    expect(app.state.bridgeOffline).toBe(false);
    expect(app.state.capabilities).toBe(capabilities);
    expect(app.state.status).toBe('Bereit');
  });

  it('does not re-render on repeated failures while already offline', async () => {
    const app = controller(() => Promise.reject(new Error('nope')));
    let emits = 0;
    app.subscribe(() => emits++);
    await app.connectBridge();
    expect(emits).toBe(1);
    await app.connectBridge();
    expect(emits).toBe(1);
  });
});
