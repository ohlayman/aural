import { LocalStorage } from './local.js';
import type { Storage } from './types.js';

export type StorageEnv = {
  root: string;
  secret: string;
  publicBaseUrl?: string;
};

export function createStorage(env: StorageEnv): Storage {
  return new LocalStorage(env.root, env.secret, env.publicBaseUrl);
}

export function createStorageFromEnv(): Storage {
  const root = process.env.STORAGE_DIR || '.data/audio';
  const secret = process.env.STORAGE_SECRET || 'dev-secret';
  if (process.env.NODE_ENV === 'production' && !process.env.STORAGE_SECRET) {
    throw new Error('STORAGE_SECRET is required in production');
  }
  const publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL || 'http://localhost:8787';
  return createStorage({ root, secret, publicBaseUrl });
}

export type { Storage } from './types.js';
export { LocalStorage } from './local.js';
