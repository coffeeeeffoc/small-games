# 工位偷闲样板 Implementation Plan

> 历史实现记录：已由 [2026-09-12 第一人称与一周场景设计](2026-09-12-game-office-first-person-design.md) 替代，旧样板代码与图集已移除。

**Goal:** 交付可从 Web 和 B 站原生入口运行的固定镜头工位样板，含可中断人物动作、独立的手机/窗口证据、确定且公平的老板巡查、声音和免费重试。

**Architecture:** Office 自有纯状态机与 Canvas 场景，共享两端规则、资产与坐标。内容增加可选的 `experience: 'desk-sample'` 标记，旧五日内容仍走旧流程；新样板成绩使用独立版本化记录，避免改写旧存档和其他 Game 数据。平台只补被实际使用的图片/音频/连续指针能力。

**Tech Stack:** 现有 TypeScript、React、Canvas 2D、Vitest、Vite；本地 Blender 制作绑定与预渲染资源。无新运行时依赖。

已获用户授权在当前任务继续实现；设计与概念稿已单独提交为 `9d41d78`。工作分支 `codex/office-realistic-sample`，不另建隔离工作树以便现有工作区直接预览。

## 1. 规则与检查

- 新增 `apps/game-office/src/sample/model.ts` 与 `tests/sample.test.ts`。
- 实现 90 秒、20 秒快乐、工作数据确认、巡查/提问、两类证据、动作收尾、成功/失败/重试。
- 先写可重复的收尾、公平预警、独立证据和 30/60 fps 一致性检查，再实现规则。
- 运行 `pnpm --filter @coffeeeeffoc/game-office test`。

## 2. 真实资产

- `apps/game-office/art/` 保存来源授权、可复现 Blender/音频生产脚本与资产说明。
- `apps/game-office/public/office-scene/` 保存背景/前景、主角/老板动作图集、声音与场景元数据。
- 用授权真实人体基础网格制作服装、姿态和动作；查看实际渲染，核对握持、坐姿、遮挡和动作连续性。
- 先得到一张可信场景，再导出完整动作；记录尺寸、帧数、解码内存和总体积。

## 3. 最少平台能力

- 扩展 `packages/canvas-game-adapter/src/index.ts` 的可选图片、音频和连续指针能力，不改变其他游戏现有 Tap/Press。
- 修改 `apps/shell-bilibili/src/sdk.ts`、`src/shell.ts`、`vite.native.config.ts` 以及相关 tests，接入原生能力与素材复制。
- `apps/shell-bilibili/src/native.ts` 复用初次创建的屏幕 Canvas，避免画到后续离屏 Canvas。
- 测试取消、暂停、销毁、图片错误与资源输出路径。

## 4. 场景与界面

- 新增 Office `src/sample/` 下的场景呈现、样板宿主与成绩读写，Web 使用 React Canvas 组件与可访问的等效按钮。
- 修改 `src/content/schema.ts`、`src/content/data.ts`、`src/definition.ts`、`src/canvas.ts` 和样式以接入新样板；旧入口按旧内容继续工作。
- 390 × 844 等比构图；直接点击道具、键盘、点击替代拖动，字幕、音量、暂停、免费重试。
- 测试界面开始/暂停/恢复/销毁、成绩冲突/离线和兼容旧内容。运行真实浏览器检查输入与完整通关/失败/重试。

## 5. 验证与交付

- 检查新场景素材实际加载、动作与判定同步、静音可玩，以及手机窄屏和桌面构图。
- 按仓库要求运行 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke`、`pnpm check:dependencies`。基线失败单独确认，不格式化无关文件。
- 使用 code-review 技能审阅固定起点 `9d41d78` 之后的实际改动并修复实质问题。
- 记录实测效果与剩余设备验证边界；不以生成图或假宿主测试声称已经真机达到 AAA。

## 本轮交付范围与质量边界

本轮对应总设计的 B 阶段：90 秒工位交互和基础人物动作。工作窗口与手机分别留下证据；拿取、轻放、快速扣屏可以在当前进度收尾；两轮巡查与追问、递文件/手机振动复玩、免费重试和独立成绩记录进入同一个运行流程。浏览器与 B 站原生入口共用规则和图集。

Blender 使用真实比例基础人体，离线渲染人物、场景和透明动作图集。当前皮肤、头发、服装与面部仍是基础制作材质；声音是可复现的合成办公 Foley。实际动作是把手机扣回桌面，未制作抽屉开关；同事来件以桌面核对单和可操作提示呈现，尚无完整递手表演。被抓时冻结当前持物姿势，专门的持机慌张表演留待下一轮人物制作。

这些素材用于验证完整交互，不代表 C 阶段写实质量已完成。下一轮应以本场景为准细化角色皮肤/头发、表情和手指，补全同事递手与老板起身动作，替换实录 Foley，再在目标手机和 B 站真机记录帧时间、加载和内存。其余 23 关继续保留设计状态。

固定机位位于员工正前方，运行时将相机看见的显示器表面表现为背壳；员工所看的电脑内容通过明确标注的“电脑画面”小窗展示。避免把工作表错误画到员工身后的显示器背面。后续改变机位时需一并重做手部遮挡和屏幕投影。

已发布内容没有被写入或迁移；既有五日玩法由旧内容继续选择，新样板使用 `office:desk-sample:v1` 保存纪录。没有修改远程 Office artifact 的交付管线，当前现有远程构建只覆盖 Cultivation；Office 远程音频 CSP 需要在接入该管线时单独验证。

## 2026-09-08 验收记录

- 正式素材为 14 张 PNG、12 组动作、152 帧；图片 8,648,273 字节（8.25 MiB），解码 RGBA 67.23 MiB，另有 12 个合成声音。全部图集边长不超过 2048，非空帧及像素变化检查通过。解码量不等于整机峰值内存。
- Chrome 实际页面检查了桌面和 390 × 844 视口、手机拿放、窗口切换、失败/免费重试、同事核对单。生产构建完整走过 90 秒、两轮巡查、回答 42、暂停/恢复和结算，页面显示“下班”及“已保存”，快乐/最佳均为 21.3 秒。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke`、`pnpm check:dependencies` 全部通过。Turbo 检查使用 `--concurrency=1`，避免与 Blender 争用本机内存；测试 40/40 tasks、构建 23/23、smoke 31/31。
- 原生 smoke 读取打包后的真实 PNG/WAV，并在无 DOM 的 SDK 仿真环境运行场景、输入、音频和暂停。没有据此声称 B 站真机的帧率、热稳定性和声音解锁已经验证。内置浏览器调试连接超时，实际浏览器验收使用 Chrome 完成。
- 本地体验：`pnpm --filter @coffeeeeffoc/game-office dev`；生产预览：构建后运行 `pnpm --filter @coffeeeeffoc/game-office exec vite preview --host 127.0.0.1 --port 5179 --strictPort`。
