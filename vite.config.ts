import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const connectSources = ["'self'", 'blob:', process.env.VITE_BRIDGE_URL].filter(Boolean).join(' ');
const contentSecurityPolicy = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob:; connect-src ${connectSources}; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'`;
export default defineConfig({
  base: process.env.LATEXHELPER_BASE ?? '/',
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
