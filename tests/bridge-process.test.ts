import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawnSync: vi.fn(original.spawnSync) };
});

const modulePath = '../scripts/bridge-process.mjs';
const { executablePids } = await import(modulePath);
afterEach(() => vi.mocked(spawnSync).mockReset());

describe('application process lookup results', () => {
  function result(status: number, stdout: string, stderr = '') {
    vi.mocked(spawnSync).mockReturnValue({
      status,
      stdout,
      stderr,
      pid: 1,
      signal: null,
      output: [null, stdout, stderr],
    });
  }

  it('retains distinct processes while deduplicating repeated file entries', () => {
    result(0, '123\n123\n456\n');
    expect(executablePids('/temporary/Bridge Test')).toEqual([123, 456]);
  });

  it('accepts an empty result only when lsof reports no matches', () => {
    result(1, '');
    expect(executablePids('/temporary/Bridge Test')).toEqual([]);
  });

  it('reports lookup errors instead of claiming that the process is absent', () => {
    result(1, '', 'permission denied');
    expect(() => executablePids('/temporary/Bridge Test')).toThrow('permission denied');
  });

  it.each(['0\n', '-1\n', 'invalid\n', ''])('rejects unsafe PID output %j', (output) => {
    result(0, output);
    expect(() => executablePids('/temporary/Bridge Test')).toThrow('Ungültige Prozess-ID');
  });
});

describe.skipIf(process.platform !== 'darwin')('native macOS application process lookup', () => {
  it('finds the executable through an alias despite a different command name and arguments', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'latexhelper-process-'));
    const executable = path.join(directory, 'Bridge Test');
    const alias = path.join(directory, 'Bridge Alias');
    await cp('/bin/sleep', executable);
    await symlink(executable, alias);
    const child = spawn(executable, ['30'], { argv0: 'different-command-name' });
    try {
      await once(child, 'spawn');
      expect(executablePids(alias)).toEqual([child.pid]);
      expect(executablePids(executable)).toEqual([child.pid]);
    } finally {
      const closed = once(child, 'close');
      child.kill();
      await closed;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('returns no PID for an executable that is not running', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'latexhelper-process-'));
    const executable = path.join(directory, 'Bridge Test');
    try {
      await cp('/bin/sleep', executable);
      expect(executablePids(executable)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
