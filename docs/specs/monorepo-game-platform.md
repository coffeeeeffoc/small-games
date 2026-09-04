## Problem Statement

当前产品是一个单体 Vite 前端：Shell、三款 Game、存档和广告逻辑共同位于一个源码目录中。Game 无法独立运行或部署，平台能力直接耦合到具体实现，广告设置与展示没有清晰分权，代码大量挤在单行文件中，难以维护、测试和交给 AI 安全修改。

产品接下来需要持续增加 Game，并允许每个 Game 独立发行或由不同 Shell 承载。Web Shell 需要按 Game Catalog 动态取得最新 Game Version，B 站 Shell 则必须遵守审核代码包与预声明分包限制。运营人员还需要通过 Creator Studio 管理 Dynamic Content、广告、版本和 AI 生成任务，并在本地开发环境安全地浏览、编辑、验证和提交真实仓库代码。

## Solution

将项目重构为使用 pnpm workspace 与 Turborepo 的 `@coffeeeeffoc/*` monorepo。每个 Game 成为独立可部署 App，同时通过框架无关的 Game Contract 接受 Game Host。Web Shell 支持可信构建期装载和沙箱 iframe 远程装载；B 站 Shell 使用审核包或预声明分包，代码升级继续走平台发布，只有 schema 和资源可以动态更新。

平台包含 Management Service、Game Runtime Service 和仅监听本机的 Workspace Agent。Creator Studio 提供本地账号登录、目录树、Monaco 编辑器、Dynamic Content 生命周期、AI schema/source 任务、diff 审核和发布控制。广告通过 Reward Opportunity、Ad Authority、ad-config 与 ad-runtime 解耦。PostgreSQL 保存业务数据，S3-compatible storage 保存不可变 Game Artifact 与素材。

## User Stories

