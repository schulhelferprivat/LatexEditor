import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, chmod, access } from 'node:fs/promises';
import path from 'node:path';
import { buildNumber, releaseVersion } from './version.mjs';
const platform = process.platform;
if (!['win32', 'darwin'].includes(platform))
  throw new Error('Native Installationspakete werden auf Windows oder macOS gebaut.');
const architecture = process.arch === 'arm64' ? 'arm64' : 'x64';
const appUrl = process.env.LATEXHELPER_APP_URL ?? 'http://localhost:38471/';
const version = await releaseVersion();
const build = buildNumber();
if (platform === 'win32' && architecture !== 'x64')
  throw new Error('Windows-Paket benötigt einen x64-Build.');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} fehlgeschlagen: ${result.status}`);
}
run(process.execPath, ['scripts/assets.mjs']);
run(process.execPath, ['node_modules/typescript/bin/tsc', '-b']);
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
run('cargo', ['build', '--manifest-path', 'bridge/Cargo.toml', '--release', '--locked']);
run(process.execPath, ['scripts/rust-licenses.mjs']);
await cp('public/licenses', 'dist/licenses', { recursive: true });
run(process.execPath, ['scripts/service-worker.mjs']);
const stage = path.resolve('release', `LatexHelper-${platform}-${architecture}`);
await mkdir(stage, { recursive: true });
if (platform === 'win32') {
  await cp('bridge/target/release/latexhelper-bridge.exe', path.join(stage, 'latexhelper-bridge.exe'));
  await cp('dist', path.join(stage, 'dist'), { recursive: true });
  if (process.env.LATEXHELPER_SIGN_COMMAND)
    throw new Error(
      'Shell-Signierbefehle werden nicht unterstützt. SignTool direkt vor dem Paketieren verwenden.',
    );
  const compiler = process.env.LATEXHELPER_ISCC ?? 'C:/Program Files (x86)/Inno Setup 6/ISCC.exe';
  await access(compiler);
  run(compiler, [
    `/DSourceDir=${stage}`,
    `/DOutputDir=${path.resolve('release')}`,
    `/DAppUrl=${appUrl}`,
    `/DAppVersion=${version}`,
    'packaging/windows/latexhelper.iss',
  ]);
} else {
  const bundle = path.join(stage, 'LatexHelper Bridge.app');
  const executable = path.join(bundle, 'Contents/MacOS');
  await mkdir(executable, { recursive: true });
  await cp('bridge/target/release/latexhelper-bridge', path.join(executable, 'latexhelper-bridge'));
  await chmod(path.join(executable, 'latexhelper-bridge'), 0o755);
  await cp('dist', path.join(executable, 'dist'), { recursive: true });
  await writeFile(
    path.join(bundle, 'Contents/Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>de.latexhelper.bridge</string><key>CFBundleName</key><string>LatexHelper Bridge</string><key>CFBundleExecutable</key><string>latexhelper-bridge</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${build}</string><key>LSUIElement</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string></dict></plist>`,
  );
  for (const name of ['Install-LatexHelper.command', 'Uninstall-LatexHelper.command']) {
    const script = await readFile(`packaging/macos/${name}`, 'utf8');
    await writeFile(path.join(stage, name), script.replaceAll('__LATEXHELPER_APP_URL__', appUrl));
    await chmod(path.join(stage, name), 0o755);
  }
  if (process.env.LATEXHELPER_SIGNING_IDENTITY)
    run('codesign', [
      '--force',
      '--timestamp',
      '--options',
      'runtime',
      '--sign',
      process.env.LATEXHELPER_SIGNING_IDENTITY,
      bundle,
    ]);
  const image = path.resolve('release', `LatexHelper-macOS-${architecture}.dmg`);
  run('hdiutil', ['create', '-volname', 'LatexHelper', '-srcfolder', stage, '-ov', '-format', 'UDZO', image]);
  if (process.env.LATEXHELPER_NOTARY_PROFILE) {
    run('xcrun', [
      'notarytool',
      'submit',
      image,
      '--keychain-profile',
      process.env.LATEXHELPER_NOTARY_PROFILE,
      '--wait',
    ]);
    run('xcrun', ['stapler', 'staple', image]);
  }
}
console.log(`Paket erstellt: ${stage} (Version ${version}, Build ${build})`);
