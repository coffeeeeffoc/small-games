# 原生入口验证记录

日期：2026-10-06。范围为 `startNativeCopsGame`，Canvas 矢量，无 DOM / WebView / 客户端 secret，竖屏。标准100关、接力6关、快练3关复用已有规则与地图；好友比赛沿用独立原生比赛入口，只有配置 HTTPS `apiUrl` 才显示入口。完整模式不等于平台登录、广告、排名等已验收。

## 已完成

- Node 24.21.0 `node scripts/check-native.mjs`：通过单指点按、滑出取消、touchcancel、多指不触发、resize状态保持、所有热区至少44逻辑像素、后台暂停/前台保持暂停、接力连续同人移动被拒绝及撤销恢复接力状态、真实快练解法通关及下一关、旧v3字段与三模式记录保留、冷启动继续恢复、存储失败可玩、监听清理。
- Chromium 1193，Playwright 1.56.0，真实 Canvas 测试宿主：320×568、390×844、430×844，触屏输入走通主页、选关、游玩、暂停、帮助、返回、前后台恢复。CDP实际派发多触点、滑出和touchCancel，棋盘均不变化。浏览器零异常。`home/levels/play/pause/help-actual-{320,390,430}.png` 为实际截图。
- 人工查看320小屏主页和游玩截图：图形/目标/队员编号清晰，安全区未遮挡，暂停两条分离实心竖条，单一暂停入口。对照预先绘制SVG概念稿：采用同一米白/蓝/橙色层级，实际将主页操作靠上、选关分页行数随小屏调整。
- 持久化在已加载对局时更新当前棋盘；主页后台、帮助设置和启动清理不会用初始棋盘覆盖旧中途存档。Web旧设置声音字段保持，原生触感开关独立用 `nativeHaptics`。

## 可重复命令

从游戏目录执行 `pnpm test:native`、`pnpm test:native-browser`。浏览器脚本默认使用项目 `@playwright/test` 和其Chromium；也支持 `PLAYWRIGHT_MODULE` 指向已有安装，`CHROMIUM_PATH` 指向已有浏览器。

本次隔离环境使用：

```sh
PLAYWRIGHT_MODULE=/tmp/cops-native-browser/node_modules/playwright/index.mjs \
CHROMIUM_PATH=/workspace/.cache/ms-playwright/chromium-1193/chrome-linux/chrome \
/tmp/small-games-toolchain/node_modules/.bin/node scripts/check-native-browser.mjs
```

## 验证边界

实际浏览器测试宿主是原生Canvas契约检查，不能称为官方平台或真机验收。五平台SDK、方向工程配置、AppID、官方开发者工具导入、真机安全区/胶囊、触感与生命周期以及平台审核由统一打包集成后继续验证；此处未运行。原生入口无音频素材，明确提示声音播放不可用；可选振动调用失败不影响规则与存档。标准100关不是此次逐关触屏通关，地图可达性仍由现有游戏规则检查覆盖。未配置的登录/广告/联网奖励未增加假入口或奖励。
