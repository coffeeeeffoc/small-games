# 打破笼子接住人

原创竖屏救援街机小游戏。用同一块挡板反弹球、击破笼子，再接住缓慢下落的队友。六名队友救到四名通关；漏接进入安全网并离场，漏球损失一次机会，三次机会耗尽或已不可能达到目标则失败。

## 运行

无需安装游戏运行依赖：

```sh
node games/local/cage-rescue/server.mjs
# http://localhost:4451/
```

或在仓库根目录执行 `pnpm --filter @coffeeeeffoc/cage-rescue dev`。已登记至 Web Shell，构建后独立入口为 `/games/cage-rescue/index.html`。

```sh
pnpm --filter @coffeeeeffoc/cage-rescue test
pnpm --filter @coffeeeeffoc/cage-rescue build
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @coffeeeeffoc/cage-rescue test:browser
```

浏览器测试使用仓库 `@playwright/test`，自行启动 4452/4454 端口的生产制品服务并在结束时关闭。可用 `PLAYWRIGHT_EXECUTABLE_PATH` 指定浏览器。

## 已实现

- 六个数据驱动阵形：初次救援、左右照应、双重锁扣、阶梯营救、两翼救援、全员待命。
- 单球、宽挡板、一击和两击笼子；撞击挡板的位置决定反弹角度。
- 预测落地时间并错开队友下落；两侧目标同时逼近时短暂缓降，挡板保持原速。
- 完整主页、逐关解锁、帮助、暂停、胜负结算、免费重试和下一关。
- 本机存档、音效开关、三套小队/挡板/场景配色。完成第 2、4 关解锁装扮，不影响能力。
- 鼠标/触屏直接拖动；键盘方向键或 A/D 移动、空格发球、Esc 暂停。
- 手势取消、多触点隔离、失焦/后台暂停、窗口变化保留对局、公共 H5 全屏和开发者模式。
- 失败后可自选请求一次广告补球；只有宿主返回 `completed` 才发奖，取消、不可用和失败不发奖。救援人数不足造成的失败不可续命。

## 平台边界

`src/host.mjs` 遵循仓库的 `GameHost` 存储及奖励端口；`mountCageRescue(host)` 可由真实宿主传入能力。独立运行和当前 iframe 注册使用本地宿主，没有自动继承 Shell 的广告或云存档。默认广告返回 `unavailable`，页面明确显示暂无广告，始终允许免费重试。本实现不假装播放商业广告，也未接入付费皮肤交易。

存档键为 `cage-rescue:host:progress`，内容版本为 1；保存被禁用或超出配额时保留当前会话的最新进度并提示。首次进入只解锁首关，开发试玩不结算进度或奖励。

Web/H5 `?dev=1`、`?dev=0` 和 `localStorage.dev` 通过公共 `SmallGamesDev` 生效。开发面板提供任意关试玩和结果演示；没有发布给普通玩家的修改状态接口，`__cageRescue.snapshot()` 仅返回副本。

## 结构与验证

- `src/levels.mjs`：版本化关卡目录和内容校验。
- `src/core.mjs`：无 DOM/SDK 的固定步长模拟、碰撞、缓降、胜负和续命规则。
- `src/render.mjs`：原创 Canvas 角色、塔楼、笼子、挡板和安全网。
- `src/main.mjs`：页面、触屏生命周期与宿主能力编排。
- `src/progress.mjs`、`host.mjs`、`audio.mjs`：本机成长、宿主适配、原创合成音效。
- `tests/`：规则、六关正常输入可达性、存档及宿主、浏览器流程与广告奖励回归。
- [设计与验收](docs/design/README.md)：效果图、手机运行图、平衡参数和验证边界。

新增游戏尚未产生 Git 提交时，仓库的 `check:games` 会要求真实提交元数据。按仓库规范，在提交源码后运行 `pnpm sync:game-meta`，不要填入伪造的提交时间或 SHA。未初始化的独立游戏子模块也会阻止全仓配置及全屏副本检查。
