# Three Choose Two Garden Implementation Plan

**Goal:** 完成双无尽入口、无歧义闪光设置和手机积木花园美术改版。

**Architecture:** 复用现有纯规则层、存档、Web/SVG 与原生 Canvas。补位作为离线无尽 variant，旧三选二及在线规则保持兼容；不增加依赖。

**Tech Stack:** JavaScript ES modules, CSS/SVG, Canvas, node:test, Playwright.

1. 保存产品与视觉说明，先生成并检查四联手机效果图。
2. `src/engine.mjs`、类型文件、`src/progress.mjs`：立即补位、独立纪录、旧存档兼容。以现有 `tests/engine.test.mjs` 验证补位后判负、未选候选保留、恢复与排行隔离。
3. `main.mjs`、`style.css`：首页与无尽双入口、状态与结算、正向闪光开关，保留触控坐标和生命周期。
4. `native/canvas.mjs`：同规则、入口、设置语义及花园画面。
5. 更新现有浏览器与原生行为测试，运行游戏测试、构建、手机触控流程、开发模式相关检查。截图与验证记录保存游戏设计目录。
6. 检查局部 diff，交付真实验证结果，保留仓库其他进行中的改动。
