# 空位网格与积木形态验证

2026-10-09；Node 24.21.0、pnpm 12.6.0、Chromium 151.0.7922.173。

修正上一版实心墨绿空格仍被看作积木的问题：空位不再绘制任何块状对象，棋盘采用中性浅底和连续细网格；真实积木保留颜色、圆角倒角、高光并增加轻投影。先行局部图见 [board-concept.svg](board-concept.svg)。

## 截图对照

用户提供的第15关中途盘面和三个候选用存档 fixture 复现，前后截图使用相同的格子位置和真实积木颜色。fixture 只用于视觉对照，不代表通过真实玩法达到该盘面或解锁关卡。

| 场景 | 实际浏览器截图 |
| --- | --- |
| 同盘面旧版 | [墨绿实心空格](photo-board-before-normal-390x844.png) |
| 同盘面新版 | [390×844 普通主题](photo-board-after-normal-390x844.png)、[320×568](photo-board-after-normal-320x568.png) |
| 新版高对比 | [390×844](photo-board-after-high-contrast-390x844.png)、[320×568](photo-board-after-high-contrast-320x568.png) |
| 真实拖放预览 | [合法](game-valid-preview-390x844.png)、[非法](game-invalid-preview-390x844.png) |
| 真实落子并清除后 | [空盘只有网格](game-after-first-390x844.png) |
| 原生 Canvas | [普通](native-game-normal-390x844.png)、[高对比](native-game-high-contrast-390x844.png) |

人工检查前后同盘面图，确认绿色和黄绿色积木保持独立凸起轮廓，空位只有平面细网格，没有另一种实心块形。合法预览和非法预览继续保留轮廓及反馈；消除后对应区域显示空棋盘底。

## 验证结果

- 规则测试 40 项通过。
- 生产 H5 回归 27 项通过，0 页面异常。使用 CDP 真实触屏拖放覆盖首页、选关、游戏、取消、多点触控、暂停、胜负结算、恢复、全屏、方向变化和 320×568／360×640／390×844 小屏。完整结果见 [browser-verification.json](browser-verification.json)；本次只归档其中三张与空位相关的截图，旧档案保持历史版本。
- 同盘面前后和主题对照 5 组通过。只读检查前后棋盘值、积木数量一致；新版所有空位均不包含块状绘图节点，普通／高对比棋盘底实际计算色正确。记录见 [photo-board-check.json](photo-board-check.json)。
- 微信 Canvas preview 重新构建，触屏打开关卡、暂停、切换高对比、恢复后，两种主题的空位像素与浅底一致；0 页面异常。记录见 [native-grid-check.json](native-grid-check.json)。
- `git diff --check` 通过。

这些为桌面 Chromium 手机触屏模拟；原生浏览器检查使用 mock 微信 SDK，没有进行手机真机或官方平台验收。存档 fixture 不属于玩法通过证据，27项功能回归采用真实触屏流程。精确 base/head 发布校验和远端结果另记录，不能从本记录推断线上 CI/Pages 成功。
