# 2026-11-10 离线开局、补结算与旧内核兼容

TapTap 反馈“单人关卡停在正在准备计时”。旧包里，开局只要有一步不返回，就只显示一条 16 秒的提示，再点出发会被忽略。可能停住的地方有两类：IndexedDB 事务没有超时，弱网下串行请求的总耗时也会超过 16 秒。11-09 的[启动恢复](verification-2026-11-09-start-recovery/README.md)给这些步骤加了截止时间。本轮按用户要求进一步改为：服务器短时间不可用时，也能进入单人关卡，联网后再自动结算。仍然没有玩家设备日志，所以不能断定某位玩家具体卡在哪一步。

## 行为

- 服务连接或开局登记超过 12 秒、服务不可达、身份或网络请求失败时，正式关卡转为**离线行动**。顶部提示“暂未连上行动服务 · 本局离线进行，联网后自动结算”。版本过旧、账号变化、本机无法保存和服务端校验失败仍然停在出发前，并说明原因。练习、热身不受影响。
- 离线行动把输入写入本机 IndexedDB 日志，只使用已永久拥有的军需和已知等级，不预留或消耗单场/24 小时道具。服务脚本完全没加载时（无法写日志），仍可在本机游玩，但本局不计收益。
- 结算页显示“未联网 · 本局已暂存，联网后自动结算收益”。在线期间每 10 秒以及下次启动时会重试。服务端完整重放后发放奖励，并清除本机待结算日志；离开结果页后才结算的局，会弹出“离线行动已结算 · 金币 +x · 经验 +y”。
- 服务端：离线 run 不检查实际经过时间（墙钟），只接受永久效果，计入通关、积分和奖励，**不进入关卡最快榜**。协议见[服务架构](../../../../docs/architecture/game-services.md#输入回放协议)。这一点取代 [11-04 设计](design/refinement-2026-11-04/README.md)中“登记失败不得转本地正式行动”的规定，但只适用于服务不可达；改为离线时始终有明确提示，收益仍以服务器结算为准。
- 主界面在服务桥接迟到时，同一个桥接只重连一次；即使记录器创建失败，也不会每帧重复连接。

## 旧 WebView

H5 打包时，用 workspace 现有的 Vite（`transformWithOxc`）把服务脚本、存储脚本和 TapTap 登录桥接降级为 ES2018，并在所有其他脚本之前加载 [legacy-polyfills.js](../../../../platforms/competition/legacy-polyfills.js)，补齐 `Object.hasOwn`、`Array/String#at`、`flatMap`、`queueMicrotask`、`AbortSignal.timeout`，以及只支持 JSON 数据的 `structuredClone`。如果降级结果需要引入运行时 helper，打包直接失败。之前的源码直接复制进包：`Object.hasOwn` 需要 Chrome 93，`AbortSignal.timeout` 需要 Chrome 103，更旧的内核上服务会全部失效。最低仍需 Chrome 66（AbortController）与动态 import；Cocos 游戏代码的语法由 Creator 构建处理。

## 验证

- 游戏类型检查、Runtime `tsc --noEmit` 均通过。
- `input-mode`、`online`、`artifact` 共 91 项通过。三项旧断言（服务不可用或 25 秒超时停在出发前）改为验证：转入离线、12 秒截止、迟到的在线响应不覆盖离线配装、存储失败仍显示诊断、服务脚本缺失时仍可在本机游玩。
- `game-services`、`night-storage`（含真实 Chromium 存储）共 104 项通过。新增的离线日志用例覆盖：无会话开局、宿主登录超时保持“离线待结算”、联网后绑定首个登录玩家、携带配装补建、只结算一次并清除日志、`onSettled` 通知。把源码降级后再跑 `game-services`，81 项全部通过。
- `h5-game-services`、`h5-taptap-build`、`night-runtime-scope`、`deployment-bundle`、`build-games` 共 41 项通过，覆盖：打包后不残留 `?.`/`??`/`catch {}`、polyfill 位于最前且只出现一次、在 vm 中验证 polyfill 行为、TapTap 桥接等于源码降级结果、turbo 新输入有独立的范围证明。
- Runtime `ranked-runs`、`ranked-control` 共 11 项通过：离线 run 可上传 10 分钟输入并结算为 `offline/fastestEligible:false`，相同 requestId 不能离线/在线混用，非离线 run 仍拒绝超前输入。离线配装的 PostgreSQL 集成用例已写入，本机没有 `COMPETITION_TEST_DATABASE_URL`，未执行。

## 未完成与限制

- 未执行 Creator 3.8.8 构建、浏览器实机流程、实体手机或 TapTap 宿主验收，未打包或上传 H5，未部署 Runtime。
- **必须先部署 Runtime，再发布客户端**：旧服务端会以 `INVALID_INPUT` 拒绝 `offline` 字段，离线日志会停在“待核对”。
- 资产快照没有离线缓存：冷启动且离线时，以等级 1、无永久军需开局。离线局跳过墙钟校验，加速工具只能加快离线收益，不能进入最快榜；目前未设离线结算次数上限。
- 全量游戏测试仍有 7 项既有失败（不含本轮修改的用例）；Runtime `app.test.ts` 有 4 项因本机缺少 `rules/frozen/night-v16-v9` 而失败；`publication-scopes` 有 7 项失败，在干净基线上同样失败。
