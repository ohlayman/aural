import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, test } from 'vitest';
import { LocalStorage } from './local.js';

async function createStorage(): Promise<LocalStorage> {
  const root = await mkdtemp(join(tmpdir(), 'aural-'));
  return new LocalStorage(root, 'secret');
}

test('writes, reads, signs and deletes', async () => {
  const storage = await createStorage();
  await storage.put('audio/a.mp3', Buffer.from('hello'));
  const url = await storage.signedUrl('audio/a.mp3', 60);
  expect(url).toContain('token=');
  // No base configured → origin-relative so the browser stays on the app host.
  expect(url.startsWith('/api/v1/files/audio/a.mp3?')).toBe(true);
  await storage.delete('audio/a.mp3');
  await expect(storage.getStream('audio/a.mp3')).rejects.toThrow();
});

test('uses an absolute base when one is configured', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aural-'));
  const storage = new LocalStorage(root, 'secret', 'https://cdn.example.com/');
  const url = await storage.signedUrl('audio/a.mp3', 60);
  expect(url.startsWith('https://cdn.example.com/api/v1/files/audio/a.mp3?')).toBe(true);
});

test('rejects path traversal', async () => {
  const storage = await createStorage();
  await expect(storage.put('../x', Buffer.from('x'))).rejects.toThrow(/invalid key/);
});

test('getStream returns the written bytes', async () => {
  const storage = await createStorage();
  const bytes = Buffer.from('stream me back');
  await storage.put('nested/dir/a.txt', bytes);

  const stream = await storage.getStream('nested/dir/a.txt');
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(stream)) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }

  expect(Buffer.concat(chunks)).toEqual(bytes);
});

test('put accepts a web ReadableStream', async () => {
  const storage = await createStorage();
  const source = Readable.toWeb(Readable.from([Buffer.from('abc'), Buffer.from('def')]));

  const { size } = await storage.put('stream.bin', source);
  expect(size).toBe(6);

  const stream = await storage.getStream('stream.bin');
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(stream)) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  expect(Buffer.concat(chunks).toString()).toBe('abcdef');
});

test('verifySignedUrl accepts fresh signatures and rejects tampered or expired ones', async () => {
  const storage = await createStorage();
  const url = new URL(await storage.signedUrl('audio/a.mp3', 60), 'http://localhost');
  const exp = Number(url.searchParams.get('exp'));
  const token = url.searchParams.get('token');

  expect(token).not.toBeNull();
  expect(storage.verifySignedUrl('audio/a.mp3', exp, token as string)).toBe(true);
  expect(storage.verifySignedUrl('audio/b.mp3', exp, token as string)).toBe(false);

  const tampered = `${(token as string).slice(0, -1)}${(token as string).endsWith('0') ? '1' : '0'}`;
  expect(storage.verifySignedUrl('audio/a.mp3', exp, tampered)).toBe(false);

  const expired = new URL(await storage.signedUrl('audio/a.mp3', -1), 'http://localhost');
  expect(
    storage.verifySignedUrl(
      'audio/a.mp3',
      Number(expired.searchParams.get('exp')),
      expired.searchParams.get('token') as string,
    ),
  ).toBe(false);
});

test('stat returns null when missing and size/mtime when written', async () => {
  const storage = await createStorage();
  expect(await storage.stat('missing/a.mp3')).toBeNull();

  const bytes = Buffer.from('stat me');
  await storage.put('stat/a.mp3', bytes);
  const info = await storage.stat('stat/a.mp3');
  expect(info).not.toBeNull();
  expect(info!.size).toBe(bytes.length);
  expect(info!.mtimeMs).toBeGreaterThan(0);

  await expect(storage.stat('../x')).rejects.toThrow(/invalid key/);
});

test.each(['../x', '/abs', 'a b'])('rejects invalid key %s', async (key) => {
  const storage = await createStorage();
  await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(/invalid key/);
  await expect(storage.getStream(key)).rejects.toThrow(/invalid key/);
});
