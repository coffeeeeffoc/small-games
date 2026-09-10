# 三分钟修仙

`game-cultivation` / Game ID `cultivation` 专用于修仙。三章十八次历练，根据根骨、灵识与福缘成长，最终结算境界、灵石和最佳道行，可免费轮回或使用可选福缘奖励。

网页采用山门水墨界面；B 站原生 Canvas 复用相同事件、数值和存档。单次人生离开后重新开始，灵石和最佳道行由 Game Host 保存。事件位于 `src/content/data.ts`，境界门槛位于 `src/domain/model.ts`。

启动：`pnpm --filter @coffeeeeffoc/game-cultivation dev`。
浏览器验证（仓库根目录）：`node scripts/cultivation-playtest.mjs`。

原先误放在此处的“秋声斗蟋”已完整保留为 `apps/game-cricket`，独立 ID 为 `cricket`；`apps/game-arena` 仍为“电子斗蛐蛐”。