1. 作为玩家，我希望直接运行任意一款 Game，从而不必先进入合集 Shell。
2. 作为玩家，我希望从 Web Shell 浏览并启动多款 Game，从而在一个入口体验整个游戏集合。
3. 作为玩家，我希望从 B 站 Shell 启动预声明的 Game 分包，从而获得符合 B 站审核要求的体验。
4. 作为玩家，我希望 Game Runtime Service 暂时不可用时仍可使用本地配置和本地存档，从而不因后端故障无法游玩。
5. 作为玩家，我希望远程 Game 加载失败时自动回退到可用版本，从而避免看到空白页面。
6. 作为玩家，我希望同一灰度阶段持续获得相同 Game Version，从而避免每次启动行为不同。
7. 作为玩家，我希望云存档可以跨设备恢复，从而保留游戏进度。
8. 作为玩家，我希望广告不可用或加载失败时仍能继续正常游戏，从而不被商业化流程卡住。
9. 作为玩家，我希望只有完整观看激励广告后获得奖励，从而保持规则一致。
10. 作为玩家，我希望远程 Game 无法访问 Shell 的账号令牌、Cookie 或 DOM，从而降低恶意或错误代码带来的风险。
11. 作为 Game 开发者，我希望每个 Game 可以独立执行开发、测试和构建，从而缩短迭代反馈时间。
12. 作为 Game 开发者，我希望同一份 Game 实现可用于独立发行、Web Shell 和 B 站 Shell，从而不维护多个复制版本。
13. 作为 Game 开发者，我希望只依赖框架无关的 Game Host interface，从而可以选择 React、Canvas、PixiJS 或 Phaser。
14. 作为 Game 开发者，我希望通过明确的 capability 声明使用存档、广告、配置和遥测，从而提前发现宿主不兼容。
15. 作为 Game 开发者，我希望内容 schema 由 Game 自己拥有，从而不会被其他游戏的领域字段耦合。
16. 作为 Game 开发者，我希望内容 schema 支持版本和迁移，从而安全读取旧内容。
17. 作为 Game 开发者，我希望 Game interface 在进程内和 iframe 模式表现一致，从而不为不同 Shell 重写逻辑。
18. 作为 Game 开发者，我希望公共 package 只能通过公开 exports 使用，从而避免依赖内部实现。
19. 作为 Game 开发者，我希望源码自动格式化并通过统一静态检查，从而保持人类可读和易于维护。
20. 作为 Game 开发者，我希望超过 300 行的文件产生明确警告，从而及时拆分状态机、规则和视图。
21. 作为运营人员，我希望创建和编辑 Dynamic Content 草稿，从而不修改 Game 源码即可调整关卡和数值。
22. 作为运营人员，我希望在发布前完成 schema 校验和预览，从而避免错误内容直接影响玩家。
23. 作为运营人员，我希望将已验证草稿发布为不可变版本，从而能够审计和回滚。
24. 作为运营人员，我希望在 development、canary 和 stable Release Channel 之间提升版本，从而控制发布风险。
25. 作为运营人员，我希望一键回滚只移动 Channel 指针，从而快速恢复且不破坏历史 Artifact。
26. 作为运营人员，我希望按 Game 查看目录树和源码，从而快速定位 AI 或人工需要修改的模块。
27. 作为运营人员，我希望在 Monaco Editor 中编辑源码并查看诊断，从而完成轻量代码维护。
28. 作为运营人员，我希望保存源码前查看 diff，从而理解实际变更范围。
29. 作为运营人员，我希望多人保存 Dynamic Content 时检测版本冲突，从而避免静默覆盖他人修改。
30. 作为运营人员，我希望 stable 发布、回滚、应用 AI diff 和清理 Artifact 前看到确认对话框，从而避免误操作。
31. 作为运营人员，我希望所有发布、角色和源码操作进入不可变审计日志，从而能够追溯变更。
32. 作为运营人员，我希望第一阶段的本地账号拥有全部角色，从而无需提前管理复杂权限分配。
33. 作为运营人员，我希望后续可以把 creator、reviewer、publisher 和 admin 权限分配给不同成员，从而支持团队扩展。
34. 作为运营人员，我希望配置 managed 广告的素材、频控和奖励规则，从而控制自有 Web/App 的商业化。
35. 作为渠道接入者，我希望在启动 Game Session 时指定 Ad Authority，从而选择 host、managed 或 none。
36. 作为 B 站渠道接入者，我希望广告内容和完成校验完全交给 B 站 SDK，从而符合渠道规则。
37. 作为自有 App 接入者，我希望使用运营配置的广告，从而自行控制广告内容和投放策略。
38. 作为开发测试人员，我希望使用 none Ad Authority，从而在不调用真实 SDK 的情况下验证奖励流程。
39. 作为 AI 内容创作者，我希望选择 schema generation，从而生成可以校验、预览并实时发布的结构化内容。
40. 作为 AI 代码创作者，我希望选择 source generation，从而创建新 Game 或修改一个既有 Game。
41. 作为 AI 代码创作者，我希望获得 source explanation，从而理解已有 Game 的代码和设计。
42. 作为 AI 代码创作者，我希望使用 source repair 修复未通过验证的生成结果，从而保留任务上下文继续迭代。
43. 作为代码审查者，我希望每个 Source Extension 在独立 Git worktree 中生成，从而保护主工作区。
44. 作为代码审查者，我希望 AI 默认只能修改目标 Game，从而避免意外改变 Shell、Shared 或后端。
45. 作为代码审查者，我希望 AI 修改依赖前获得显式授权且只能选择 allowlist 包，从而控制供应链风险。
46. 作为代码审查者，我希望只有通过 format、lint、typecheck、test 和 build 的变更才能形成 Artifact，从而阻止无效版本发布。
47. 作为代码审查者，我希望 Workspace Agent 只能创建候选提交，不能自动 push 或合并，从而保留人工控制权。
48. 作为开发者，我希望 AI 或构建中断后保留 worktree、日志和失败步骤，从而可以从失败点重新尝试。
49. 作为开发者，我希望每次重试创建独立 attempt，从而不会覆盖此前输出和证据。
50. 作为开发者，我希望从 Creator Studio 使用短期配对码连接本机 Workspace Agent，从而不向线上后端开放本地文件系统。
51. 作为安全维护者，我希望 Workspace Agent 只监听 `127.0.0.1` 并验证 Origin 和路径，从而阻止远程访问与目录穿越。
52. 作为发布者，我希望 Game Artifact 使用内容哈希和签名并且不可覆盖，从而验证完整性并可靠回滚。
53. 作为发布者，我希望被 Release Channel 引用的 Artifact 不能删除，从而防止线上版本失效。
54. 作为发布者，我希望未发布草稿先进入回收站并保留 30 天，从而能够恢复误删内容。
55. 作为平台维护者，我希望 Management Service 和 Runtime Service 拥有各自数据，从而未来可以独立扩展或拆库。
56. 作为平台维护者，我希望发布数据通过 transactional outbox 投影到 Runtime 数据模型，从而发布失败不会产生半完成状态。
57. 作为平台维护者，我希望 Runtime Service 永远无法读取 Management 草稿，从而保持发布隔离。
58. 作为平台维护者，我希望使用结构化日志、request ID 和 Game Session ID，从而跨模块追踪问题。
59. 作为平台维护者，我希望本地一条命令启动数据库、对象存储、后端、前端和 Workspace Agent，从而简化开发环境。
60. 作为平台维护者，我希望 CI 只构建受影响的 workspace packages 并使用缓存，从而让游戏数量增长后仍能快速验证。

