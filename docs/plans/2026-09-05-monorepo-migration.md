# Monorepo Architecture Migration Plan

**Goal:** 将现有三游戏单体重构为可独立运行、可由两个 Shell 承载、支持远程版本和 AI 后管的 `@coffeeeeffoc/*` monorepo。

**Architecture:** 以 Game Contract 为核心 seam，先迁移一款参考 Game 验证独立和嵌入模式，再扩展 loader、广告、服务与 Studio。整个迁移期间始终保留一个可运行入口，最后才删除旧单体结构。

**Tech Stack:** pnpm workspace、Turborepo、React、Vite、Fastify、Zod、Drizzle、PostgreSQL、MinIO、Vitest、Playwright、Monaco Editor。

## Phase 1：Workspace 与质量基线

1. 将 npm lockfile 迁移为 pnpm lockfile，建立 `pnpm-workspace.yaml` 与 `turbo.json`。
2. 建立 `config-typescript`、`config-eslint` 和根级 Prettier。
3. 将根命令统一为 `dev`、`build`、`test`、`typecheck`、`lint`、`format:check`。
4. 增加 GitHub Actions 和 package 边界/循环依赖检查。
5. 验证旧应用仍能运行，作为迁移对照基线。

## Phase 2：核心 interfaces

1. 创建 `game-contract`，实现 Manifest、GameDefinition、Host errors 和 iframe messages。
2. 创建 `game-host`，提供 Browser、in-memory 和 test adapters。
3. 创建 `content-schema` 公共 envelope。
4. 编写 contract test kit，供 Game 和 Host adapters 复用。

## Phase 3：参考 Game 迁移

1. 将《三分钟修仙》的领域模型、状态机、视图和内容 schema 拆成可读文件。
2. 提供独立 Vite 入口和 `GameDefinition` 嵌入入口。
3. 在旧大厅中通过 in-process loader 装载该 Game。
4. 跑独立 build smoke test 与 contract tests。
5. 以此目录作为 AI 新建 Game 的参考模板。

## Phase 4：Loader 与 Shell

1. 创建 Web Shell，并实现构建期 registry。
2. 实现 sandboxed iframe loader、握手、超时、消息校验和 dispose。
3. 实现 last-known-good、内置版本和熔断回退。
4. 创建 B 站 Shell 和分包 manifest 生成器。
5. 验证一款 Game 的 Web 远程加载及 B 站预声明分包产物。

## Phase 5：其余 Game 与广告

1. 迁移《打工人摸鱼记》，保留五日流程与存档。
2. 迁移《电子斗蛐蛐》，保留联赛和构筑流程。
3. 创建 `ad-config` 纯规则模块。
4. 创建 `ad-runtime` 及 host、managed、none、test adapters。
5. 使用 contract tests 验证三种 Ad Authority。

## Phase 6：数据与服务

1. 使用 Docker Compose 建立 PostgreSQL 和 MinIO。
2. 创建 Management Service 的账号、内容、AI 任务、发布与审计模块。
3. 创建 Runtime Service 的 Catalog、配置、Session、存档和事件模块。
4. 建立分离 schema/角色、transactional outbox 与发布投影。
5. 验证发布失败不会移动 stable 指针。

## Phase 7：Studio 与 Workspace Agent

1. 创建本地账号登录与全角色初始账号。
2. 创建 Studio 的项目导航、目录树和 Monaco 编辑器。
3. 创建仅监听回环地址的 Workspace Agent 和短期配对流程。
4. 实现安全路径解析、读写、diff、worktree、验证和任务恢复。
5. 接入可替换 AI Provider，并完成 schema 与 source 两类任务。
6. 验证 AI 无法越过目标 Game、依赖 allowlist 或自动 push。

## Phase 8：动态发布闭环

1. 实现 Dynamic Content 草稿、校验、预览、发布与回滚。
2. 构建不可变 Game Artifact，写入哈希、签名和兼容信息。
3. 实现 development、canary 和 stable Channel。
4. 让 Web Shell 通过 Runtime Service 加载一款远程 Artifact。
5. 完成审计、故障回退、端到端测试和运行手册。

## 完成标准

- 三款 Game 各自可以独立启动和构建。
- Web Shell 能同时使用构建期 Game 与远程 iframe Game。
- B 站 Shell 能生成预声明分包产物，并且不执行远程代码。
- Studio 能登录、浏览与编辑源码、查看 diff，并控制 Dynamic Content 发布。
- Workspace Agent 能在隔离 worktree 中生成、验证和保留代码。
- 两个后端拥有各自数据并完成可靠发布投影。
- 根目录一条命令可以启动完整本地环境。
- 所有 format、lint、typecheck、test、contract test、integration test 和 build 门禁通过。
