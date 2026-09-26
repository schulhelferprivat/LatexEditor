import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

export function executablePids(executable) {
  const result = spawnSync('lsof', ['-t', '-a', '-d', 'txt', '--', executable], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status === 1 && !result.stdout.trim() && !result.stderr.trim()) return [];
  assert.equal(result.status, 0, `Programmprozesse konnten nicht ermittelt werden: ${result.stderr}`);
  const lines = result.stdout.trim().split(/\s+/);
  assert(
    lines.every((line) => /^[1-9]\d*$/.test(line)),
    'Ungültige Prozess-ID von lsof.',
  );
  return [...new Set(lines.map(Number))];
}
