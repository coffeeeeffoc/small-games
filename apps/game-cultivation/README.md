# 三分钟修仙

`game-cultivation` / Game ID `cultivation`：亲手吐纳、御剑寻缘、登台渡劫的短局动作游戏。准备期 120 秒，可提前登台；渡劫限时 60 秒，主动击破三重劫眼才能筑基。

洞府练剑与收气 → 雾竹秘境的竹妖、石兽和灵泉 → 可选残阵、三件机缘与灵狐 → 云顶雷劫。移动、碰撞、蓄剑、闪避、妖兽前兆、引雷木和回程剑均影响实际结果。两件机缘的携带上限形成取舍；基础快剑不消耗真气。

手机竖屏：左侧摇杆移动；御剑短按快击、长按蓄力、拖动瞄准、松手出剑；靠近灵脉按住吐纳，失稳前松开收气。键盘：WASD / 方向键、空格御剑、E 互动、Shift 闪避、Q 护体、R 引雷木、Escape 暂停。暂停菜单可关闭声音、震动及减少动态效果。

Web 与 B 站原生 Canvas 共用模拟、渲染、输入及本地音频。旧版十八次文字选择不再是游戏入口；v1/v2 内容经校验迁移至 v3 的试炼参数。旧存档保留，战绩另存于 `cultivation:trial:v1`；离场不保留当前局，刷新重新入山，完成记录通过 Game Host 保存。

- 启动：`pnpm --filter @coffeeeeffoc/game-cultivation dev`
- 规则、输入、存档和兼容检查：`pnpm --filter @coffeeeeffoc/game-cultivation test`
- 浏览器完整实玩：先运行 `pnpm --filter @coffeeeeffoc/game-cultivation build`，再运行 `node scripts/cultivation-playtest.mjs`。默认使用已安装的 Chrome；同时验证开发版和正式包，截图与报告输出至 `.scratch/cultivation/`。
- 原生包检查：`pnpm --filter @coffeeeeffoc/shell-bilibili build`，然后 `pnpm --filter @coffeeeeffoc/shell-bilibili smoke`。
- 重新生成原创本地音效：`python apps/game-cultivation/scripts/generate-audio.py`。

规则入口为 `src/domain/trial.ts`，可调数值为 `src/content/schema.ts`，共享控制器为 `src/canvas/surface.ts`。实现与验收见 `docs/plans/2026-09-12-cultivation-implementation.md`。

“秋声斗蟋”仍独立位于 `apps/game-cricket`，ID `cricket`；`apps/game-arena` 仍为“电子斗蛐蛐”。