## Implementation Decisions

- 使用单一 Git 仓库、pnpm workspace、Turborepo 和 `@coffeeeeffoc/*` package scope；保持 package 可抽离，不使用 Git submodule。
- 顶层按 Apps、线上 Services、本地 Tools、共享 Packages、Infrastructure 和 Documentation 分类。
- 第一阶段包含 Web Shell、B 站 Shell、Creator Studio、三款独立 Game、两个线上服务和一个本地 Workspace Agent。
- 每个 Game 同时提供独立入口、框架无关的嵌入入口、Web Artifact，以及由 B 站 Shell 生成的审核包/分包产物。
- Game Contract v1 定义 GameManifest、GameDefinition、GameInstance、Game Host、capabilities、标准错误和 iframe 消息协议。
- Game interface 不暴露 React 类型；具体前端框架通过内部 adapter 实现 mount、pause、resume 和 dispose。
- Web Shell 对可信构建期 Game 使用进程内 loader，对远程 Game Artifact 使用独立 Origin 的 sandboxed iframe loader。
- iframe Game 只能通过版本化请求、响应和事件消息访问 Game Host，不能直接访问网络、Shell DOM、Cookie、Token 或平台 SDK。
- B 站 Shell 不执行运行时下载的 JavaScript；合集 Game 使用预声明分包，独立 Game 可以使用单独 App ID。
- Game Artifact 内容寻址、不可覆盖，并记录 Manifest、Game Contract 版本、内容 schema 版本、capabilities、入口和完整性信息。
- Game Catalog 提供 development、canary 和 stable Release Channel，并支持固定 Game Version。
- 远程加载失败按照目标版本、last-known-good 和 Shell 内置版本顺序回退，并对失败版本熔断。
- Dynamic Content 使用公共版本化 Envelope；每个 Game 拥有自己的领域 schema 与迁移实现。
- Dynamic Content 必须经过草稿、校验、预览、发布和回滚流程，保存草稿不会影响玩家。
- Game 只声明 Reward Opportunity，不接触广告位、素材、SDK 或完成回调。
- Game Session 使用不可变的 `host`、`managed` 或 `none` Ad Authority，不在同一会话混用广告来源。
- 广告规则优先级为平台强制策略、Shell/渠道配置、Game 默认配置、Reward Opportunity 参数。
- ad-config 是无副作用的规则模块；ad-runtime 隐藏加载、展示、完成校验、错误降级和遥测。
- Management Service 与 Game Runtime Service 使用 Node.js、TypeScript、Fastify、Zod、Drizzle 和 PostgreSQL。
- Management Service 拥有本地账号、项目、草稿、AI 任务、源码任务、审核、发布、Artifact 和审计。
- Runtime Service 拥有玩家、Game Session、云存档、排行榜写入和行为事件，并提供已发布 Catalog 与配置。
- 两个服务共享 PostgreSQL 实例但使用不同数据库角色和 schema；发布通过 transactional outbox 投影。
- S3-compatible storage 保存 Artifact 和素材，本地开发使用 MinIO；任务队列首期使用 PostgreSQL job table。
- Creator Studio 使用 React、TypeScript、Vite、TanStack Router、TanStack Query 和 Monaco Editor。
- 第一阶段使用本地账号密码；密码使用 Argon2；初始账号拥有全部角色但权限模型保留。
- Workspace Agent 只监听回环地址，使用短期配对码、Origin allowlist、短期会话令牌和 workspace 路径校验。
- AI Provider 使用可替换 interface，不绑定具体厂商；密钥只保存在服务端，并记录输入哈希、模型、输出 diff、操作者和审查结果。
- Source Extension 只能创建新 Game 或修改一个既有 Game；跨 Shared、Shell 或后端修改必须使用独立平台任务。
- Source Extension 在独立 Git worktree 中产生，允许人工编辑，全部验证通过后形成候选提交和不可变 Artifact。
- Workspace Agent 不能自动 push、合并、发布 stable 或清理 worktree。
- 多人 Dynamic Content 使用乐观锁；同一 Game 同时只允许一个活跃 Source Extension worktree。
- stable 发布、回滚、应用 AI diff 和 Artifact 清理需要影响范围确认；开发阶段不重新输入密码。
- 已发布 Game Version、Artifact、审计和玩家存档不直接物理删除；未发布草稿进入 30 天回收站。
- 前端采用 React、TypeScript、Vite、TanStack Router 和 TanStack Query；Zustand 仅用于必要的本地客户端状态。
- 源码目录、类型和提交信息使用英文；UI 和领域文档可以使用中文。
- Prettier、ESLint、TypeScript strict、循环依赖和 package 边界作为 CI 门禁；300 行为可解释豁免的软限制。
- 首年容量目标约 1 万 DAU、峰值 100 RPS；普通 Runtime 读取 p95 小于 200ms，存档写入 p95 小于 500ms。
- 本地环境使用 Docker Compose 启动 PostgreSQL 与 MinIO；线上程序生成独立容器镜像，首期不绑定云厂商。

