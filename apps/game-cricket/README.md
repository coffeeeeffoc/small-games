# 秋声斗蟋

从原 `apps/game-cultivation` 迁出的茶馆斗蟋游戏，独立包名 `@coffeeeeffoc/game-cricket`，Game ID `cricket`。

保留原三擂、草梗蓄力、收梗闪避、Canvas 场景、音效、暂停和触屏操作。Web 大厅和 B 站原生目录均有独立入口。

启动：`pnpm --filter @coffeeeeffoc/game-cricket dev`。
浏览器验证（仓库根目录）：`node scripts/cricket-playtest.mjs`。

该游戏每次进入重新开擂，不读写修仙存档。`game-cultivation` 是修仙游戏，`game-arena` 是另一款“电子斗蛐蛐”。
