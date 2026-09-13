# 实时街区围捕 Implementation Plan

**Goal:** 实现可直接在浏览器操作的 48 关实时围堵游戏，包含触屏、动画、声音、本地进度及运行验证。

**Architecture:** 原生 ESM 页面，Canvas 呈现道路与角色，DOM 负责选关、警察选择和暂停等可访问操作。纯模拟模块负责寻路、连续移动和捕获；固定关卡数据独立维护。

**Tech Stack:** JavaScript、Canvas 2D、Web Audio、Pointer Events、Node 内置测试和静态服务器。

用户已授权在当前目录执行。目录没有 Git，因此不创建 worktree，也不凭空配置远程发布。

1. `src/engine.js` 与 `tests/engine.test.mjs`：沿路寻路、改令、实时逃跑、动态阻挡、空间收网、暂停与单次胜利。运行 `node --test tests/engine.test.mjs` 验证关键边界。
2. `src/levels.js` 与 `tests/levels.test.mjs`：48 个固定路网、出生点、人数和提示。检查数据并用模拟指令验证可完成性，记录实际结果。
3. `src/renderer.js`：按固定游戏坐标绘制玩具街区、角色动作、表情、路线和封锁反馈，按屏幕和 DPR 缩放。
4. `index.html`、`src/style.css`、`src/main.js`、`src/audio.js`：主游戏界面、点选/拖动/改道、关卡选择、暂停重开、音效、进度和设备生命周期。
5. `scripts/serve.mjs`、`scripts/build.mjs`：无运行依赖的开发服务器与静态产物。执行 `npm test` 和 `npm run build`。
6. `scripts/playtest.mjs`：浏览器真实输入验证开局、运动、改道、捕获、胜利、下一关、暂停恢复、进度、触屏与横竖屏。保存截图和结果到 `artifacts/`。
7. `README.md`：记录启动方式、操控、已实现范围和已验证/未验证边界。打开本地页面交付。

验证失败时修复根因再重跑相关检查，不把数据检查等同于可玩性验证。
