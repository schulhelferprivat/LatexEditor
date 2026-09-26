import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { setDefaultResultOrder } from 'node:dns';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { verifyDownload } from './verify-downloads.mjs';

setDefaultResultOrder('ipv4first');

const windows = process.platform === 'win32' && process.arch === 'x64';
const mac = process.platform === 'darwin' && process.arch === 'arm64';
assert(windows || mac, 'Paketprüfung benötigt Windows x64 oder macOS ARM64.');
const name = windows ? 'LatexHelper-Bridge-Windows.exe' : 'LatexHelper-Bridge-macOS-arm64.zip';
const source = path.resolve('release', name);
await verifyDownload(source);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function verifyWindows(data) {
  assert.equal(data.toString('ascii', 0, 2), 'MZ');
  const pe = data.readUInt32LE(0x3c);
  assert.equal(data.readUInt32LE(pe), 0x4550);
  assert.equal(data.readUInt16LE(pe + 4), 0x8664, 'Windows-Datei muss x64 sein.');
  const optional = pe + 24;
  assert.equal(data.readUInt16LE(optional), 0x20b);
  assert.equal(data.readUInt32LE(optional + 112 + 4 * 8), 0, 'Keine Authenticode-Signatur erwartet.');
  const sections = pe + 24 + data.readUInt16LE(pe + 20);
  function offset(rva) {
    for (let i = 0; i < data.readUInt16LE(pe + 6); i++) {
      const section = sections + i * 40;
      const address = data.readUInt32LE(section + 12);
      const size = Math.max(data.readUInt32LE(section + 8), data.readUInt32LE(section + 16));
      if (rva >= address && rva < address + size) return data.readUInt32LE(section + 20) + rva - address;
    }
    throw new Error('Ungültige PE-Adresse.');
  }
  const imports = data.readUInt32LE(optional + 112 + 8);
  assert(imports, 'Windows-Importtabelle fehlt.');
  const libraries = [];
  for (let entry = offset(imports); data.readUInt32LE(entry + 12); entry += 20) {
    const start = offset(data.readUInt32LE(entry + 12));
    libraries.push(data.toString('ascii', start, data.indexOf(0, start)).toLowerCase());
  }
  for (const library of libraries)
    assert(
      /^(api-ms-win-.*|kernel32|ntdll|advapi32|bcrypt|bcryptprimitives|crypt32|ws2_32|userenv|user32|gdi32|shell32|ole32|oleaut32|secur32|rpcrt4|normaliz|iphlpapi|psapi|dbghelp|synchronization|ucrtbase)\.dll$/.test(
        library,
      ),
      `Zusätzliche Windows-Laufzeitabhängigkeit: ${library}`,
    );
  assert.equal(data.readUInt32LE(optional + 112 + 13 * 8), 0, 'Keine verzögerten DLL-Imports erwartet.');
}

async function verifyPrivacy(directory) {
  const forbidden = [
    process.cwd(),
    homedir(),
    process.env.CARGO_HOME,
    run('rustc', ['--print', 'sysroot']).trim(),
  ]
    .filter(Boolean)
    .flatMap((value) => [value, value.replaceAll('\\', '/')]);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await verifyPrivacy(file);
    else {
      const data = await readFile(file);
      for (const encoding of ['utf8', 'utf16le']) {
        const text = data.toString(encoding);
        for (const value of forbidden)
          assert(!text.includes(value), 'Lokaler Entwickler- oder Toolchain-Pfad im Paket.');
        assert(!/(?:\/Users\/|\/home\/|[A-Z]:[\\/]Users[\\/])[^\s\0]+/i.test(text), 'Benutzerpfad im Paket.');
        assert(!/[\w.+-]+@[\w-]+(?:\.[a-z]{2,})+/i.test(text), 'E-Mail-Adresse im Paket.');
      }
    }
  }
}

