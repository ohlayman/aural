# 声屿 Aural · 基建与 TTS 闭环 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭起可运行的 monorepo，并交付「输入文字 → 生成 → 播放 → 下载」的 TTS 闭环，使用可插拔 Provider，默认 fixture，首个真实适配器为硅基流动。

**Architecture:** pnpm monorepo：`apps/web`（Next.js App Router + next-intl）、`apps/api`（Fastify 5 + Drizzle + PostgreSQL）、`packages/shared`（Zod 契约与纯函数）。API 用 PostgreSQL 做任务队列，进程内 worker 执行；音频经 ffmpeg 归一化并计算 120 桶峰值；Web 与 API 同源，通过 Next `rewrites` 转发 `/api/v1/*`。

**Tech Stack:** Node 20+、pnpm 9+、TypeScript strict、Next.js App Router、React 19、Tailwind CSS v4、Radix primitives、next-intl、Zustand、TanStack Query、Fastify 5、Drizzle ORM、PostgreSQL 16、ffmpeg-static、Vitest、Testing Library、Playwright。

**Spec:** `aural/docs/superpowers/specs/2026-10-31-aural-implementation-design.md`

## Global Constraints

- Node >= 20，pnpm >= 9，PostgreSQL 16。
- 所有界面文案走 next-intl；`components/` 与 `app/` 下不得硬编码中文（品牌名「声屿 Aural」、音色专名、用户内容除外）。
- 供应商 Key 只存在于 API 进程环境变量；前端产物中不得出现 Key 字符串。
- 能力差异必须来自 Provider 的 `capabilities`，前端不得按厂商名硬编码。
- 禁止用随机数或定时器伪造频谱、波形、进度、识别结果。
- 错误响应统一为 `{ error: { code, message, retryable, requestId, details? } }`；`message` 只进日志与兜底，界面按 `code` 取 i18n 文案。
- 文本上限：`min(5,000, provider.capabilities.maxCharsPerRequest)`，按 Unicode 字素计数。
- 音频上限：20MB、30 分钟。
- 配额：TTS 20,000 字符/日，STT 1,800 秒/日；预检在创建/上传时，成功才记账，失败/取消/过期不扣。
- 本计划（S0+S1）只保留 `usage` 表、402 错误码与预检位置；实际记账、清理任务与资产列表在后续计划接入。
- 任务硬过期 30 分钟；轮询 1s → 2s → 5s，进入终态停止。
- 匿名会话 Cookie 名 `aural_sid`，`httpOnly`、`SameSite=Lax`、1 年；服务端只存 `sha256(sid)`。
- 资产留存 30 天；失败任务临时音频 24 小时；session 1 年滑动续期。
- 默认语言 `zh`，英文 `/en`；390px 下两种语言都不得横向滚动。
- 播放器与球体可视化必须由真实音频驱动。

## Review Focus

1. **Unicode 长度**：中文、emoji、组合字素在编辑器计数与服务端校验中必须用同一套字素计数，否则前端说没超、服务端说超。
2. **Provider 上限低于 5,000**：服务端必须按当前引擎的 `maxCharsPerRequest` 拒绝，不能只靠前端禁用按钮。
3. **重复提交**：同一会话已有进行中的任务时，第二次 `POST /tts/jobs` 必须被拒绝，不能生成两个并发任务。
4. **空白文本**：仅空格、换行或零宽字符的请求必须返回 `INVALID_ARGUMENT`，不能进入合成。
5. **资产越权**：另一个会话持有资产 ID 也不能读取音频或元数据，返回 404 而不是 403，避免泄露存在性。

---

### Task 1: Monorepo 脚手架与健康检查

**Files:**
- Create: `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.gitignore`、`.env.example`、`docker-compose.yml`
- Create: `packages/shared/package.json`、`packages/shared/tsconfig.json`、`packages/shared/src/index.ts`
- Create: `apps/api/package.json`、`apps/api/tsconfig.json`、`apps/api/src/server.ts`、`apps/api/src/index.ts`、`apps/api/src/server.test.ts`
- Create: `apps/web/`（`pnpm create next-app@latest`）

**Interfaces:**
- Produces: `buildServer(deps?: Partial<Deps>): FastifyInstance`；`Deps` 初始为空对象，后续任务按需扩展；根脚本 `dev`、`test`、`typecheck`、`db:up`。

- [ ] **Step 1: 建工作区文件**

`pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
```

根 `package.json` 脚本：

```json
{
  "name": "aural",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel -r dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "db:up": "docker compose up -d db",
    "db:down": "docker compose down"
  }
}
```

`docker-compose.yml` 只起 PostgreSQL 16，库名 `aural`、测试库 `aural_test`、用户/密码 `aural`。

- [ ] **Step 2: 生成 Web 与 API 包**

Run:

```bash
pnpm create next-app@latest apps/web --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*"
```

手工创建 `apps/api` 与 `packages/shared` 的 `package.json`，包名分别为 `@aural/api`、`@aural/shared`，`type: "module"`，API 依赖 `fastify`、`ffmpeg-static`、`ffprobe-static`、`drizzle-orm`、`pg`、`zod`、`tsx`、`vitest`。

- [ ] **Step 3: 写失败的测试**

`apps/api/src/server.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { buildServer } from './server.js';

describe('health', () => {
  test('GET /health returns ok', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm --filter @aural/api test`

Expected: FAIL，`Cannot find module './server.js'`。

- [ ] **Step 5: 实现最小服务**

`apps/api/src/server.ts`：

```ts
import Fastify, { type FastifyInstance } from 'fastify';

export type Deps = Record<string, never>;

export function buildServer(_deps: Partial<Deps> = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ ok: true }));
  return app;
}
```

`apps/api/src/index.ts` 启动监听 `0.0.0.0:8787`；`apps/api/package.json` 增加 `"dev": "tsx watch src/index.ts"` 与 `"test": "vitest run"`。

- [ ] **Step 6: 运行测试确认通过并做类型检查**

Run: `pnpm --filter @aural/api test && pnpm -r typecheck`

