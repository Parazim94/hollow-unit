import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Pfade, damit der Build auch als ZIP auf Itch.io oder in einem Unterordner läuft
  base: './',
  build: {
    // three.js allein ist ~500 kB; für ein Spiel dieser Größe ist das in Ordnung
    chunkSizeWarningLimit: 800,
  },
});
