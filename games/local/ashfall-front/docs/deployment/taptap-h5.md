# 灰烬防线 · TapTap H5 上架

本游戏使用 HTML/Canvas 与相对资源，采用 TapTap 的 H5 游戏发布形态。官方开发服务支持 H5/WEB；官方 H5 MCP 接受包含根 `index.html` 的构建目录，上传方向参数 `screenOrientation: 2` 表示横屏。

## 准备包体

在仓库根目录构建和验证：

```powershell
pnpm --filter @coffeeeeffoc/ashfall-front build
pnpm --filter @coffeeeeffoc/ashfall-front test
pnpm --filter @coffeeeeffoc/ashfall-front test:browser
New-Item -ItemType Directory -Force outputs/ashfall-front | Out-Null
Compress-Archive -Path games/local/ashfall-front/dist/* -DestinationPath outputs/ashfall-front/ashfall-front-taptap-h5.zip -Force
```

ZIP 根为 `index.html`，资源和 ES 模块路径保持相对，不包含服务器、测试、设计文档或密钥。上传目录为 `games/local/ashfall-front/dist`；如果通过官方 H5 MCP 上传，工具自己压缩该目录。ZIP 是 H5 静态包，不是原生 Tap 小游戏转换包。

## 后台发布

登录本人开发者账号，创建或选择“灰烬防线”的 H5 游戏，设置横屏。使用官方 H5 上传流程时先确认当前应用，再将上述构建目录传给 `prepare_h5_upload` / `upload_h5_game`，方向指定 `screenOrientation: 2`。旧版后台可在“游戏包管理 → 小游戏管理”上传 H5 ZIP，随后在资料页的“H5小游戏”选中该包体。填写实际版本号、简介、年龄分级和实机素材，提交审核。

简介可使用：在废墟工厂中跳跃、冲刺、方向连射，引爆连锁油桶并组合战地改装，突破拆解者的机械防线。

横屏适配使用完整容器与安全区；浏览器方向锁定失败时仍可旋转游玩。Android WebView 方向 meta 是辅助提示，TapTap 后台横屏配置才是渠道发布设置。测试包不依赖登录、服务器或外部素材，存储不可用时保留本次会话进度。

手机端主页或暂停页打开“操作指南”显示触屏说明：按住橙色射击键连射，朝目标方向拖动瞄准；向右上/右下拖即向右上/右下射击，左上/左下同理，松开停止。电脑端显示 I / J / K 单键射击说明。操作指南跟随实际触屏/键鼠输入切换；从暂停进入时不恢复战斗。

## 发布验收

上传后在真实 TapTap 手机客户端检查启动、物理横屏、竖屏兜底、同时移动/拖动瞄准/跳跃、松手与触点取消、前后台暂停、三关/改装/Boss/结算及重启存档。H5 内可保留浏览器全屏入口；这是 WebView 游戏，不套用原生 Canvas 平台的 API。当前仅完成本地生产构建与 Chromium 手机触屏模拟，不表示已上传、审核通过或真机验证。

官方依据（2026-10-13 核查）：[开发服务的 H5/WEB 形态](https://developer.taptap.cn/)、[H5 上传工具与横屏参数](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/h5Game/tools.ts)、[H5 上传与 ZIP 实现](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/h5Game/handlers.ts)。
