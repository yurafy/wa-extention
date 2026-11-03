import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/content/bridge.ts'),
      name: 'BridgeScript',
      formats: ['iife'],
      fileName: () => 'bridge.js',
    },
  },
});
