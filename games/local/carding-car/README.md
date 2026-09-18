# 浪湾卡丁车

Cocos Creator 3.8.8 + TypeScript 的横屏 3D 卡丁车。微信、B站分别发布一个独立小游戏；H5 使用同一场景、驾驶规则和触控代码。

## 本地试玩

在仓库根目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/carding-car run setup
pnpm --filter @coffeeeeffoc/carding-car build
pnpm --filter @coffeeeeffoc/carding-car dev
```

打开 <http://localhost:4198>。手机连接同一局域网，使用电脑的局域网 IP 和端口 4198。`setup` 在 Windows 下载并校验官方 Creator；已有安装可设置 `COCOS_CREATOR` 指向可执行文件。首次构建会编译引擎，需要数分钟。

手机：横屏，自动加速；左侧滑动转向，右侧按住漂移或刹车。过弯时蓄力，松开漂移释放加速。键盘：Enter 开始/继续，A/D 或左右键转向，空格/左 Shift 漂移，S/下键刹车，P/Esc 暂停，M 声音，暂停或完赛后 R 重赛。

## 原生工程

复制 `release-config.example.json` 为 **Git 忽略的** `release-config.local.json`，填写各平台 AppID。也可用 `WECHAT_APP_ID`、`BILIBILI_APP_ID` 环境变量。无需 AppSecret。未提供 ID 时只能生成预览配置，不能据此宣称平台发布通过。

```powershell
pnpm --filter @coffeeeeffoc/carding-car build:wechat
node games/local/carding-car/scripts/setup.mjs --bilibili
pnpm --filter @coffeeeeffoc/carding-car build:bilibili
```

- 微信开发者工具打开 `build/wechatgame`。
- B站开发者工具打开 `build/biligame`。使用官方 `biligame-builder` 1.0.3 插件；适配下载需要访问 B站开发者服务。
- Web 产物位于 `dist`，仓库 Shell 目录中选择“浪湾卡丁车”，独立入口为 `games/carding-car/index.html`。
- CI 使用 Windows Runner 构建 Creator 产物，再交给 Linux/macOS 的检查与打包任务。产物校验源文件哈希；引擎下载缓存有固定版本和 SHA-256 校验。

## 调整与验证

`assets/scripts/KartConfig.ts` 集中配置加速、转向、抓地、漂移、两档 Boost、碰撞与镜头。纯规则模块无需 Creator 即可测试；渲染、音频、UI 使用引擎原生 API。

```powershell
pnpm --filter @coffeeeeffoc/carding-car test
pnpm --filter @coffeeeeffoc/carding-car typecheck
# 先启动上面的静态服务器
pnpm --filter @coffeeeeffoc/carding-car test:browser
pnpm check:games
```

浏览器检查通过真实键盘和多指触摸跑三圈，检查取消触摸、漂移奖励、暂停、完赛与重赛，记录截图、控制台和 FPS 到忽略目录 `reports`。`KART_URL` 可指定已构建页面；`PLAYWRIGHT_EXECUTABLE_PATH` 可指定系统 Chrome。只读 `__kart.snapshot()` 用于诊断，不提供改圈数、传送或自动完赛入口。

赛道是 Catmull-Rom 曲线生成的带状网格；护栏位置和尺寸由 `TrackBarriers` 同时供显示与碰撞使用，岔口按另一条道路的实际范围留出口。车身与护栏使用简单定向矩形的分离轴检测，车车接触使用圆形截面，均不使用复杂视觉网格作为碰撞体。四辆车共享驾驶参数。AI 根据前方曲率刹车，没有额外速度或隐藏追赶。

Rodin 资产和处理方式见 `art-source/README.md`。实测与剩余验收边界见 `playtest.md`。
