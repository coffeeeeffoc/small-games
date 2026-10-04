# Surprise Kept Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `games/local/surprise-kept` 实现可触屏游玩的《惊喜别穿帮》八关游戏，保持参考图的暖色手绘客厅、三色箱子和人物记忆气泡。

**Architecture:** 无 DOM 依赖的纯规则核心；JSON 章节和主题内容独立加载与校验；浏览器运行层连接视图、Pointer Events、回放、音效及本地进度。关卡总数来自内容目录，核心不包含关卡编号判断。

**Tech Stack:** 原生 ESM JavaScript、SVG、CSS、Node test、Playwright；静态目录构建，不增加运行依赖。

---

### Task 1: 固定规则和章节

- 创建 `games/local/surprise-kept/src/core/engine.js` 与 schema 模块，以及 `content/chapters/birthday.json`。
- 搬运只更新当时在场且未被屏风挡住的角色对该物品的记录；离开和返回不更新记忆。
- 屏风布置时扣库存，仅下一次有效搬运后移除；相同箱子的无效操作不消耗屏风。
- 礼物和钥匙可暂时共处一箱。钥匙是独立的信息载体，本章没有隐含开锁规则。
- 创建 `tests/core.test.mjs`，验证八个答案、错解、不在场、同箱、撤销重放及输入非法内容。

### Task 2: 原创插画和直接操作

- 创建 `src/render/art.js`，手绘 SVG 房间、人物、箱子、屏风和道具；暖棕轮廓、粉杏色、柔和阴影。
- 创建 `index.html`、`styles.css`、`src/render/view.js`、`src/input/pointers.js`。
- 物品可拖到箱子，也可选择后点击箱子；人物可点按倒茶/返回，屏风可拖到人物或点击选择。
- 保留角色最后目击事件、实际位置提示和明确的当前目标；处理 pointercancel、blur、多触点和缩放。

### Task 3: 运行、回放、扩展

- 创建 `src/runtime/game.js`、`src/content/loader.js`、`src/platform/{audio,storage}.js`。
- 免费撤销恢复整个状态（位置、在场、记忆、屏风库存和时间轴）；按记录播放动作和最终角色寻物。
- `content/manifest.json` 注册 JSON 章节和主题。选关界面提供本地 JSON 章节导入，校验后才加入目录。
- 实现暂停、返回选关、重开、声音、全屏、减少动态效果和可恢复的本地进度。

### Task 4: 接入和验证

- 新增包脚本、静态构建和本地服务器，接入 Shell 的 manifest、依赖、动作检查、锁文件与游戏目录。
- 执行 `node --test games/local/surprise-kept/tests/*.test.mjs`、游戏构建、`node games/local/surprise-kept/tests/browser.mjs` 和仓库 `check:games`。
- 在 320/390/430 像素手机尺寸与桌面检查实际画面，以触屏输入验证核心解法、拖拽取消、双物品、撤销与回放；保存实际截图。
- 仓库 game-meta 要求真实 Git 历史；在必要验证通过后做本次内容的作用域限定本地提交，再同步生成元数据。无远端推送。

### Acceptance boundaries

本次实现与验证针对浏览器/H5 和 Web Shell。原生微信/B站渠道适配与真机触屏验收不在本次自动化证据范围。广告与支付仅保留产品方向，本次不模拟收费或广告发奖。
