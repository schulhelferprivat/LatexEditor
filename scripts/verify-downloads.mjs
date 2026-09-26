import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

export const downloadNames = ['LatexHelper-Bridge-Windows.exe', 'LatexHelper-Bridge-macOS-arm64.zip'];
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export async function checksumFile(file) {
  return `${sha256(await readFile(file))}  ${path.basename(file)}\n`;
}
export async function verifyDownload(file) {
  const expected = await readFile(`${file}.sha256`, 'utf8');
  if (expected !== (await checksumFile(file)))
    throw new Error(`SHA-256 stimmt nicht: ${path.basename(file)}`);
  console.log(`SHA-256 geprüft: ${path.basename(file)}`);
}

async function verifyPublished(directory, base) {
  for (const name of downloadNames) {
    const expected = await readFile(path.join(directory, `${name}.sha256`), 'utf8');
    let failure;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const url = new URL(`downloads/${name}`, base.endsWith('/') ? base : `${base}/`);
        url.searchParams.set('verify', `${Date.now()}-${attempt}`);
        const checksumUrl = new URL(url);
        checksumUrl.pathname += '.sha256';
        const responses = await Promise.all(
          [url, checksumUrl].map((address) =>
            fetch(address, { signal: AbortSignal.timeout(30000), cache: 'no-store' }),
          ),
        );
        if (responses.some((response) => !response.ok)) throw new Error(`Download nicht erreichbar: ${name}`);
        const actual = `${sha256(Buffer.from(await responses[0].arrayBuffer()))}  ${name}\n`;
        if (actual !== expected || (await responses[1].text()) !== expected)
          throw new Error(`Veröffentlichter Download weicht vom Build ab: ${name}`);
        failure = undefined;
        break;
      } catch (error) {
        failure = error;
        if (attempt < 5) await setTimeout(10000);
      }
    }
    if (failure) throw failure;
    console.log(`Öffentlicher Download und SHA-256 geprüft: ${name}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2] ?? 'dist/downloads';
  if (process.argv[3]) await verifyPublished(directory, process.argv[3]);
  else for (const name of downloadNames) await verifyDownload(path.join(directory, name));
}
