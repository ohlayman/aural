# 声屿 Aural · AI 语音工作台

> 把文字变成声音，把声音变回文字。一个安静、精密的声音工作台。
>
> Aural is an AI voice workbench: text→speech today, speech→text next, with a pluggable voice-provider layer.

**当前状态：S0 基建 + S1 TTS 闭环已完成。** STT、声音资产库、配额记账、清理任务与部署属于后续计划；`/stt`、`/library`、`/settings` 目前是占位页。

---

## 1. 它是什么

- **文字转语音（TTS）**：输入/粘贴文本，选择引擎、音色、语言、语速与音调，生成可试听、可下载的 MP3。
- **首页声音球**：按住说话是后续 STT 能力；S1 首页的完整闭环是「输入文字 → Enter → 球体用真实 TTS 音频朗读」。
- **真实音频可视化**：波形、进度、频谱全部由 Web Audio 真实数据驱动，不使用随机数或定时器伪造。
- **Provider 可插拔**：前端只认 `engineId / voiceId + capabilities`；业务层只认 `TTSProvider / STTProvider`。新增厂商 = 一个适配器文件 + 注册一行。
- **中英双语界面**：默认中文，`/en` 英文；语言选择持久化在 `NEXT_LOCALE`。

不做什么（S1）：AI 对话、声音克隆、多角色、账号体系、付费、实时流式 STT、SRT/VTT、资产历史列表。

---

## 2. 架构

```mermaid
flowchart LR
    subgraph Browser["浏览器"]
        WEB["Next.js 16<br/>next-intl / Radix / WebGL"]
    end
    subgraph Edge["Next rewrites"]
        RW["/api/v1/* → :8787"]
    end
    subgraph API["Fastify 5 · :8787"]
        GW["会话 · 校验 · 限流"]
        JOBS["任务编排 + worker pool"]
        REG["Provider Registry"]
        STO["存储 / 签名 URL"]
    end
    subgraph DATA["数据层"]
        PG[("PostgreSQL<br/>session/job/asset/usage")]
        FS[("本地存储<br/>可切 S3/OSS")]
    end
    subgraph PROV["语音能力"]
        FIX["fixture（默认，零成本）"]
        SF["SiliconFlow TTS"]
    end

    WEB --> RW --> GW
    WEB -->|"签名 /api/v1/files/*"| STO
    GW --> JOBS
    JOBS --> REG
    REG --> FIX
    REG --> SF
    JOBS --> PG
    JOBS --> STO
    STO --> FS
    GW --> PG
```

**仓库结构**

```
aural/
├─ apps/
│  ├─ web/                  Next.js 16 App Router + next-intl
│  │  ├─ app/[locale]/      首页 / TTS / STT / 资产 / 设置
│  │  ├─ components/        voice-orb、voice-picker、player、ui、nav
│  │  ├─ features/          engines、tts、home、session
│  │  ├─ lib/audio/         解码、峰值、播放器控制
│  │  ├─ messages/          zh.json / en.json
│  │  └─ e2e/               Playwright
│  └─ api/                  Fastify 5 + Drizzle
│     ├─ src/routes/        session / engines / tts / jobs / assets
│     ├─ src/modules/       jobs、storage、audio、session、preview
│     ├─ src/providers/     registry、fixture、siliconflow
│     └─ drizzle/           SQL 迁移
├─ packages/shared/         Zod 契约、Provider 接口、错误码、字素计数
└─ docs/                    PRD、设计、计划、原型、调研
```

**技术栈**

| 层 | 选型 |
|---|---|
| Web | Next.js 16.4 App Router、React 19、TypeScript strict、Tailwind CSS v4、Radix primitives、next-intl、Zustand、TanStack Query |
| 音频/可视化 | 原生 Web Audio API、Canvas 2D、WebGL fragment shader（无 three.js） |
| API | Fastify 5、Drizzle ORM、PostgreSQL 16/17、ffmpeg-static |
| 测试 | Vitest、Testing Library、Playwright |
| 工程 | pnpm 9 workspace、`@aural/shared` 契约包 |

---

## 3. 快速开始

### 3.1 前置条件

- Node.js **>= 20.3**（`AbortSignal.any` 等能力需要）
- pnpm **9.15.9**（仓库已用 `packageManager` 锁定；统一用 `corepack pnpm`）
- PostgreSQL **16 或 17**（Docker 或本地实例均可）
- ffmpeg 由 `ffmpeg-static` 提供，无需系统安装

```bash
corepack enable
corepack pnpm install
```

### 3.2 准备数据库

**方式 A：Docker（标准路径）**

```bash
corepack pnpm db:up
```

容器使用 `aural / aural`，端口 `5432`，初始化脚本会创建 `aural` 与 `aural_test`。使用 Docker 时，启动前导出：

```bash
export DATABASE_URL=postgres://aural:aural@localhost:5432/aural
export TEST_DATABASE_URL=postgres://aural:aural@localhost:5432/aural_test
```

**方式 B：本地 PostgreSQL（Windows 示例，开发用 trust 认证）**

```bash
PG_BIN="/c/Program Files/PostgreSQL/17/bin"
DATA="$(pwd)/.data/pg"
"$PG_BIN/initdb.exe" -D "$DATA" -U aural --auth=trust --encoding=UTF8 --locale=C
"$PG_BIN/pg_ctl.exe" -D "$DATA" -o "-p 5433" -l "$DATA/server.log" start
"$PG_BIN/createdb.exe" -h 127.0.0.1 -p 5433 -U aural aural
"$PG_BIN/createdb.exe" -h 127.0.0.1 -p 5433 -U aural aural_test
```

