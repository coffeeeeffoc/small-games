# Carding Car Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 交付微信／B站优先、H5 兼容的手机横屏海湾卡丁车首版。

**Architecture:** Cocos Creator 3.8.8 工程位于 games/local/carding-car。纯 TypeScript 驾驶与比赛规则通过输入、固定时间步和状态形成测试边界，Creator 组件负责渲染、触控、镜头与 HUD；使用引擎原生发布流程，不改造现有 2D Canvas Shell 来承载 3D。

**Tech Stack:** Cocos Creator 3.8.8、TypeScript、Node 原生测试、Playwright、B站官方 Creator 插件、Rodin。

---

用户已要求当前任务直接执行并提交当前分支，不另外创建任务或工作树。规则测试边界沿用已确认设计：驾驶输入到车状态、合法赛程到圈数/排名、实际玩家输入到运行画面。

## 1. 工程与三端构建

- 创建 games/local/carding-car/package.json、tsconfig.json、assets/scenes/main.scene、assets/scripts/KartGame.ts 和 scripts/build.mjs。
- 下载并固定官方 Creator 3.8.8，使用官方 B站插件生成 biligame，优先完成 wechatgame/biligame，再验证 web-mobile。
- 构建命令：pnpm --filter @coffeeeeffoc/carding-car build；原生构建提供 build:wechat、build:bilibili。
- 如官方工具、登录或真实 AppID 阻断验证，保留明确错误与可复现命令，继续完成不受阻的实现，不把打包等同真机通过。

## 2. 驾驶与漂移

- 创建 assets/scripts/KartConfig.ts、KartPhysics.ts、KartController.ts；从 tests/rules.test.ts 的直线不能刷漂移奖励开始 red/green。
- 依次实现低速转向、速度转向曲线、抓地、横向摩擦、漂移两档与释放、碰撞减速、约一秒复位；每个行为一条最小检查。
- node --test games/local/carding-car/tests/rules.test.ts；pnpm --filter @coffeeeeffoc/carding-car typecheck。
- 运行短路段，检查触控同时转向与漂移、取消触摸、帧率、日志与截图。提交经过验证的阶段。

## 3. 赛道与比赛

- 创建 TrackGenerator.ts、Track.ts、RacingLine.ts、KartAI.ts、CheckpointSystem.ts、LapSystem.ts、RankingSystem.ts、RaceManager.ts。
- 程序化海湾闭环及合法近道；按设计实现四车、三圈、倒计时与完赛，AI 同参数，不隐藏追赶。
- 逐步增加逆行/压线不刷圈、合法近道完赛、复位不增加进度、三圈正确结算的规则检查。
- 完整运行并记录最影响驾驶乐趣的三个问题，先修最大问题并复测、提交。

## 4. 镜头、HUD、声音与资产

- 创建 ChaseCamera.ts、HUD.ts、AudioFeedback.ts；引擎原生 UI 提供中文按钮、多指操控、低干扰 HUD、重赛与暂停。
- 核心手感稳定后首批最多三次 Rodin 任务，保存车辆资产来源；共享一款模型供四辆车使用。
- 复测漂移进出、Boost 反馈、近道成败、跳台落地、暂停与连续重赛。

## 5. Shell、回归、评审与提交

- 接入 apps/shell-web/src/standalone-games.json、apps/shell-web/package.json、standalone-game-checks.mjs、pnpm-lock.yaml 和 Turbo 构建输出。
- 留下 tests/browser.mjs、README.md、playtest.md；记录实际操作、截图、console、帧率与原生验证边界。
- 运行目标游戏全部规则/类型/构建/浏览器检查、pnpm test:game-config、pnpm check:games；结束时运行完整仓库测试一次。
- 使用 code-review 技能评审实际改动并修复，git diff --check 后仅提交本任务文件到当前分支，不推送。
