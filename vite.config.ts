import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
function commitCount() {
  try {
    return execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '?';
  }
}
const connectSources = ["'self'", 'blob:', process.env.VITE_BRIDGE_URL].filter(Boolean).join(' ');
const contentSecurityPolicy = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob:; connect-src ${connectSources}; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'`;
export default defineConfig({
  base: process.env.LATEXHELPER_BASE ?? '/',
  define: { __APP_VERSION__: JSON.stringify(commitCount()) },
  plugins: [
    react(),
    {
      name: 'content-security-policy',
      apply: 'build',
      transformIndexHtml: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy },
          injectTo: 'head-prepend',
        },
      ],
    },
  ],
  optimizeDeps: { include: ['nspell'] },
  server: { proxy: { '/api': 'http://localhost:38471' } },
  build: { target: 'es2022' },
});