## Testing Decisions

- 测试只观察公开 interface 行为，不读取内部状态或依赖实现细节；当 implementation 重构但行为不变时，测试不应修改。
- 最高测试 seam 是 Game Contract。所有 Game 使用同一 contract test kit 验证 mount、pause、resume、dispose、重复挂载、能力缺失、配置不兼容和存档失败。
- Game 的领域规则通过纯函数或状态机 interface 测试，React 视图只覆盖关键用户交互和可访问输出。
- 所有 Game 必须分别通过独立开发入口 smoke test 和独立生产构建。
- Game Host 的 Browser、B 站、iframe、in-memory 和 test adapters 使用相同测试向量。
- iframe Loader 使用集成测试验证握手、Origin、schema 校验、超时、取消、dispose、能力拒绝、哈希失败、last-known-good 和内置版本回退。
- Web Shell 同时测试构建期进程内 Game 和远程 iframe Game。
- B 站 Shell 测试预声明分包 manifest、分包加载失败和不执行远程 JavaScript的约束。
- Ad Runtime contract tests 覆盖 host、managed、none、完整观看、中途关闭、无库存、SDK 异常、频控和重复回调。
- Dynamic Content 测试覆盖 schema 版本、迁移、草稿乐观锁、预览、发布、回滚和旧客户端兼容。
- Management Service 测试覆盖登录、全角色初始账号、AI 任务状态、审核、发布权限、审计和危险操作确认。
- Runtime Service 测试覆盖 Catalog、稳定灰度分配、云存档并发版本、玩家事件和离线降级。
- Transactional outbox 集成测试必须证明发布失败不会移动 stable 指针，重试不会产生重复投影。
- Workspace Agent 测试覆盖配对、Origin 限制、路径穿越、符号链接逃逸、文件读写、diff、worktree、任务恢复和禁止自动 push。
- Source Extension 端到端测试验证 AI 只能修改目标 Game，依赖变更受 allowlist 控制，验证失败不能产生 Artifact。
- Artifact 测试覆盖内容哈希、签名、不可变写入、引用保护、缓存损坏和回退。
- CI 按顺序运行 format check、lint、typecheck、循环依赖、单元测试、contract tests、集成测试和构建。
- 迁移期间保留当前单体作为行为对照，参考 Game 完成独立和嵌入测试后再迁移另外两款。

## Out of Scope

- 不实现 B 站运行时 JavaScript 热更新或任何绕过平台审核的代码装载。
- 不在第一阶段支持微信、抖音等其他渠道 Shell。
- 不建设浏览器版完整 IDE、内置终端、调试器或通用文件管理器。
- 不实现 Google Docs 式实时协作或 CRDT。
- 不允许远程 Game 任意访问网络或 Shell 私有状态。
- 不允许 AI 自动 push、合并、发布 stable 或跨多个平台模块自由修改。
- 不支持任意 npm 依赖安装；依赖修改必须显式授权并通过 allowlist。
- 不在第一阶段绑定具体 AI 模型厂商或云服务商。
- 不为了学习目的引入 Java 后端；只有明确的性能、团队或组织需求出现后才重新评估。
- 不引入 Kubernetes、Kafka、Redis、微前端框架或独立工作流引擎。
- 不在第一阶段实现复杂防作弊、实时排行榜分析或完整数据分析平台。
- 不强迫所有 Game 使用 React、Zustand 或 shared-ui。

## Further Notes

- B 站支持在审核代码包中预声明分包并通过平台接口按需加载，但代码包运行后不可动态修改；B 站代码升级必须重新构建、审核和发布。Web/App Shell 的远程 Artifact 能力不得被错误复用到 B 站 Shell。
- 第一阶段同时支持 B 站合集 App ID 和部分 Game 的独立 App ID；最终发布组合可以根据运营数据调整。
- 云厂商、对象存储供应商和 AI 模型供应商均位于 adapter 后面，待真实部署约束出现后选择。
- 迁移必须始终保持至少一个可运行入口，最后才删除旧单体目录。
- 规格对应的 canonical terms 和硬决策记录在项目领域术语表与 ADR 中。
