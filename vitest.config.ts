import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Kernlogik mit echten Kollaborateuren (pdf-lib, pdf.js) – ohne Attrappen.
// Alles, was echte Engines (WebAssembly) oder die Oberfläche braucht, prüft Playwright (tests/e2e).
export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: { conditions: ['browser'] },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
    testTimeout: 30000,
    // pdf.js meldet in Node fehlende Darstellungsschriften – für die Tests ohne Belang
    onConsoleLog: (log: string) => !log.includes('Unable to load font data'),
  },
});
