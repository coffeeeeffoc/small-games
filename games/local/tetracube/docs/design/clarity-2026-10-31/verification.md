# 本地实现验证

2026-10-31，Windows、Cocos Creator 3.8.8、Chrome 156。设计参考见本目录 README；真实截图来自 Creator 产物，不使用效果图代替运行证据。

## 已执行

- `pnpm --filter @coffeeeeffoc/tetracube test`：135/135。包含全部 18 个关卡的真实合法操作通关、固定步进回放、存档迁移、损坏保留、奖励四种结果/迟到/并发、接触几何、跨极点跟手方向、缩放锚点与有滚转角度的移动映射。
- `pnpm --filter @coffeeeeffoc/tetracube typecheck`、`pnpm --filter @coffeeeeffoc/runtime-api typecheck`：通过。
- `pnpm --filter @coffeeeeffoc/runtime-api exec vitest run tests/tetracube-ranked.test.mjs tests/carrom-deployment.test.ts tests/ranked-games.test.mjs`：28/28。18 关 JSON 分批重放，伪造分数/步数/辅助输入拒绝；180° 重排由服务端标记辅助并拒绝入榜。
- `node --test scripts/h5-game-services.test.mjs scripts/deployment-bundle.test.mjs`：12/12。新游戏公开配置重写与实际后端打包导入闭包均覆盖。
- `node scripts/check-workspace-dependencies.mjs`：通过。仅登记精确跨边界依赖，未放宽未知导入。
- `pnpm --filter @coffeeeeffoc/tetracube build`：使用真实 Creator 3.8.8 生成 web-mobile；产物 `dist/build-info.json` 保存本次源码指纹和逐文件哈希。
- `node games/local/tetracube/tests/prebuilt-release.mjs`：使用真实 Creator 产物执行离线缓存 → HTTPS 启用发行 → 关闭发行，验证源码指纹、引擎资源字节与缓存不变，更新并核对运行时 manifest，最后还原原始离线产物。
- `pnpm --filter @coffeeeeffoc/tetracube test:browser`：真实画布点击、键盘与 CDP 触屏；320×640、390×844、844×390、1280×800。覆盖首页/选关/星级解锁/结算/排行离线/设置、三轴动画、暂存、各预设视角、自由观察、缩放/适配/双指交接、第三指取消、层面检查、拖动/落下、翻舱中观察、暂停/恢复/重载、广告结果/配额/迟到/后台。

## 证据与复用

- 游戏测试日志：仓库根 `outputs/tetracube-clarity-tests.log`；构建/浏览器分别为同目录 `tetracube-clarity-build.log`、`tetracube-clarity-browser.log`。
- 真实截图：`reports/browser/` 下 `home-*`、`levels-*`、`challenge-*`、`challenge-result-*`、`play-*`、`observe-*`、`zoom-*`、`layer-inspector-*`、`ranking-*`、`paused-*`、`stack-390.png`。
- 发布录制入口保留：设置 `TETRACUBE_CAPTURE=1` 后运行浏览器测试，设计截图输出本目录 `actual/`，发布录屏继续沿用原有录制路径。普通测试不替换上架资料。
- 原有共享浏览器入口使用的 `start/drop/pause/resume/home` 控件 ID 保留，未改共享入口分支；可在整合后的实际 Shell 中继续运行其 Tetracube 定向场景。

## 尚不构成的验证

上述仅为本地引擎与浏览器验证。控制面 Tetracube 注册及 schema 升级、远端 Runtime/HTTPS 真正验分与榜单读写、准确提交候选 CI/Pages、TapTap 真实广告填充/宿主、物理手机及发布素材最终导出由后续整合阶段单独记录。当前默认本地构建 `competitionEnabled=false`，网络入口在 Pages/发行重打包时按公开环境配置启用；没有伪造联网或假名次。

## 视觉与素材复核

主会话逐张对照了本轮参考与 390×844 首页/对局/层面检查、844×390 实战及真实操作堆叠画面。首页采用完整方块主视觉与两种明确入口；实战移除旧背景舱体和大面积按钮面板，层尺、落点和控制区不互相覆盖。相邻格保持完整单元尺寸、接触边平直，只给可见外缘轻倒角；同色块的细分线不会制造几何间隙。层面检查可放大阅读，观察和缩放保持操作可达。

实际实现与参考的差异：以真实 8×8×18 容器和关卡尺寸代替概念图的示意格数；三块预告、缩放与逐层控件为可操作功能。实际引擎采用清晰的平面明暗与细线，宣传图的高光仅用于插画，不声称是实机画质。

新版素材已按 TapTap 规格导出：1024 方形图标、1920×1080 横封面、1440 方封面、3 张 720×1280 实战图、19.96 秒竖屏实录和 22.2 秒独立横屏宣传片。源录像来自正常游戏入口的真实输入，未注入棋盘；`stack-inspection-390.png` 的开发入口图仅用于内部复核。完整解码、浏览器播放证据见 `actual/video-playback.json` 与 publishing/media-manifest.json。现有素材规格来自用户上传页快照，未进行当前账号提审。


## 最终整合复验

最终 Creator 源码指纹为 `f41b255b80ef9c342a0e29d18241f4d5c7aab9507714dd52c17624be5d2181a6`；本目录素材已按该构建重新录制、导出和完整播放。四尺寸共 17 组浏览器流程通过、errors=[]，补测真实 Runtime metadata 字段的两个榜单、延迟开局取消后试玩存档隔离、失焦后暂停。榜单用例采用明确夹具，不代表公网服务已启用。

真实 Creator 缓存经 `turbo run build --env-mode=strict` 完成离线→HTTPS 启用→关闭，源码指纹与引擎资源保持一致。`run-selected-shell.mjs` 和 `run-selected-browser.mjs` 对 Tetracube 定向执行，Shell 嵌入、独立入口、返回目录、桌面和手机触屏均通过。日志为 `outputs/tetracube-clarity-{build,browser,prebuilt,shell,capture,materials}-final.log`。

观察跟手方向、跨极点与滚转映射由纯投影数学断言覆盖；浏览器真触控验证双指缩放、交接和第三指取消，未将数学检查冒充物理手机体验。控制目录迁移、历史配置兼容、真实 PostgreSQL 备份恢复与旧镜像门禁证据见 [控制面验收](../../../../../../docs/admin-console/qa/tetracube-control-2026-10-31/README.md)。生产升级、管理台启用及公网榜单验收待最终候选部署，当前不声称已经上线。
