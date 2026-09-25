import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const cache = await mkdtemp(path.join(tmpdir(), 'latexhelper-integration-'));
const executable =
  process.env.LATEXHELPER_BRIDGE ??
  path.resolve(
    'bridge/target/debug',
    process.platform === 'win32' ? 'latexhelper-bridge.exe' : 'latexhelper-bridge',
  );
const child = spawn(executable, [], {
  stdio: 'inherit',
  env: {
    ...process.env,
    LATEXHELPER_DEV: '0',
    LATEXHELPER_DIST: path.resolve('dist'),
    LATEXHELPER_CACHE_DIR: cache,
  },
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('close', async (code) => {
  await rm(cache, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});