仓库的开发默认值已经指向 `127.0.0.1:5433`，因此本方式通常不需要额外环境变量。

> 生产环境不要使用 trust 认证或 `dev-secret`。

### 3.3 迁移与启动

```bash
corepack pnpm --filter @aural/api db:migrate
corepack pnpm dev
```

- Web：http://localhost:3000
- API 健康检查：http://localhost:8787/health

> API 直接读取进程环境变量，仓库没有自动加载 `.env` 的依赖。把 `.env.example` 复制成 `.env` **不会**自动生效；需要自定义时在启动前 `export`（bash）或 `$env:NAME="..."`（PowerShell）。`.env.example` 里的值是本地默认值。

---

## 4. 怎么用

### 首页 `/`

1. 点击「或者，输入文字」，输入一句话，按 **Enter**。
2. 球体进入准备/朗读状态，声音来自真实 TTS 任务；再按 Enter 停止。
3. 球体右上角胶囊可切换音色/引擎；切到英文在导航语言切换。
4. 朗读失败会提示重试或去 TTS 页换引擎。

### TTS 工作台 `/tts`

1. 输入或粘贴文本；计数上限取 `min(5,000, 当前引擎上限)`。
2. 右侧配置语言、音色（可试听）、语速、音调（引擎不支持时置灰）。
3. 点击「生成」或按 **⌘/Ctrl + Enter**。
4. 状态依次经过排队、合成、处理音频；失败时提供「重试 / 换引擎重试」。
5. 生成完成后播放器支持波形 seek、倍速、音量、空格播放/暂停、←/→ 5 秒跳转、下载 MP3。
6. 清空文本后 5 秒内可撤销；编辑器内容与参数会持久化到 localStorage。

### 语言

导航右侧切换中文 / English；`/` 默认中文，`/en` 英文，选择会持久化。

---

## 5. Provider 配置

默认使用 `fixture`（本地 3 秒示例音频），不产生任何 API 费用，适合开发、测试与演示。

切换到硅基流动 TTS（需要在启动前导出环境变量）：

```bash
export TTS_PROVIDERS=siliconflow
export DEFAULT_TTS_PROVIDER=siliconflow
export SILICONFLOW_API_KEY=sk-...
export SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
export SILICONFLOW_TTS_MODEL=FunAudioLLM/CosyVoice2-0.5B
```

> ⚠️ 硅基流动的模型 ID、端点与音色 ID 是**接入当天需要按官方文档核对**的常量，集中在 `apps/api/src/providers/siliconflow/tts.ts` 顶部。API Key 只在服务端读取，前端 bundle 不包含任何密钥。

新增一家厂商：实现 `TTSProvider` → 在 `createRegistryFromEnv` 注册 → 补错误映射与测试，业务路由无需改动。

---

## 6. 测试与构建

```bash
# 单元测试（API 需要 PostgreSQL 可连）
corepack pnpm -r test

# 浏览器 E2E（Playwright 自动启动 API 8787 + Web 3000）
corepack pnpm --filter @aural/web e2e

# 类型与生产构建
corepack pnpm -r typecheck
corepack pnpm --filter @aural/web build
```

当前基线：API 70 个测试、Web 61 个单测、Playwright 19 条 E2E，全部通过。

---

## 7. 已知限制与后续计划

| 项 | 说明 |
|---|---|
| STT | `/stt` 为占位页；录音、上传、识别在 S2 计划 |
| 资产库 | 目前只有「生成后播放/下载」；历史列表、筛选、删除在后续计划 |
| 配额与清理 | `usage` 表与 402 错误码已预留；记账与 30 天清理在 S3 计划 |
| 存储 | 开发用本地文件系统；S3/OSS 适配器在后续计划 |
| 部署 | 未包含部署、备案与生产监控 |
| 长文本 | S1 仅拦截超长；按句分段合成是 P1 |
| 代码检查 | `pnpm --filter @aural/web lint` 因 ESLint 9.0.0 与 `eslint-config-next` 版本不匹配暂不可用；typecheck/build 不受影响 |
| Next 16 | `middleware.ts` 会打印弃用警告，后续可迁移到 `proxy.ts` |

路线图：S2 STT 闭环 → S3 资产/配额/清理 → S4 存储与上线硬化 → Phase 2 AI 朗读/长文本/多角色 → Phase 3 实时对话与克隆（含合规前置）。

---

## 8. 文档

- PRD：`docs/reference/AI语音工作台_PRD_声屿Aural_v1.0.md`
- 实现设计：`docs/superpowers/specs/2026-10-31-aural-implementation-design.md`
- 执行计划：`docs/superpowers/plans/2026-10-31-aural-foundation-tts.md`
- 高保真原型：`docs/reference/aural-prototype-v2.html`（v1 保留对比）
- 语音能力调研：`docs/reference/语音能力选型调研_TTS_STT_2026-10.md`、`docs/reference/语音能力_需求调研报告_2026-10.md`

---

## License

本项目暂未添加开源许可证。如需公开复用，请先补充 `LICENSE` 并与作者确认授权范围。
