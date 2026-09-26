import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pattern = /^(\d+)\.(\d+)\.(\d+)$/;
export const versionFile = path.join(root, 'VERSION');
export async function appVersion() {
  const version = (await readFile(versionFile, 'utf8')).trim();
  if (!pattern.test(version))
    throw new Error(`VERSION muss MAJOR.MINOR.PATCH enthalten, gelesen: ${version}`);
  return version;
}
export function tagVersion() {
  const ref = process.env.GITHUB_REF_NAME ?? '';
  const tag = ref.startsWith('v') ? ref.slice(1) : '';
  return pattern.test(tag) ? tag : undefined;
}
export async function releaseVersion() {
  const version = await appVersion();
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (manifest.version !== version)
    throw new Error(`package.json ${manifest.version} weicht von VERSION ${version} ab.`);
  const tag = tagVersion();
  if (tag && tag !== version)
    throw new Error(`Tag v${tag} weicht von VERSION ${version} ab. VERSION anpassen und committen.`);
  return version;
}
export function buildNumber() {
  const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8', cwd: root });
  const count = result.status === 0 ? result.stdout.trim() : '';
  return /^\d+$/.test(count) ? count : '1';
}
