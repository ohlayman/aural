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
