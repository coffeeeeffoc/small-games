# 一炮拆城

拖动战场瞄准、松手开炮。门先拆推进更快，塔先拆伤亡更少；士兵自动推进到旗帜后占领。首关士兵已在门前，一发实心弹破门立即放行，装填期间箭塔继续压制。三座固定模块小城堡、两种免费炮弹和一种自动士兵；没有射击则无法获胜。

- 实心弹沿瞄准线命中第一个模块，仅对该目标穿透伤害 3。
- 爆破弹在第一个命中模块处爆炸，对中心距离不超过 84 的模块伤害 2。空地炮击可在瞄准位置爆炸。
- 2.8 秒装填；箭塔每 0.7 秒射击进入射程的最前方士兵，伤亡会降低占领速度。
- 城门和障碍阻挡通路；存活士兵到达旗帜才增加占领。全员撤离或超时失败。

游戏 ID `castle-cannon`，Shell/独立 H5 地址 `/games/castle-cannon/index.html`。源码规则 `src/rules.ts` 不依赖 DOM/SDK，关卡与校验在 `src/levels.ts`，成长版本与迁移在 `src/progress.ts`。存档使用已有 Game Host 命名空间，首次通关材料不重复发放；外观不增加战斗数值。使用 `?dev=1` 或统一存储开关开启开发面板，试玩不保存解锁和奖励。

```sh
pnpm --filter @coffeeeeffoc/game-castle-cannon dev
pnpm exec turbo run build --filter=@coffeeeeffoc/game-castle-cannon...
pnpm --filter @coffeeeeffoc/game-castle-cannon test
pnpm --filter @coffeeeeffoc/game-castle-cannon lint
pnpm --filter @coffeeeeffoc/game-castle-cannon typecheck
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @coffeeeeffoc/game-castle-cannon smoke
pnpm --filter @coffeeeeffoc/shell-minigame build:game --platform wechat --game castle-cannon --preview
pnpm --filter @coffeeeeffoc/game-castle-cannon test:native
```

微信预览目录为 `apps/shell-minigame/dist/wechat/castle-cannon`，含横屏 game.json、game.js、原创音效和 touristappid 项目配置；这是预览工程，不是已上线微信小游戏。未验证微信开发者工具与微信真机，未配置真实 AppID/广告位。广告入口仅通过项目既有 Host Ad 抽象，普通重试与基础弹种不受广告限制。

初始页面设计见 `docs/design/README.md`；最新三维目标与实际整幅对照、性能及验证边界见 `docs/design/immersive/README.md`。完整 Pages 构建依赖仓库其他 Cocos 游戏，在未安装 Creator 3.8.8、未取得有效现有 Cocos 制品的云环境会被它们阻塞，不能把单游戏构建成功称为 Pages 发布成功。
