import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    /*
     * Node by default: almost every test here is engine arithmetic, and a
     * DOM per file would cost more than the whole suite does. The handful
     * of interface tests opt in with a `@vitest-environment jsdom` comment
     * at the top of the file.
     */
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
