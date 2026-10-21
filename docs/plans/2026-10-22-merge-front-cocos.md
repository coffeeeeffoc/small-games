# Merge Front Cocos Implementation Plan

**Goal:** 交付已确认的横屏神机合阵：30 关、8 神将、8 武器、同核 AI、图鉴、引导、可选激励广告，并验证准确候选后推送 dev。

**Architecture:** 纯 TypeScript 规则及内容独立于 Creator；Cocos 场景处理画面、触屏和生命周期。复用现有广告、全屏、开发模式及 Creator 制品验证，不引入游戏框架。

**Tech Stack:** Cocos Creator 3.8.8、TypeScript、Node test、Playwright、公共 SmallGamesRewardAds。

## 1. 产品与美术

- 依据 `games/local/merge-front/docs/design/2026-10-22-cocos-rebuild-plan.md` 执行；用户已确认按建议实施及推送 dev。
- 已生成并保存九页效果图和角色、场景图集；实际 UI 字体与配方由运行时绘制。
- 激励奖励：暂停页主动选择“临时助力”，完整观看后本局灵石基础产出 +20%，30 秒，每局最多一次；暂停不消耗时长。基础关卡无需广告即可通过。
- 未配置/取消/失败不发奖励、不阻断继续；迟到回调不得影响新对局；助力标记为辅助记录，未来公平对战禁用。

## 2. 核心与内容

- 新增 `assets/scripts/core/content.ts`、`engine.ts`、`progress.ts`、`rewards.ts`，测试放 `tests/core.test.ts`、`tests/rewards.test.ts`。
- 先写断言覆盖等级累加、抽取事务、移动寻敌、AI同规则、同tick双晶、生产上限与存档幂等，再实现。
- `node --test --test-concurrency=1 games/local/merge-front/tests/*.test.ts`；30关通过合法命令和多种子回放验证可达。

## 3. Creator 画面与平台

- 新增 `MergeFront.ts`、`MergeView.ts`、场景/meta、设置及构建脚本，替换旧 Vite 入口。
- 完成首页、章节选择、准备、战斗、图鉴详情、说明、首次引导、暂停、结算；可触屏拖字和点选配方。
- 复用公共广告provider并接通构建配置；增益规则只有 completed 可生效。
- `pnpm --filter @small-games/merge-front typecheck`，`build`，再跑真实生产浏览器。

## 4. 仓库接线

- 更新本游戏 Shell 启动/行为断言、目录说明、沉浸状态及 dev-mode 浏览器入口。
- 登记 Creator 制品映射、CI生产与下载、Turbo环境变量、准确增量分类；旧实现删除须明确分类。
- 运行对应 shared scope、广告、开发模式及 Shell 测试，不因目录共享全量重建无关游戏。

## 5. 视觉及发布

- 横屏/竖屏旋转兜底、小屏、独立/iframe/Shell、全屏、触屏取消、前后台、广告四结果、胜负及解锁保存。
- 保存实际截图和报告，与效果图逐页对照。
- 合并最新 dev，提交本次范围，按准确 base/head 执行 `pnpm validate:candidate`，再正常推送和核对 CI/Pages。

主会话为默认唯一写入者。委派 core 时移交该阶段写入权；只读探索和复核可并行。重型构建与浏览器测试串行。
