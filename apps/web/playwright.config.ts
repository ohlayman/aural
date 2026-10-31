import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: [
    {
      command: 'corepack pnpm --filter @aural/api dev',
      url: 'http://localhost:8787/health',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        TTS_PROVIDERS: 'fixture',
        STT_PROVIDERS: 'fixture',
        DEFAULT_TTS_PROVIDER: 'fixture',
        DATABASE_URL: 'postgres://aural@127.0.0.1:5433/aural',
        STORAGE_DIR: '.data/audio',
        // Keep signed file URLs on the web origin so fetch can follow the 302
        // through the /api/v1 rewrite instead of hitting a cross-origin URL.
        STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000',
      },
    },
    {
      command: 'corepack pnpm --filter @aural/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
