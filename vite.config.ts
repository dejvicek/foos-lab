/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { COMPAT } from './src/version.ts';
import pkg from './package.json';

// Verze appky pro lidi (1.0.0): jediné místo je package.json, viz CHANGELOG.md.
const VERSION = pkg.version;

// Označení sestavení: commit z GitHub Actions, lokálně čas sestavení.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const BUILD = env.GITHUB_SHA?.slice(0, 7) ?? `local-${Date.now().toString(36)}`;

/** version.json vedle appky – běžící appka podle něj pozná, že je nasazená novější verze. */
const versionFile = (): Plugin => ({
  name: 'foos-lab-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION, build: BUILD, compat: COMPAT }) });
  },
});

export default defineConfig({
  // relativní cesty: funguje na GitHub Pages pod /foos-lab/ i lokálně
  base: './',
  plugins: [react(), versionFile()],
  define: { __APP_BUILD__: JSON.stringify(BUILD), __APP_VERSION__: JSON.stringify(VERSION) },
  build: {
    rollupOptions: {
      // Service worker je druhý vstup: jeden soubor sw.js vedle index.html (bez otisku v názvu – adresa se nesmí měnit).
      input: { main: 'index.html', sw: 'src/sw/sw.ts' },
      output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
});