Expected: PASS；typecheck 无错误。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example docker-compose.yml apps packages
git commit -m "chore: scaffold aural monorepo"
```

---

### Task 2: 共享契约与字素计数

**Files:**
- Create: `packages/shared/src/contracts.ts`、`packages/shared/src/constants.ts`、`packages/shared/src/errors.ts`、`packages/shared/src/chars.ts`、`packages/shared/src/index.ts`
- Test: `packages/shared/src/contracts.test.ts`、`packages/shared/src/chars.test.ts`

**Interfaces:**
- Produces: `countChars(text: string): number`；`TTSJobRequestSchema`、`STTJobRequestSchema`、`EngineViewSchema`、`VoiceSchema`、`JobSchema`、`AssetSchema`、`SessionSchema`；`ERROR_META`；`MAX_TTS_CHARS = 5000`、`POLL_INTERVALS = [1000, 2000, 5000]`。

- [ ] **Step 1: 写失败的测试**

`packages/shared/src/chars.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { countChars } from './chars.js';

describe('countChars', () => {
  test('counts CJK as one grapheme each', () => {
    expect(countChars('你好')).toBe(2);
  });
  test('counts a ZWJ emoji as one grapheme', () => {
    expect(countChars('👩‍💻')).toBe(1);
  });
  test('counts combining marks as one grapheme', () => {
    expect(countChars('é')).toBe(1);
  });
  test('counts 5001 ASCII chars', () => {
    expect(countChars('a'.repeat(5001))).toBe(5001);
  });
});
```

`packages/shared/src/contracts.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { TTSJobRequestSchema } from './contracts.js';

