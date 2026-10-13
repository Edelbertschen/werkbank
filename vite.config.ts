import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// SharedArrayBuffer (LibreOffice, Tesseract) braucht Cross-Origin-Isolation – auch im Entwicklungsserver.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  plugins: [svelte()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  server: { port: 5173, strictPort: true, headers: isolation },
  preview: { port: 4173, headers: isolation },
  worker: { format: 'es' },
  build: {
    target: ['safari15', 'chrome100', 'edge100', 'firefox115'],
    chunkSizeWarningLimit: 6000,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: process.env.WB_TEST ? { input: { main: 'index.html', engines: 'test/engines.html' } } : undefined,
  },
  optimizeDeps: {
    exclude: ['@bentopdf/pymupdf-wasm', '@bentopdf/gs-wasm', '@matbee/libreoffice-converter'],
  },
});
