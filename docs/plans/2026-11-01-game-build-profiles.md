# H5 三档打包与夜航开发联调实施计划

**Goal:** 在统一打包配置中选择开发测试、测试和正式包，并为夜航提供实际可用的开发联调操作。

**Architecture:** 复用现有 H5 构建矩阵、共享 SmallGamesDev 和服务端资产事务。全局包类型允许单游戏覆盖；服务器调试能力默认关闭，与客户端开发开关分开验证。

**Tech Stack:** JavaScript/TypeScript、Node 内置测试、Playwright、Cocos Creator、现有 Runtime/PostgreSQL。

## 已确认范围

- 用户确认先完整接入夜航守望，其他游戏复用已有开发工具。
- Runtime 支持多游戏；当前 FRP 网关仅放行夜航，因此保留单游戏测试地址，不扩展网关。
- 保留其他会话的 UI、测试和上架材料修改，不提交或部署生产。

## 实施与验收

1. 配置增加 `buildType`、`apiUrls`、`gameOverrides` 和 CLI `--build-type`。保留旧配置及目标后端覆盖；缺地址、未知字段、正式回环地址、测试与正式同址在编译前拒绝。
2. 按每游戏实际选择 API，ZIP/计划/清单标识包类型。所有入口脚本之前注入不可写包类型；开发包常驻按钮，测试与正式包禁止 URL/存储开启。
3. 共享开发面板复用动作注册，并支持有标签和范围约束的数字输入。同步全部副本，保留触控、拖动、缩放边界和旧 Web 入口行为。
4. 夜航复用既有选关、试玩及奖励/排行隔离。增加金币/XP 调整动作，服务端 `dev-adjust` 默认拒绝，仅测试部署明确启用、验证本人会话后可用；复用资产锁、requestId 幂等和审计流水，校验整数、余额及边界。
5. 验证配置矩阵及真实 fixture ZIP、脚本先后和服务地址、开关优先级、输入有效性及触屏操作；运行共享副本检查。夜航阶段执行资产服务拒绝/授权/幂等测试、游戏规则与类型检查，以及实际 Creator 构建和浏览器流程。区分 fixture、浏览器、真机及平台证据。

## 后续授权：通用多游戏资产开发端口

用户要求将服务端开发能力复用到多游戏、显式启用本地 FRP 并提交。实现统一 `POST /games/:game/development/assets` 与 metadata 能力发现，以服务器端 Map 注册真实资产适配器，默认只有夜航钱包；不替其他游戏创造经济模型。共享 SDK 直接调用，夜航旧命令委托新端点并与兼容接口共用原账本和幂等编号。补两游戏独立 fixture 适配器、真实 Night PostgreSQL/HTTP 新旧路由幂等、字段/身份/开关拒绝及客户端主体漂移测试。

本地 selftest 同时检查回环及 FRP 公网的通用 POST，使用新 QA 身份并保留脱敏结果；主会话负责实际重建部署、浏览器验收及提交。生产和平台上传不包含在该本地启用动作中。

## 验证命令

```powershell
node --test scripts/build-games.test.mjs scripts/h5-build-type.test.mjs scripts/game-dev-mode.test.mjs
pnpm sync:dev-mode
pnpm check:dev-mode
pnpm build:games --build-type development --dry-run
pnpm build:games --build-type test --dry-run
pnpm build:games --build-type production --dry-run
```

夜航具体服务器/Creator/浏览器命令与最终结果由整合阶段登记；没有执行的项目不得写成通过。旧上架素材保留原证据身份，本次开发工具不进入正式玩家宣传画面。
