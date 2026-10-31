import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import type { Storage } from './types.js';

// 允许 `.` 以支持 `audio/a.mp3` 这类扩展名；`..` 单独拒绝。
const KEY_PATTERN = /^[a-zA-Z0-9/_.-]+$/;

function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.startsWith('/')) {
    throw new Error(`invalid key: ${key}`);
  }
}

export class LocalStorage implements Storage {
  private readonly root: string;
  private readonly secret: string;
  private readonly publicBaseUrl: string;

  constructor(root: string, secret: string, publicBaseUrl = '') {
    this.root = root;
    this.secret = secret;
    this.publicBaseUrl = publicBaseUrl;
  }

  private resolvePath(key: string): string {
    assertValidKey(key);
    return join(this.root, key);
  }

  private sign(key: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${key}:${exp}`).digest('hex');
  }

  async put(key: string, data: Buffer | ReadableStream): Promise<{ size: number }> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      if (Buffer.isBuffer(data)) {
        await writeFile(tmpPath, data);
      } else {
        await pipeline(Readable.fromWeb(data), createWriteStream(tmpPath));
      }
      const { size } = await stat(tmpPath);
      await rename(tmpPath, filePath);
      return { size };
    } catch (error) {
      await rm(tmpPath, { force: true });
      throw error;
    }
  }

  async getStream(key: string): Promise<ReadableStream> {
    const filePath = this.resolvePath(key);
    await access(filePath);
    return Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  }

  async signedUrl(key: string, ttlSec: number): Promise<string> {
    assertValidKey(key);
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const token = this.sign(key, exp);
    // Empty base keeps the URL origin-relative, so the browser resolves it
    // against whatever host serves the app (works behind the web proxy).
    const base = this.publicBaseUrl.replace(/\/+$/, '');
    return `${base}/api/v1/files/${key}?exp=${exp}&token=${token}`;
  }

  verifySignedUrl(key: string, exp: number, token: string): boolean {
    try {
      assertValidKey(key);
    } catch {
      return false;
    }
    if (!Number.isInteger(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return false;
    }
    const expected = Buffer.from(this.sign(key, exp));
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async stat(key: string): Promise<{ size: number; mtimeMs: number } | null> {
    const filePath = this.resolvePath(key);
    try {
      const info = await stat(filePath);
      return { size: info.size, mtimeMs: info.mtimeMs };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    try {
      await rm(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
