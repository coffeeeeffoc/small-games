# 浪湾卡丁车

Cocos Creator 3.8.8 + TypeScript 的横屏 3D 卡丁车。微信、B站分别发布一个独立小游戏；H5 使用同一场景、驾驶规则和触控代码。

## 本地试玩

在仓库根目录运行：

```powershell
git submodule update --init --recursive assets
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/carding-car run setup
pnpm --filter @coffeeeeffoc/carding-car build
pnpm --filter @coffeeeeffoc/carding-car dev
```

打开 <http://localhost:4198>。手机连接同一局域网，使用电脑的局域网 IP 和端口 4198。`setup` 在 Windows 下载并校验官方 Creator；已有安装可设置 `COCOS_CREATOR` 指向可执行文件。首次构建会编译引擎，需要数分钟。

手机：横屏，自动加速；左侧滑动转向，右侧按住漂移或刹车，点击右侧氮气按钮加速。按住刹车先减速，停稳后继续按住即可倒车，松开后恢复向车头方向加速。过弯时蓄力，松开漂移释放加速。电脑端按住前进键加速，松开后滑行减速。键盘：Enter 开始/继续，W/上键前进，A/D 或左右键转向，空格漂移，左/右 Shift 氮气加速，S/下键刹车及倒车，P/Esc 暂停，M 声音，暂停或完赛后 R 重赛。允许掉头逆行，停车、逆行和近道碰墙不会自动复位；镜头平滑跟随车头。

氮气每次加速 1.5 秒，冷却 6 秒；按一次触发，长按不会连续消耗。按钮显示剩余冷却时间，冲刺带尾焰、镜头拉伸及音效。首次按键或触摸后启动声音，可用 M 或右上角声音按钮静音。

比赛中常驻显示总用时、本圈用时和最快圈；结算显示四车名次，并保留本机最快五次完赛成绩。旧版本最佳总用时会自动迁入本机榜单。暂停可直接重新开跑；暂停、切后台和触控取消会清空操作及未释放的漂移蓄力。

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
node games/local/carding-car/tests/steering.mjs
node games/local/carding-car/tests/walls.mjs
node games/local/carding-car/tests/reverse.mjs
node games/local/carding-car/tests/audio-nitro.mjs
pnpm check:games
```

浏览器检查通过真实键盘和多指触摸跑三圈，检查取消触摸、漂移奖励、暂停、完赛与重赛，记录截图、控制台和 FPS 到忽略目录 `reports`。`KART_URL` 可指定已构建页面；`PLAYWRIGHT_EXECUTABLE_PATH` 可指定系统 Chrome。只读 `__kart.snapshot()` 用于诊断，不提供改圈数、传送或自动完赛入口。

浏览器检查会核对构建源码哈希，修改源码后需先重新构建；同时检查本机榜单重载、损坏存储恢复和 360px/390px 竖屏切换。驾驶线路由诊断快照提供方向建议，通过真实输入执行，不代表人类首次试玩成绩。

赛道是 Catmull-Rom 曲线生成的带状网格；护栏位置和尺寸由 `TrackBarriers` 同时供显示与碰撞使用，岔口按另一条道路的实际范围留出口。车身与护栏使用简单定向矩形的分离轴检测，车车接触使用圆形截面，均不使用复杂视觉网格作为碰撞体。四辆车共享驾驶参数。AI 根据前方曲率刹车，没有额外速度或隐藏追赶。

Rodin 资产和处理方式见 `art-source/README.md`。实测与剩余验收边界见 `playtest.md`。

当前场景使用独立子模块 `assets/carding-car/runtime` 的橙白赛车、棕榈树、阔叶树、礁石、灯塔和沥青贴图。先执行 `git submodule update --init --recursive assets`；三端构建自动同步运行文件到忽略目录 `assets/resources/seaside`，只提交稳定的 Creator `.meta`，无需重复提交模型或安装 Python。源文件哈希包含素材子模块中的运行文件，因此更换素材后必须重新构建。

微信与 B站通过 Creator 的 `seaside-art` 配置将 `resources` 导出为本地小游戏分包；启动时由引擎预加载。构建会检查分包存在、主包不超过 4 MiB、总包不超过 20 MiB。Web 仍使用本地资源目录，不需要素材 CDN。

赛车使用 1024px、重复植物/礁石使用 512px 预着色贴图，共享网格与材质；赛车原始单网格尚不支持车轮独立旋转。弯道保留样条道路，路肩和护栏从素材库几何按 `TrackBarriers` 的实际范围缩放合批，碰撞仍使用原有简单形状。重制运行素材用 `python assets/carding-car/build-mobile.py`（Pillow 仅在重制时需要）。