describe('TTSJobRequestSchema', () => {
  test('rejects whitespace-only text', () => {
    expect(TTSJobRequestSchema.safeParse({ text: '   \n ', engineId: 'fixture', voiceId: 'fixture:default' }).success).toBe(false);
  });
  test('accepts a normal request', () => {
    expect(TTSJobRequestSchema.safeParse({ text: '你好', engineId: 'fixture', voiceId: 'fixture:default' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/shared test`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现字素计数与契约**

`chars.ts` 用 `Intl.Segmenter` 按 grapheme 切分，`Intl.Segmenter` 不存在时退回 `Array.from`。`contracts.ts` 用 Zod 定义：文本先 `trim()` 再 `min(1)`、`refine(countChars <= MAX_TTS_CHARS)`；`engineId`、`voiceId` 为 `min(1)` 字符串。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/shared test`

Expected: 6 个用例全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/shared
git commit -m "feat(shared): add contracts and grapheme counting"
```

---

### Task 3: 数据库 Schema 与迁移

**Files:**
- Create: `apps/api/drizzle.config.ts`、`apps/api/src/db/schema.ts`、`apps/api/src/db/client.ts`、`apps/api/src/db/migrate.ts`、`apps/api/src/db/test-utils.ts`
- Create: `apps/api/drizzle/`（生成的 SQL）
- Test: `apps/api/src/db/schema.test.ts`

**Interfaces:**
- Produces: `db`（Drizzle 实例）；表 `sessions`、`jobs`、`assets`、`usage`；`resetDb()`、`closeDb()`。

- [ ] **Step 1: 写失败的测试**

```ts
import { afterAll, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { sessions } from './schema.js';
import { resetDb, closeDb } from './test-utils.js';

beforeEach(resetDb);
afterAll(closeDb);

test('stores only the sid hash', async () => {
  const sidHash = 'h'.repeat(64);
  await db.insert(sessions).values({ sidHash, expiresAt: new Date('2027-10-31T00:00:00Z') });
  const row = await db.query.sessions.findFirst({ where: eq(sessions.sidHash, sidHash) });
  expect(row?.sidHash).toBe(sidHash);
  expect(row?.id).toBeTruthy();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/db/schema.test.ts`

Expected: FAIL，表或模块不存在。

- [ ] **Step 3: 定义四张表并生成迁移**

按设计文档 §8：`sessions`、`jobs`、`assets`、`usage`，字段与索引一一对应；`usage` 主键 `(session_id, day, kind)`。

Run:

```bash
pnpm --filter @aural/api db:generate
pnpm --filter @aural/api db:migrate
```

Expected: 生成 SQL 并成功建表。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/db/schema.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/drizzle.config.ts apps/api/drizzle apps/api/src/db
git commit -m "feat(api): add postgres schema and migrations"
```

---

### Task 4: 错误体系与 Fastify 插件

**Files:**
- Create: `apps/api/src/errors.ts`、`apps/api/src/plugins/error-handler.ts`、`apps/api/src/plugins/request-id.ts`
- Test: `apps/api/src/plugins/error-handler.test.ts`

**Interfaces:**
- Produces: `class AppError extends Error { constructor(code: ErrorCode, message?: string, details?: unknown) }`；`app.setErrorHandler(...)` 输出统一错误体；404 自动转 `NOT_FOUND`。

- [ ] **Step 1: 写失败的测试**

```ts
import { expect, test } from 'vitest';
import { buildServer } from '../server.js';

test('unknown route returns the error envelope', async () => {
  const app = buildServer();
  const res = await app.inject({ method: 'GET', url: '/nope' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toMatchObject({
    error: { code: 'NOT_FOUND', retryable: false, requestId: expect.any(String) }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/plugins/error-handler.test.ts`

Expected: FAIL，返回的是 Fastify 默认错误体。

- [ ] **Step 3: 实现错误处理器**

`AppError` 从 `ERROR_META` 取 `httpStatus` 与 `retryable`；处理器把 `AppError`、ZodError、未知错误分别映射为 `INVALID_ARGUMENT`、`INTERNAL`。每个响应带 `requestId`，并写入日志。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/plugins/error-handler.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/errors.ts apps/api/src/plugins
git commit -m "feat(api): add error envelope and request id"
```

---

### Task 5: 匿名会话

**Files:**
- Create: `apps/api/src/modules/session/service.ts`、`apps/api/src/plugins/session.ts`、`apps/api/src/routes/session.ts`
- Test: `apps/api/src/routes/session.test.ts`

**Interfaces:**
- Produces: `getOrCreateSession(req, reply): Promise<Session>`；`GET /api/v1/session` 返回 `{ sessionId, quota, expiresAt }`；Cookie `aural_sid`。

- [ ] **Step 1: 写失败的测试**

```ts
import { expect, test } from 'vitest';
import { buildServer } from '../server.js';

test('sets an httpOnly sid and reuses the session', async () => {
  const app = buildServer();
  const first = await app.inject({ method: 'GET', url: '/api/v1/session' });
  const cookie = first.cookies.find(c => c.name === 'aural_sid');
  expect(cookie?.httpOnly).toBe(true);
  expect(first.json().sessionId).toBeTruthy();

  const second = await app.inject({
    method: 'GET', url: '/api/v1/session',
    cookies: { aural_sid: cookie!.value }
  });
  expect(second.json().sessionId).toBe(first.json().sessionId);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/routes/session.test.ts`

Expected: FAIL，404。

- [ ] **Step 3: 实现会话**

`sid` 用 `crypto.randomBytes(32).toString('base64url')`；存 `sha256(sid)`；每次命中更新 `last_seen_at`；`expires_at` 为当前时间 + 365 天。Cookie 设置 `httpOnly`、`sameSite: 'lax'`、`path: '/'`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/routes/session.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/modules/session apps/api/src/plugins/session.ts apps/api/src/routes/session.ts
git commit -m "feat(api): add anonymous session"
```

---

### Task 6: Provider 接口、注册表与 Fixture

**Files:**
- Create: `apps/api/src/providers/types.ts`、`apps/api/src/providers/registry.ts`、`apps/api/src/providers/fixture/index.ts`、`apps/api/src/providers/fixture/sample-3s.mp3`
- Test: `apps/api/src/providers/registry.test.ts`、`apps/api/src/providers/fixture/fixture.test.ts`

**Interfaces:**
- Produces: `TTSProvider`、`STTProvider`（从 `@aural/shared` 重导出）；`createRegistry(config: { tts: TTSProvider[]; stt: STTProvider[]; defaultTts: string }): Registry`；`createRegistryFromEnv(): Registry`；`Registry = { resolveTTS, resolveSTT, list, defaultTTS }`。
- Consumes: `TTSRequest`、`TTSResult`、`Voice`（Task 2）。
- 测试通过 `createRegistry` 注入实例，不依赖模块加载时的环境变量。

- [ ] **Step 1: 生成 fixture 音频**

Run:

```bash
pnpm --filter @aural/api exec node --input-type=module -e "import ffmpeg from 'ffmpeg-static'; import { execFileSync } from 'node:child_process'; execFileSync(ffmpeg, ['-f','lavfi','-i','sine=frequency=440:duration=3','-ac','1','-ar','24000','-b:a','64k','src/providers/fixture/sample-3s.mp3']);"
```

Expected: 生成约 24KB 的 mp3，`ffprobe` 时长 3.0s。

- [ ] **Step 2: 写失败的测试**

```ts
import { expect, test } from 'vitest';
import { createRegistry } from './registry.js';
import { fixtureTTS, fixtureSTT } from './fixture/index.js';

test('resolves only configured providers', () => {
  const registry = createRegistry({ tts: [fixtureTTS], stt: [fixtureSTT], defaultTts: 'fixture' });
  expect(registry.resolveTTS('fixture').id).toBe('fixture');
  expect(() => registry.resolveTTS('nope')).toThrowError(/未知引擎/);
});
```

```ts
import { expect, test } from 'vitest';
import { fixtureTTS } from './index.js';

test('returns a real mp3 buffer', async () => {
  const result = await fixtureTTS.synthesize({ text: '你好', voiceId: 'fixture:default' });
  const bytes = Buffer.isBuffer(result.audio) ? result.audio : Buffer.from(result.audio as Uint8Array);
  expect(result.format).toBe('mp3');
  expect(bytes.byteLength).toBeGreaterThan(1000);
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/providers`

Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现接口与 fixture**

`fixtureTTS.capabilities = { streaming: false, pitch: false, volume: false, ssml: false, clone: false, maxCharsPerRequest: 5000, formats: ['mp3'], languages: ['zh', 'en'] }`；`listVoices` 返回「晴川 / 沉舟」两个音色，`id` 分别为 `default`、`deep`。`fixtureSTT` 返回固定文本，`durationMs` 取请求参数。

`createRegistryFromEnv` 把 `TTS_PROVIDERS` / `STT_PROVIDERS` 逗号列表映射到已导入的适配器实例，未列出即不存在；`DEFAULT_TTS_PROVIDER` 决定默认引擎。`server.ts` 的 `Deps` 增加 `registry`，未传入时用 `createRegistryFromEnv()`。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/providers`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/providers
git commit -m "feat(api): add provider registry and fixture provider"
```

---

### Task 7: 本地存储适配器

**Files:**
- Create: `apps/api/src/modules/storage/types.ts`、`apps/api/src/modules/storage/local.ts`、`apps/api/src/modules/storage/index.ts`
- Test: `apps/api/src/modules/storage/local.test.ts`

**Interfaces:**
- Produces: `interface Storage { put(key, data): Promise<{size}>; getStream(key): Promise<ReadableStream>; signedUrl(key, ttlSec): Promise<string>; delete(key): Promise<void> }`；`createStorage(env)`。

- [ ] **Step 1: 写失败的测试**

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { LocalStorage } from './local.js';

test('writes, reads, signs and deletes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aural-'));
  const storage = new LocalStorage(root, 'secret');
  await storage.put('audio/a.mp3', Buffer.from('hello'));
  const url = await storage.signedUrl('audio/a.mp3', 60);
  expect(url).toContain('token=');
  await storage.delete('audio/a.mp3');
  await expect(storage.getStream('audio/a.mp3')).rejects.toThrow();
});

test('rejects path traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aural-'));
  const storage = new LocalStorage(root, 'secret');
  await expect(storage.put('../x', Buffer.from('x'))).rejects.toThrow(/invalid key/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/modules/storage`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现本地存储**

key 只允许 `[a-zA-Z0-9/_-]` 且不得含 `..`；`signedUrl` 用 HMAC-SHA256 生成 `exp` 与 `token`；`getStream` 返回 `Readable.toWeb(createReadStream(path))`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/modules/storage`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/modules/storage
git commit -m "feat(api): add local storage adapter"
```

---

### Task 8: 任务队列与 Worker 抢占

**Files:**
- Create: `apps/api/src/modules/jobs/queue.ts`、`apps/api/src/modules/jobs/worker.ts`
- Test: `apps/api/src/modules/jobs/queue.test.ts`

**Interfaces:**
- Produces: `createJob(input): Promise<Job>`、`claimNextJob(): Promise<Job | null>`、`completeJob(id, output)`、`failJob(id, error)`、`hasActiveJob(sessionId): Promise<boolean>`、`runWorkerOnce(deps: { registry: Registry; storage: Storage }): Promise<boolean>`。

- [ ] **Step 1: 写失败的测试**

```ts
import { afterAll, beforeEach, expect, test } from 'vitest';
import { createJob, claimNextJob } from './queue.js';
import { db } from '../../db/client.js';
import { sessions } from '../../db/schema.js';
import { resetDb, closeDb } from '../../db/test-utils.js';

beforeEach(resetDb);
afterAll(closeDb);

test('claims each queued job exactly once', async () => {
  const [sess] = await db.insert(sessions).values({
    sidHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 86_400_000)
  }).returning();

  await createJob({ sessionId: sess.id, type: 'tts', engineId: 'fixture', voiceId: 'fixture:default', input: { text: 'a' } });
  await createJob({ sessionId: sess.id, type: 'tts', engineId: 'fixture', voiceId: 'fixture:default', input: { text: 'b' } });

  const first = await claimNextJob();
  const second = await claimNextJob();
  expect(first?.status).toBe('running');
  expect(second?.id).not.toBe(first?.id);
  expect(await claimNextJob()).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/modules/jobs`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现队列**

用设计文档 §11.1 的 `FOR UPDATE SKIP LOCKED` SQL；`claimNextJob` 同时把 `status='running'`、`stage='synthesizing'`、`attempts+1`、`started_at=now()`。`hasActiveJob` 查 `status in ('queued','running')`。`server.ts` 的 `Deps` 增加 `storage` 与 `registry`；`index.ts` 用 `createRegistryFromEnv()` 与 `createStorageFromEnv()` 启动 worker 循环（每 500ms 跑一次）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/modules/jobs`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/modules/jobs/queue.ts apps/api/src/modules/jobs/worker.ts
git commit -m "feat(api): add postgres job queue"
```

---

### Task 9: 音频探测、归一化与峰值

**Files:**
- Create: `apps/api/src/modules/audio/ffmpeg.ts`、`apps/api/src/modules/audio/peaks.ts`
- Test: `apps/api/src/modules/audio/peaks.test.ts`、`apps/api/src/modules/audio/ffmpeg.test.ts`

**Interfaces:**
- Produces: `computePeaks(pcm: Int16Array, buckets = 120): number[]`；`probeDurationMs(filePath: string): Promise<number>`；`normalizeToMp3(input: Buffer, outputPath: string): Promise<void>`；`toPcm8k(filePath: string): Promise<Int16Array>`。

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, expect, test } from 'vitest';
import { computePeaks } from './peaks.js';

describe('computePeaks', () => {
  test('returns 120 buckets in 0..1', () => {
    const pcm = new Int16Array(8000 * 3);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 10) * 32767);
    const peaks = computePeaks(pcm, 120);
    expect(peaks).toHaveLength(120);
    expect(Math.max(...peaks)).toBeGreaterThan(0.9);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/modules/audio`

Expected: FAIL。

- [ ] **Step 3: 实现音频工具**

用 `ffmpeg-static` 与 `ffprobe-static` 的二进制路径；`toPcm8k` 执行 `ffmpeg -i <file> -f s16le -ac 1 -ar 8000 pipe:1`，把 stdout 转 `Int16Array`；`normalizeToMp3` 输出 `-ac 1 -ar 24000 -b:a 64k`；`computePeaks` 按桶取绝对值最大后除以 32767。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/modules/audio`

Expected: PASS；`probeDurationMs(sample-3s.mp3)` 在 2800–3200ms。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/modules/audio
git commit -m "feat(api): add audio probe and peak computation"
```

---

### Task 10: TTS 任务端到端（fixture）

**Files:**
- Create: `apps/api/src/routes/tts.ts`、`apps/api/src/modules/jobs/tts-pipeline.ts`、`apps/api/src/modules/jobs/worker.ts`（补充任务分发）
- Test: `apps/api/src/routes/tts.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/tts/jobs` → 202 `{ jobId, status: 'queued', createdAt }`；`runWorkerOnce({ registry, storage })` 执行一次 TTS 任务并生成 asset。
- Consumes: `registry`（Task 6）、`createJob`/`claimNextJob`（Task 8）、`storage`（Task 7）、`audio`（Task 9）。

- [ ] **Step 1: 写失败的测试**

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { buildServer } from '../server.js';
import { runWorkerOnce } from '../modules/jobs/worker.js';
import { createRegistry } from '../providers/registry.js';
import { LocalStorage } from '../modules/storage/local.js';
import { fixtureTTS, fixtureSTT } from '../providers/fixture/index.js';
import { resetDb, closeDb } from '../db/test-utils.js';

async function setup(tts = [fixtureTTS]) {
  const root = await mkdtemp(join(tmpdir(), 'aural-tts-'));
  const storage = new LocalStorage(root, 'test');
  const registry = createRegistry({ tts, stt: [fixtureSTT], defaultTts: tts[0].id });
  const server = buildServer({ registry, storage });
  return { server, registry, storage };
}

beforeEach(resetDb);
afterAll(closeDb);

test('creates, runs and completes a TTS job', async () => {
  const { server, registry, storage } = await setup();
  const created = await server.inject({
    method: 'POST', url: '/api/v1/tts/jobs',
    payload: { text: '你好', engineId: 'fixture', voiceId: 'fixture:default' }
  });
  expect(created.statusCode).toBe(202);
  const jobId = created.json().jobId;

  expect(await runWorkerOnce({ registry, storage })).toBe(true);
  const job = await server.inject({ method: 'GET', url: `/api/v1/jobs/${jobId}` });
  expect(job.json().status).toBe('succeeded');
  expect(job.json().output.assetId).toBeTruthy();
});

test('rejects blank text, over-limit text, and a second active job', async () => {
  const { server } = await setup();
  const blank = await server.inject({ method: 'POST', url: '/api/v1/tts/jobs', payload: { text: '   ', engineId: 'fixture', voiceId: 'fixture:default' } });
  expect(blank.statusCode).toBe(400);

  const over = await server.inject({ method: 'POST', url: '/api/v1/tts/jobs', payload: { text: 'a'.repeat(5001), engineId: 'fixture', voiceId: 'fixture:default' } });
  expect(over.json().error.code).toBe('TEXT_TOO_LONG');

  await server.inject({ method: 'POST', url: '/api/v1/tts/jobs', payload: { text: '第一', engineId: 'fixture', voiceId: 'fixture:default' } });
  const second = await server.inject({ method: 'POST', url: '/api/v1/tts/jobs', payload: { text: '第二', engineId: 'fixture', voiceId: 'fixture:default' } });
  expect(second.statusCode).toBe(429);
  expect(second.json().error.code).toBe('RATE_LIMITED');
});

test('enforces a provider cap below 5000', async () => {
  const capped = {
    ...fixtureTTS,
    id: 'capped',
    capabilities: { ...fixtureTTS.capabilities, maxCharsPerRequest: 10 },
    listVoices: async () => [{ ...(await fixtureTTS.listVoices())[0], engineId: 'capped' }]
  };
  const { server } = await setup([fixtureTTS, capped]);
  const res = await server.inject({
    method: 'POST', url: '/api/v1/tts/jobs',
    payload: { text: 'a'.repeat(11), engineId: 'capped', voiceId: 'capped:default' }
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error.code).toBe('TEXT_TOO_LONG');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/routes/tts.test.ts`

Expected: FAIL，404。

- [ ] **Step 3: 实现创建校验与任务流水线**

创建时：会话 → 引擎存在 → `countChars(text) <= min(5000, capabilities.maxCharsPerRequest)` → `hasActiveJob` 拒绝 → 建 job。worker：取任务 → `provider.synthesize` → 写临时文件 → `toPcm8k` → `computePeaks` → `normalizeToMp3` → `storage.put('audio/YYYYMM/<sidHash>/<assetId>.mp3')` → `probeDurationMs` → 插 asset（peaks、duration、size）→ job succeeded。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/routes/tts.test.ts`

Expected: 两个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/routes/tts.ts apps/api/src/modules/jobs
git commit -m "feat(api): add tts job pipeline with fixture provider"
```

---

### Task 11: 任务查询、取消与资产音频访问

**Files:**
- Create: `apps/api/src/routes/jobs.ts`、`apps/api/src/routes/assets.ts`
- Test: `apps/api/src/routes/jobs.test.ts`、`apps/api/src/routes/assets.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/jobs/:jobId`、`DELETE /api/v1/jobs/:jobId`、`GET /api/v1/assets/:id/audio`（302 到签名 URL）。
- Consumes: Task 5 session、Task 10 asset。

- [ ] **Step 1: 写失败的测试**

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { buildServer } from '../server.js';
import { runWorkerOnce } from '../modules/jobs/worker.js';
import { createRegistry } from '../providers/registry.js';
import { LocalStorage } from '../modules/storage/local.js';
import { fixtureTTS, fixtureSTT } from '../providers/fixture/index.js';
import { resetDb, closeDb } from '../db/test-utils.js';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'aural-jobs-'));
  const storage = new LocalStorage(root, 'test');
  const registry = createRegistry({ tts: [fixtureTTS], stt: [fixtureSTT], defaultTts: 'fixture' });
  const server = buildServer({ registry, storage });
  return { server, registry, storage };
}

async function session(server: ReturnType<typeof buildServer>) {
  const res = await server.inject({ method: 'GET', url: '/api/v1/session' });
  return res.cookies.find(c => c.name === 'aural_sid')!.value;
}

async function createPodcast(server: ReturnType<typeof buildServer>, sid: string) {
  const created = await server.inject({
    method: 'POST', url: '/api/v1/tts/jobs',
    cookies: { aural_sid: sid },
    payload: { text: '你好', engineId: 'fixture', voiceId: 'fixture:default' }
  });
  return created.json().jobId as string;
}

beforeEach(resetDb);
afterAll(closeDb);

test('another session cannot read the asset', async () => {
  const { server, registry, storage } = await setup();
  const sidA = await session(server);
  const sidB = await session(server);
  const jobId = await createPodcast(server, sidA);
  await runWorkerOnce({ registry, storage });
  const job = await server.inject({ method: 'GET', url: `/api/v1/jobs/${jobId}`, cookies: { aural_sid: sidA } });
  const assetId = job.json().output.assetId;
  const resB = await server.inject({ method: 'GET', url: `/api/v1/assets/${assetId}/audio`, cookies: { aural_sid: sidB } });
  expect(resB.statusCode).toBe(404);
});

test('cancel moves a queued job to cancelled', async () => {
  const { server } = await setup();
  const sid = await session(server);
  const jobId = await createPodcast(server, sid);
  const res = await server.inject({ method: 'DELETE', url: `/api/v1/jobs/${jobId}`, cookies: { aural_sid: sid } });
  expect(res.statusCode).toBe(200);
  const job = await server.inject({ method: 'GET', url: `/api/v1/jobs/${jobId}`, cookies: { aural_sid: sid } });
  expect(job.json().status).toBe('cancelled');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/routes/jobs.test.ts src/routes/assets.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现路由与归属校验**

所有查询都按 `session_id` 过滤；不属于当前会话统一返回 `NOT_FOUND`。音频路由校验签名 token 后 302 到存储 URL（本地存储时为带 token 的 API 地址）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/routes/jobs.test.ts src/routes/assets.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/routes/jobs.ts apps/api/src/routes/assets.ts
git commit -m "feat(api): add job polling, cancel and asset audio access"
```

---

### Task 12: Web 外壳、i18n 与 API 客户端

**Files:**
- Create: `apps/web/next.config.ts`（rewrites）、`apps/web/middleware.ts`、`apps/web/i18n/routing.ts`、`apps/web/i18n/request.ts`、`apps/web/messages/zh.json`、`apps/web/messages/en.json`、`apps/web/playwright.config.ts`
- Create: `apps/web/app/[locale]/layout.tsx`、`apps/web/app/[locale]/page.tsx`、`apps/web/components/nav.tsx`、`apps/web/lib/api-client.ts`、`apps/web/features/session/*`
- Test: `apps/web/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `apiFetch<T>(path, init): Promise<T>`（自动带 Cookie、映射 `ApiError`）；`Link`/`useRouter` 来自 `i18n/routing`；语言切换写 `NEXT_LOCALE`。

- [ ] **Step 1: 写失败的 E2E**

```ts
import { expect, test } from '@playwright/test';

test('renders zh by default and en under /en', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: '文字转语音' })).toBeVisible();
  await page.goto('/en');
  await expect(page.getByRole('link', { name: 'Text to Speech' })).toBeVisible();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web e2e -- e2e/shell.spec.ts`

Expected: FAIL，路由或文案不存在。

- [ ] **Step 3: 配置 next-intl 与 rewrites**

安装依赖：

```bash
pnpm --filter @aural/web add next-intl @tanstack/react-query
pnpm --filter @aural/web add -D @playwright/test
```

`localePrefix: 'as-needed'`，默认 `zh`；`next.config.ts` 把 `/api/v1/:path*` 转发到 `http://localhost:8787/api/v1/:path*`。导航含首页、TTS、STT、资产、设置与语言切换；STT/资产/设置先放占位页。

`playwright.config.ts` 配两个 `webServer`：API（`pnpm --filter @aural/api dev`，8787，`TTS_PROVIDERS=fixture`）与 Web（`pnpm --filter @aural/web dev`，3000）。`apps/web/package.json` 增加 `"e2e": "playwright test"`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web e2e -- e2e/shell.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "feat(web): add shell, i18n routing and api client"
```

---

### Task 13: 设计 Token 与 UI 基础组件

**Files:**
- Create: `apps/web/app/globals.css`（token）、`apps/web/components/ui/{button,select,slider,toast,tooltip,dialog}.tsx`
- Create: `apps/web/vitest.config.ts`、`apps/web/test/setup.ts`
- Test: `apps/web/components/ui/*.test.tsx`

**Interfaces:**
- Produces: `Button`（`variant`、`size`、`loading`、`disabled`）、`Select`、`Slider`、`Toast`/`useToast`、`Tooltip`、`Dialog`。

- [ ] **Step 1: 写失败的测试**

```tsx
test('loading button is disabled and aria-busy', () => {
  render(<Button loading>生成</Button>);
  const btn = screen.getByRole('button', { name: /生成/ });
  expect(btn).toBeDisabled();
  expect(btn).toHaveAttribute('aria-busy', 'true');
});

test('dialog closes on Escape and restores focus', async () => {
  const user = userEvent.setup();
  render(<DialogHarness />);
  await user.click(screen.getByRole('button', { name: '打开' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开' })).toHaveFocus();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web test -- components/ui`

Expected: FAIL。

- [ ] **Step 3: 实现 token 与组件**

安装依赖：

```bash
pnpm --filter @aural/web add @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-slider @radix-ui/react-tooltip @radix-ui/react-toast
pnpm --filter @aural/web add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

先配 `vitest.config.ts`（jsdom、`test/setup.ts` 引入 `@testing-library/jest-dom`），并在 `apps/web/package.json` 增加 `"test": "vitest run"`。按设计文档 §10.6 映射 CSS 变量；Radix 负责 Dialog/Select/Slider/Tooltip 的焦点与键盘行为；Button 手写。所有可点击元素有 `:focus-visible`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web test -- components/ui`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/app/globals.css apps/web/components/ui
git commit -m "feat(web): add design tokens and ui primitives"
```

---

### Task 14: 引擎/音色 API 与试听缓存

**Files:**
- Create: `apps/api/src/routes/engines.ts`、`apps/api/src/modules/preview/cache.ts`
- Test: `apps/api/src/routes/engines.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/engines` → `EngineView[]`；`GET /api/v1/voices?engineId=` → `Voice[]`；`GET /api/v1/voices/:voiceId/preview` → 302。
- Consumes: Task 6 registry、Task 7 storage。

- [ ] **Step 1: 写失败的测试**

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { buildServer } from '../server.js';
import { createRegistry } from '../providers/registry.js';
import { LocalStorage } from '../modules/storage/local.js';
import { fixtureTTS, fixtureSTT } from '../providers/fixture/index.js';

let server: ReturnType<typeof buildServer>;
beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'aural-preview-'));
  server = buildServer({
    registry: createRegistry({ tts: [fixtureTTS], stt: [fixtureSTT], defaultTts: 'fixture' }),
    storage: new LocalStorage(root, 'test')
  });
});

test('lists engines and voices', async () => {
  const engines = await server.inject({ method: 'GET', url: '/api/v1/engines' });
  expect(engines.json()).toEqual([expect.objectContaining({ id: 'fixture', kind: 'tts' })]);
  const voices = await server.inject({ method: 'GET', url: '/api/v1/voices?engineId=fixture' });
  expect(voices.json()[0]).toMatchObject({ engineId: 'fixture', name: '晴川' });
});

test('preview is synthesized once and then cached', async () => {
  const spy = vi.spyOn(fixtureTTS, 'synthesize');
  await server.inject({ method: 'GET', url: '/api/v1/voices/fixture%3Adefault/preview' });
  await server.inject({ method: 'GET', url: '/api/v1/voices/fixture%3Adefault/preview' });
  expect(spy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/routes/engines.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现试听缓存**

复合 voiceId 解码后校验 `engineId`；缓存 key `preview/<engineId>/<localId>.mp3`；文件存在且 mtime 在 7 天内直接 302，否则合成后写入再 302；试听不写 `usage`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/routes/engines.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/routes/engines.ts apps/api/src/modules/preview
git commit -m "feat(api): add engines, voices and cached previews"
```

---

### Task 15: 音色选择器

**Files:**
- Create: `apps/web/components/voice-picker/voice-picker.tsx`、`apps/web/features/engines/{api.ts,hooks.ts}`
- Test: `apps/web/components/voice-picker/voice-picker.test.tsx`

**Interfaces:**
- Produces: `<VoicePicker value={{engineId, voiceId}} onChange={(next) => void} />`；内部渲染引擎分段控件与音色行，支持试听。
- Consumes: Task 14 API、Task 13 Dialog/Select。

- [ ] **Step 1: 写失败的测试**

```tsx
test('selects a voice and closes the popover', async () => {
  const onChange = vi.fn();
  render(<VoicePicker value={{ engineId: 'fixture', voiceId: 'fixture:default' }} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: /晴川/ }));
  await userEvent.click(screen.getByRole('radio', { name: /沉舟/ }));
  expect(onChange).toHaveBeenCalledWith({ engineId: 'fixture', voiceId: 'fixture:deep' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web test -- components/voice-picker`

Expected: FAIL。

- [ ] **Step 3: 实现选择器**

触发器是标注胶囊（音色名 + tier）；浮层用 Radix Dialog 的 non-modal 模式；音色行 `role="radio"`，Enter/Space 选中；同一时间只允许一个试听，再次点击停止。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web test -- components/voice-picker`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/components/voice-picker apps/web/features/engines
git commit -m "feat(web): add voice picker"
```

---

### Task 16: 球体渲染与状态机

**Files:**
- Create: `apps/web/components/voice-orb/{voice-orb.tsx,shader.ts,state.ts}`、`apps/web/app/[locale]/page.tsx`（替换占位）
- Test: `apps/web/components/voice-orb/state.test.tsx`

**Interfaces:**
- Produces: `orbReducer(state: OrbState, event: OrbEvent): OrbState`；`<VoiceOrb state amp onPointerDown onPointerUp />`。
- OrbState：`'idle' | 'listening' | 'thinking' | 'speaking'`。

- [ ] **Step 1: 写失败的测试**

```ts
test('speaking starts and ends', () => {
  let s = orbReducer('idle', { type: 'SPEAK_START' });
  expect(s).toBe('speaking');
  s = orbReducer(s, { type: 'SPEAK_END' });
  expect(s).toBe('idle');
});

test('short press is ignored', () => {
  const s = orbReducer('idle', { type: 'PRESS_END', durationMs: 300 });
  expect(s).toBe('idle');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web test -- components/voice-orb`

Expected: FAIL。

- [ ] **Step 3: 移植 shader 与组件**

从 `docs/reference/aural-prototype-v2.html` 的 `FS` 常量移植；DPR 上限 1.75；`document.hidden` 时停 rAF；无 WebGL 时渲染 CSS 径向渐变；`prefers-reduced-motion` 时停止呼吸与视差。首页文案「输入文字，按 Enter 朗读」在 S1 生效，按住说话在 S2 接入。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web test -- components/voice-orb`

Expected: PASS；Playwright 中 `#gl` canvas 可见。

- [ ] **Step 5: 提交**

```bash
git add apps/web/components/voice-orb apps/web/app/[locale]/page.tsx
git commit -m "feat(web): add voice orb with real shader"
```

---

### Task 17: 首页「文字 → 朗读」

**Files:**
- Create: `apps/web/features/home/speak.ts`、`apps/web/features/tts/api.ts`（创建/查询任务）、`apps/web/lib/audio/play-buffer.ts`
- Modify: `apps/web/app/[locale]/page.tsx`
- Test: `apps/web/e2e/home-speak.spec.ts`

**Interfaces:**
- Produces: `speakText(text: string): Promise<void>`（创建任务 → 轮询 → 取 audio → 解码 → 播放 → 状态结束）；`playBuffer(ctx, buffer, analyser, offsetSec, onEnded): { stop(): void }`。
- Consumes: Task 10/11 API。`playBuffer` 是后续播放器控制器的底层播放原语，Task 20 直接复用。

- [ ] **Step 1: 写失败的 E2E**

```ts
test('typing text and pressing Enter speaks through a real tts job', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '或者，输入文字' }).click();
  await page.getByRole('textbox', { name: '输入文字生成语音' }).fill('你好');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/正在朗读/)).toBeVisible();
  await expect(page.getByText(/按住|输入文字/)).toBeVisible({ timeout: 8000 });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web e2e -- e2e/home-speak.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现朗读闭环**

Enter 提交；轮询按 1s→2s→5s；成功后 `fetch` 音频、`decodeAudioData`，用 `playBuffer` 接到 `AnalyserNode`；外环由真实 FFT 驱动；再次 Enter 调用 `stop()`；失败时 toast 并提示去 TTS 页换引擎。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web e2e -- e2e/home-speak.spec.ts`

Expected: PASS（fixture 3 秒后回到 idle）。

- [ ] **Step 5: 提交**

```bash
git add apps/web/features/home apps/web/features/tts/api.ts apps/web/app/[locale]/page.tsx
git commit -m "feat(web): speak text from the home orb"
```

---

### Task 18: TTS 编辑器与配置栏

**Files:**
- Create: `apps/web/app/[locale]/tts/page.tsx`、`apps/web/components/config-panel/config-panel.tsx`、`apps/web/features/tts/store.ts`
- Test: `apps/web/app/[locale]/tts/page.test.tsx`、`apps/web/components/config-panel/config-panel.test.tsx`

**Interfaces:**
- Produces: 编辑器状态 `{ text, engineId, voiceId, language, speed, pitch }`；`useTTSStore`。
- Consumes: Task 2 `countChars`、Task 13 组件、Task 15 选择器。

- [ ] **Step 1: 写失败的测试**

测试里 mock `/engines`，返回一个 `maxCharsPerRequest: 10` 的引擎与音色。

```tsx
test('counts characters and disables generate over the engine cap', async () => {
  render(<TTSPage />);
  const textarea = screen.getByRole('textbox', { name: '待合成文本' });
  await userEvent.type(textarea, 'a'.repeat(11));
  expect(screen.getByText('11 / 10')).toBeVisible();
  expect(screen.getByRole('button', { name: /生成/ })).toBeDisabled();
});

test('disables pitch when the engine does not support it', () => {
  render(<ConfigPanel engine={{ id: 'fixture', capabilities: { pitch: false } }} />);
  expect(screen.getByRole('slider', { name: '音调' })).toBeDisabled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web test -- tts`

Expected: FAIL。

- [ ] **Step 3: 实现编辑器与配置**

安装 `zustand`：

```bash
pnpm --filter @aural/web add zustand
```

计数用 `countChars`；上限 `min(5000, capabilities.maxCharsPerRequest)`；超限文案写「当前引擎最多 N 字」；清空 5 秒内可撤销；参数写 localStorage；引擎切换后音色回到默认并提示。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web test -- tts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/app/[locale]/tts apps/web/components/config-panel apps/web/features/tts/store.ts
git commit -m "feat(web): add tts editor and config panel"
```

---

### Task 19: TTS 任务状态 UI 与错误处理

**Files:**
- Create: `apps/web/features/tts/hooks.ts`、`apps/web/components/tts-status/tts-status.tsx`
- Modify: `apps/web/app/[locale]/tts/page.tsx`
- Test: `apps/web/components/tts-status/tts-status.test.tsx`

**Interfaces:**
- Produces: `useTTSJob(jobId)` 轮询；状态映射表；`<TTSStatus status stage error onRetry onSwitchEngine />`。

- [ ] **Step 1: 写失败的测试**

```tsx
test.each([
  ['queued', '排队中'],
  ['running', '正在合成'],
  ['succeeded', '生成完成'],
])('maps %s to %s', (status, label) => {
  render(<TTSStatus status={status as JobStatus} stage="synthesizing" />);
  expect(screen.getByText(label)).toBeVisible();
});

test('failed shows retry and switch engine', () => {
  render(<TTSStatus status="failed" error={{ code: 'PROVIDER_TIMEOUT', retryable: true }} />);
  expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
  expect(screen.getByRole('button', { name: '换引擎重试' })).toBeVisible();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web test -- tts-status`

Expected: FAIL。

- [ ] **Step 3: 实现状态 UI**

轮询 1s→2s→5s，终态停止；`cancelled` 无重试，`expired` 有重试；`QUOTA_EXCEEDED` 显示额度文案与恢复时间；所有错误文案从 `errors` 命名空间取，不展示服务端 `message`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web test -- tts-status`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/features/tts/hooks.ts apps/web/components/tts-status apps/web/app/[locale]/tts/page.tsx
git commit -m "feat(web): add tts job status and errors"
```

---

### Task 20: 音频播放器

**Files:**
- Create: `apps/web/lib/audio/player.ts`、`apps/web/components/player/{player.tsx,ribbon.ts}`、`apps/web/lib/audio/decode.ts`
- Test: `apps/web/lib/audio/player.test.ts`、`apps/web/components/player/ribbon.test.ts`、`apps/web/e2e/player.spec.ts`

**Interfaces:**
- Produces: `createAudioPlayer(ctx, buffer, analyser)` → `{ play, pause, seek, setRate, getCurrentTime, getDuration, dispose }`；`buildBars(peaks, count = 160): number[]`；`<Player asset status />`。
- Consumes: `playBuffer`（Task 17）：控制器用它在 offset 处启动，seek 时先 `stop()` 再以新 offset 启动。

- [ ] **Step 1: 写失败的测试**

```ts
test('seek clamps to duration', () => {
  const p = createAudioPlayer(fakeCtx, fakeBuffer, fakeAnalyser);
  p.seek(-1);
  expect(p.getCurrentTime()).toBe(0);
  p.seek(999);
  expect(p.getCurrentTime()).toBe(p.getDuration());
});

test('buildBars resamples 120 peaks to 160 bars', () => {
  expect(buildBars(Array.from({ length: 120 }, () => 0.5))).toHaveLength(160);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web test -- lib/audio components/player`

Expected: FAIL。

- [ ] **Step 3: 实现播放器**

`AudioBufferSourceNode` + `GainNode` + `AnalyserNode`；`playbackRate` 支持 0.75/1/1.25/1.5/2；进度用 rAF 直接改 Canvas 与 CSS 变量，不进 React state；下载文件名 `aural-{voice}-{yyyymmdd-hhmm}.mp3`；空格与 ←/→ 键支持 5 秒跳转。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web test -- lib/audio components/player && pnpm --filter @aural/web e2e -- e2e/player.spec.ts`

Expected: PASS；播放后时间文本递增。

- [ ] **Step 5: 提交**

```bash
git add apps/web/lib/audio apps/web/components/player apps/web/e2e/player.spec.ts
git commit -m "feat(web): add audio player with waveform and seek"
```

---

### Task 21: 硅基流动 TTS 适配器

**Files:**
- Create: `apps/api/src/providers/siliconflow/{index.ts,tts.ts,errors.ts}`
- Modify: `apps/api/src/providers/registry.ts`、`.env.example`
- Test: `apps/api/src/providers/siliconflow/tts.test.ts`

**Interfaces:**
- Produces: `siliconflowTTS: TTSProvider`；`id: 'siliconflow'`、`tier: 'standard'`、`capabilities.pitch = false`。
- Consumes: Task 6 接口。

- [ ] **Step 1: 写失败的测试**

```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.post('https://api.siliconflow.cn/v1/audio/speech', () =>
    HttpResponse.arrayBuffer(new Uint8Array([0x49, 0x44, 0x33]).buffer, {
      headers: { 'content-type': 'audio/mpeg' }
    })
  )
);
beforeAll(() => server.listen());
afterAll(() => server.close());

test('maps 401 to UNAUTHORIZED', async () => {
  server.use(http.post('*', () => new HttpResponse(null, { status: 401 })));
  await expect(siliconflowTTS.synthesize({ text: '你好', voiceId: 'siliconflow:qingchuan' }))
    .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('returns mp3 bytes on success', async () => {
  const r = await siliconflowTTS.synthesize({ text: '你好', voiceId: 'siliconflow:qingchuan' });
  expect(r.format).toBe('mp3');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/api test -- src/providers/siliconflow`

Expected: FAIL。

- [ ] **Step 3: 实现适配器**

安装测试依赖：

```bash
pnpm --filter @aural/api add -D msw
```

模型 ID、端点、音色映射集中在该目录常量中，接入当天以官方文档核对；请求带 `Authorization: Bearer $SILICONFLOW_API_KEY`；超时 15s 首包 / 90s 完成；错误映射 `401→UNAUTHORIZED`、`429→RATE_LIMITED`、`5xx→PROVIDER_UNAVAILABLE`、`AbortError→PROVIDER_TIMEOUT`；重试 1 次。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/api test -- src/providers/siliconflow`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/providers/siliconflow apps/api/src/providers/registry.ts .env.example
git commit -m "feat(api): add siliconflow tts provider"
```

---

### Task 22: S1 响应式、动效与可访问性收口

**Files:**
- Modify: `apps/web/app/globals.css`、`apps/web/app/[locale]/page.tsx`、`apps/web/app/[locale]/tts/page.tsx`、`apps/web/components/**`
- Test: `apps/web/e2e/a11y-responsive.spec.ts`

**Interfaces:**
- Produces: 390/768/1024/1440 四档无横向滚动；reduced-motion 下装饰动画停止；键盘可完成一次 TTS 生成与播放。

- [ ] **Step 1: 写失败的 E2E**

```ts
for (const width of [390, 768, 1024, 1440]) {
  test(`no horizontal scroll at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/tts');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
  });
}

test('keyboard can generate and play', async ({ page }) => {
  await page.goto('/tts');
  await page.getByRole('textbox', { name: '待合成文本' }).focus();
  await page.keyboard.type('你好');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('button', { name: /播放/ })).toBeEnabled({ timeout: 8000 });
  await page.getByRole('button', { name: /播放/ }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('PLAYING')).toBeVisible();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @aural/web e2e -- e2e/a11y-responsive.spec.ts`

Expected: FAIL，出现横向滚动或用例不可达。

- [ ] **Step 3: 修复布局与动效**

移动端配置栏移到编辑器下方；播放器生成后 `scrollIntoView({ block: 'center' })`；`prefers-reduced-motion` 下停 shader 呼吸、粒子、光标；所有图标按钮补 `aria-label`；状态变化加 `aria-live="polite"`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @aural/web e2e -- e2e/a11y-responsive.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "fix(web): responsive, reduced motion and a11y for tts"
```

---

## 自检结果

- **Spec 覆盖**：S0 基建（Task 1–11）、S1 TTS（Task 12–22）逐项对应设计文档；STT、资产库、配额、清理、S3、部署属于后续计划。
- **类型一致**：`JobStatus`、`JobStage`、`Voice`、`EngineView`、`TTSRequest` 在 Task 2 定义，后续任务只引用；`claimNextJob`、`runWorkerOnce`、`createAudioPlayer` 名称在各任务中一致。
- **Review Focus 落点**：Unicode 计数 → Task 2/18；引擎上限 → Task 10；重复提交 → Task 10；空白文本 → Task 2/10；资产越权 → Task 11。
- **已知留白**：STT 上传校验、资产列表、配额记账、清理任务、S3 适配器、部署与备案在下一份计划中拆解。
