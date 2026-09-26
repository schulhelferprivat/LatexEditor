import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { appVersion, buildNumber } from './version.mjs';
import { checksumFile, verifyDownload } from './verify-downloads.mjs';

const windows = process.platform === 'win32' && process.arch === 'x64';
const mac = process.platform === 'darwin' && process.arch === 'arm64';
if (!windows && !mac) throw new Error('Paketierung benötigt Windows x64 oder macOS ARM64.');
const target = windows ? 'x86_64-pc-windows-msvc' : 'aarch64-apple-darwin';
if (process.env.LATEXHELPER_TARGET && process.env.LATEXHELPER_TARGET !== target)
  throw new Error('Runner und Zielarchitektur stimmen nicht überein.');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} fehlgeschlagen: ${result.status}`);
  return result.stdout?.trim();
}

const sysroot = run('rustc', ['--print', 'sysroot'], { stdio: 'pipe', encoding: 'utf8' });
const mappings = [
  [homedir(), '/build/user'],
  [process.env.CARGO_HOME ?? path.join(homedir(), '.cargo'), '/build/cargo'],
  [sysroot, '/build/rust'],
  [process.cwd(), '/build/latexhelper'],
];
const flags = mappings.flatMap(([source, destination]) =>
  [...new Set([source, source.replaceAll('\\', '/')])].map(
    (prefix) => `--remap-path-prefix=${prefix}=${destination}`,
  ),
);
if (windows) flags.push('-Ctarget-feature=+crt-static', '-Clink-arg=/PDBALTPATH:latexhelper-bridge.pdb');
run('cargo', ['build', '--manifest-path', 'bridge/Cargo.toml', '--release', '--locked', '--target', target], {
  env: {
    ...process.env,
    CARGO_ENCODED_RUSTFLAGS: flags.join('\x1f'),
    CARGO_PROFILE_RELEASE_DEBUG: '0',
    CARGO_PROFILE_RELEASE_STRIP: 'symbols',
    CARGO_PROFILE_RELEASE_SPLIT_DEBUGINFO: 'off',
    MACOSX_DEPLOYMENT_TARGET: '13.0',
  },
});

const version = await appVersion();
const build = buildNumber();
const name = windows ? 'LatexHelper-Bridge-Windows.exe' : 'LatexHelper-Bridge-macOS-arm64.zip';
const output = path.resolve('release', name);
await mkdir('release', { recursive: true });
const binary = path.resolve('bridge/target', target, 'release', `latexhelper-bridge${windows ? '.exe' : ''}`);
if (windows) {
  await cp(binary, output);
} else {
  const stage = await mkdtemp(path.join(tmpdir(), 'latexhelper-package-'));
  try {
    const bundle = path.join(stage, 'LatexHelper Bridge.app');
    const executable = path.join(bundle, 'Contents/MacOS/latexhelper-bridge');
    await mkdir(path.dirname(executable), { recursive: true });
    await cp(binary, executable);
    await chmod(executable, 0o755);
    await writeFile(
      path.join(bundle, 'Contents/Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>de.latexhelper.bridge</string><key>CFBundleName</key><string>LatexHelper Bridge</string><key>CFBundleExecutable</key><string>latexhelper-bridge</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${build}</string><key>LSUIElement</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string></dict></plist>`,
    );
    run('codesign', ['--force', '--sign', '-', '--timestamp=none', bundle]);
    await rm(output, { force: true });
    run('ditto', ['-c', '-k', '--keepParent', '--norsrc', '--noextattr', bundle, output]);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
await writeFile(`${output}.sha256`, await checksumFile(output));
await verifyDownload(output);
console.log(`Paket erstellt: ${name} (Version ${version}, Build ${build})`);
