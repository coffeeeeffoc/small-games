# 远距离实时炮战实施计划

**Goal:** 将单向攻城改为可运行的远距离实时双城炮战，完成真人匹配、机器人补位和地堡生存循环，验证后推送 dev。

**Architecture:** 新规则使用固定步长，与渲染、DOM 和 Host 分离。H5 与独立 Node 服务复用同一规则；服务通过 HTTP 操作和 SSE 权威快照同步，不增加网络依赖。复用原有 MeshKit、Rodin 炮、士兵、城楼、材质、音效、Host 存档和横屏容器。

**Tech Stack:** TypeScript、Three.js、Vite、Vitest、Node 内置 HTTP、Playwright。

用户最新指示暂缓部署，域名尚未正式备案。本次交付可运行服务、本地真实双客户端验收和 dev 代码，不修改腾讯云现有部署。普通炮增加到场检修，避免城未毁且双炮失效后的僵局；期间仍受移动、趴下、爆炸与生命规则约束。

## 影响范围

- 新增 `src/duel-{types,map,actions,physics,simulation,bot,network,session,scene,world,hud}.ts`：共享规则、配置、输入、网络、场景与画面。
- 修改 `src/index.ts`、`src/definition.ts`：现有 Canvas/Game Host 入口切换至新玩法，保留原生本地练习与 H5 网络边界。
- 新增 `src/duel-server.ts`、`vite.server.config.ts`：真实匹配、8 秒机器人补位、重连和退出，提供同源 `/play/` 静态入口。
- 保留 `src/progress.ts` 旧进度和外观，新增独立对战记录；开发试玩不写记录。
- 修改游戏浏览器脚本、Shell 当前游戏的行为断言和简介。公共 dev/fullscreen 实现不修改。
- 地堡使用 Hyper3D 新模型，其余美术复用；设计参考为 `concept.png`，不是运行截图。

## 实施与检查

1. 配置与规则：对称双城、路线、独立炮位装填、两种弹药、固定步长弹道、遮挡、破洞、城毁撤离、有限治疗。Vitest 验证无自动命中、暂停装填、取消蓄力、治疗消耗和死亡优先。
2. 机器人：同规则输入，估算射击并根据历史落点修正，有限反应和治疗资源；测试持续攻击及资源一致。
3. 场景与触屏：近景炮台、远景敌城、独立观察镜头、可见路径、装填/趴下/治疗、红色边缘；对照效果图，覆盖横屏、竖屏旋转和多点取消。
4. 联网：兼容版本、权威命令校验、序号去重、配对/取消竞态、断线 20 秒、15 分钟对局时限、90 秒无操作退出。两客户端检查相同炮弹/伤害/结算，机器人补位不伪装真人。
5. 入口与存档：主页、练习地图、设置、帮助、外观、菜单、结算；保存旧存档，结果按模式分开记录。
6. 验证：`pnpm --filter @coffeeeeffoc/game-castle-cannon test`、`typecheck`、`lint`、`build`、`smoke`，定向 Shell/iframe/dev 检查，保存手机运行截图及验证记录。
7. 发布：同步远端 dev，提交准确候选，运行仓库正常增量门禁并推送。核对远端 SHA、CI 和 Pages；公网服务与实体手机验收分别记录。

## 素材与保护

原始未提交内容已备份至 `F:/playground/playground-ai/castle-cannon-backup-20261009`。实施位于 `F:/playground/playground-ai/castle-cannon-duel-local`，基线 `c2d98b038f44012e29e6b7e35b888d103b1397d2`。旧单向攻城证据保留为历史，不混作新对战验证。

Hyper3D 地堡生成 ID：`cc9076e8-ca33-4927-9c41-d8572ccf9a91`。生成页面：https://hyper3d.ai/workspace/rodin/cc9076e8-ca33-4927-9c41-d8572ccf9a91。源文件 `source/bunker.glb` 保留，转换为既有 native-compatible sculpture 格式。
