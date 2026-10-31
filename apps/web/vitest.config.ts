import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: [
      'app/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
      'features/**/*.test.{ts,tsx}',
    ],
  },
});
