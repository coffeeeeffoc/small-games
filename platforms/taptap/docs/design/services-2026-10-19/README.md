# TapTap 小站：设计与验证

沿用象棋纸色/绿色及三款游戏大按钮的触屏尺度。首页保留游戏主操作，小站承担连接、手动上传、云档预览与确认恢复、公开榜查看、手动成绩确认；返回始终可用。竖屏单列，横屏左右两列，小横屏收紧标题区，热区保持46px，尊重安全区/胶囊。无真实实现时不呈现联机占位入口。

实现前的 `concept.html` 与 `concept-390.png`、`concept-844.png` 明确布局。`actual-h5-*.png` 是三款生产H5构建实际主页入口打开后的截图；568×320覆盖紧凑横屏。截图与概念一致，功能按钮不互相遮挡。

专项命令：

```sh
node --test platforms/taptap/tests/tap-services.test.mjs
node platforms/taptap/tests/tap-services.browser.mjs
node scripts/build-games.mjs --dry-run
```

浏览器由锁定Playwright解析，或指定 `PLAYWRIGHT_EXECUTABLE_PATH` / `CHROMIUM_PATH`。本次环境为Node24、桌面Chromium触屏模拟。专项实际走过三个 H5 入口的连接→上传→云档列表→预览→确认恢复→提交确认→原生榜调用→返回。回归涵盖账号缓存换人、无SDK/晚注入、logout迟回调、云档并发/频控/异应用、备份失败、开发试玩禁止上传、街区成绩不冒充无辅助、棋训练后已得提示保留。

接口及官方证据见 [game-services.md](../../game-services.md)。真实Tap账号、云档/榜弹层和宿主广告仍待客户端验收。

回归默认把截图写入忽略的 `outputs/taptap-services/`；仅显式设置 `TAP_SERVICES_EVIDENCE_ROOT` 时更新指定位置。历史截图不被普通测试覆盖。