const stage = await mkdtemp(path.join(tmpdir(), 'latexhelper-portable-'));
const cache = await mkdtemp(path.join(tmpdir(), 'latexhelper-cache-'));
let child;
let bundlePid;
async function stop() {
  if (bundlePid) {
    try {
      process.kill(bundlePid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    bundlePid = undefined;
  }
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'close');
    child.kill();
    await Promise.race([closed, setTimeout(5000)]);
  }
  child = undefined;
}
async function handshake() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch('http://localhost:38471/api/v1/session', {
      method: 'POST',
      headers: {
        Origin: 'https://schulhelferprivat.github.io',
        'X-LatexHelper-Client': '1',
      },
      signal: AbortSignal.timeout(1000),
    }).catch(() => undefined);
    if (response) {
      assert.equal(response.status, 200);
      const session = await response.json();
      assert.equal(session.capabilities.version, '1');
      assert(session.token);
      const capabilities = await fetch('http://localhost:38471/api/v1/capabilities/refresh', {
        method: 'POST',
        headers: {
          Origin: 'https://schulhelferprivat.github.io',
          Authorization: `Bearer ${session.token}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(capabilities.status, 200);
      assert.equal((await capabilities.json()).version, '1');
      return;
    }
    assert(child?.exitCode === null && child?.signalCode === null, 'Bridge vor dem Handshake beendet.');
    await setTimeout(250);
  }
  throw new Error('Bridge startet nicht aus dem portablen Paket.');
}

try {
  const port = createServer();
  port.listen(38471, '127.0.0.1');
  await once(port, 'listening');
  await new Promise((resolve, reject) => port.close((error) => (error ? reject(error) : resolve())));
  let executable;
  const bundle = path.join(stage, 'LatexHelper Bridge.app');
  if (windows) {
    executable = path.join(stage, name);
    await cp(source, executable);
    verifyWindows(await readFile(executable));
  } else {
    run('ditto', ['-x', '-k', source, stage]);
    executable = path.join(bundle, 'Contents/MacOS/latexhelper-bridge');
    assert.equal(run('lipo', ['-archs', executable]).trim(), 'arm64');
    assert((await stat(executable)).mode & 0o111, 'Ausführungsrechte fehlen.');
    const libraries = run('otool', ['-L', executable]).trim().split('\n').slice(1);
    assert(libraries.length > 0);
    assert(
      libraries.every((line) => /^\s*\/(usr\/lib|System\/Library)\//.test(line)),
      'Externe macOS-Bibliothek.',
    );
    run('codesign', ['--verify', '--strict', bundle]);
    const signature = run('codesign', ['--display', '--verbose=4', bundle]);
    assert(signature.includes('Signature=adhoc'));
    assert(signature.includes('TeamIdentifier=not set'));
    assert(!signature.includes('Authority='));
    run('plutil', ['-lint', path.join(bundle, 'Contents/Info.plist')]);
  }
  await verifyPrivacy(stage);
  const env = { ...process.env, LATEXHELPER_CACHE_DIR: cache };
  delete env.LATEXHELPER_DEV;
  delete env.LATEXHELPER_DIST;
  child = spawn(executable, [], { cwd: stage, env, stdio: 'inherit' });
  await once(child, 'spawn');
  await handshake();
  await stop();
  if (mac) {
    child = spawn('open', ['-n', '-W', bundle], { cwd: stage, env, stdio: 'inherit' });
    await once(child, 'spawn');
    try {
      await handshake();
    } finally {
      const pattern = `^${executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
      const result = spawnSync('pgrep', ['-f', pattern], { encoding: 'utf8' });
      if (result.status === 0) bundlePid = Number(result.stdout.trim());
    }
    assert(Number.isInteger(bundlePid) && bundlePid > 0, 'PID der gestarteten Anwendung fehlt.');
    await stop();
  }
  console.log(`Eigenständiger Start, API, Architektur, Abhängigkeiten und Datenschutz geprüft: ${name}`);
} finally {
  await stop();
  await rm(stage, { recursive: true, force: true });
  await rm(cache, { recursive: true, force: true });
}
