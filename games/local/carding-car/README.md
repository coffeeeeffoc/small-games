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

开跑前可选择原海湾及城市、沙漠、冰川、跨海高速、七彩丹霞、高原与高山、青藏草原七套新场景，以及十款车、十位车手。点击选择行左右侧切换；键盘 1 / 2 / 3 分别切换场景 / 车型 / 车手，Shift 加对应数字反向切换。暂停或完赛后点击“返回车库”或按 G 返回选择。选择保存在本机，各场景分别记录成绩；素材加载完成后才能开跑。

每场比赛沿道路随机放置 24 个道具，覆盖加速板、氮气、路障、西瓜皮、油渍、冰冻球、护盾、磁铁、弹簧板、修理箱、金币和随机补给箱。接触后自动生效，带文字、声音和车辆反馈；护盾挡一次障碍，磁铁扩大补给吸取范围，西瓜皮使车身旋转，弹簧板让车跃起。道具有重现间隔，重赛重新排列。

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
node games/local/carding-car/tests/worlds.mjs
node games/local/carding-car/tests/glacier-browser.mjs
pnpm check:games
```

浏览器检查通过真实键盘和多指触摸跑三圈，检查取消触摸、漂移奖励、暂停、完赛与重赛，记录截图、控制台和 FPS 到忽略目录 `reports`。`KART_URL` 可指定已构建页面；`PLAYWRIGHT_EXECUTABLE_PATH` 可指定系统 Chrome。只读 `__kart.snapshot()` 用于诊断，不提供改圈数、传送或自动完赛入口。

浏览器检查会核对构建源码哈希，修改源码后需先重新构建；同时检查本机榜单重载、损坏存储恢复和 360px/390px 竖屏切换。驾驶线路由诊断快照提供方向建议，通过真实输入执行，不代表人类首次试玩成绩。

赛道是 Catmull-Rom 曲线生成的带状网格；护栏位置和尺寸由 `TrackBarriers` 同时供显示与碰撞使用，岔口按另一条道路的实际范围留出口。车身与护栏使用简单定向矩形的分离轴检测，车车接触使用圆形截面，均不使用复杂视觉网格作为碰撞体。四辆车共享驾驶参数。AI 根据前方曲率刹车，没有额外速度或隐藏追赶。

Rodin 资产和处理方式见 `art-source/README.md`。实测与剩余验收边界见 `playtest.md`。

冰川整圈约 1.23 公里使用连续冰壁/厚雪、橙白护栏、科考站、环绕雪山与独立冰雪路面，72 米、全程 40% 和 74% 处设三座蓝冰拱桥。冰壁约每 88 米合批，交由引擎剔除视野外几何；闭合道路和护栏沿用物理赛道数据。复用原有冰纹，道路纹理来自素材子仓库 `glacier-sample/road.jpg`（原图保留为 PNG）。有法线的网格使用 Cocos 标准材质、环境反射、太阳阴影和距离雾，切换场景释放临时资源并恢复天空/阴影设置，不使用真实冰体折射。所有场景的 12 类道路道具统一放大 30%，提升手机视角辨识度。

扩展源素材统一放在独立子仓库 [`assets/carding-car/expansion`](../../../assets/carding-car/expansion/README.md)。其 [`runtime-expansion`](../../../assets/carding-car/runtime-expansion/README.md) 衍生版已接入：7 个环境地标、10 辆车、10 位坐姿车手、12 个道具，以及 8 类独立周边模型。场景定义在 `assets/scripts/scenes/`，提供不同路线、环境配色、地标与路边布景，物理赛道仍由统一曲线和护栏模块生成。原始地块只作远景，不当作可驾驶路面。

构建自动把扩展运行文件复制到 Git 忽略的 `assets/resources/expansion/`；只提交 Creator `.meta`，运行文件仍由子仓库管理。重新导出使用 `python assets/carding-car/build-expansion.py`，仅检查使用 `--check`。车手采用原头盔贴图与独立坐姿部件，封闭车型的运行版做驾驶舱开口；当前车轮未独立拆分、车手没有骨骼动画。

原海湾场景继续使用独立子模块 `assets/carding-car/runtime` 的棕榈树、阔叶树、礁石、灯塔和沥青贴图，赛车改为所选扩展车型。先执行 `git submodule update --init --recursive assets`；三端构建自动同步运行文件到忽略目录 `assets/resources/seaside`，只提交稳定的 Creator `.meta`，无需重复提交模型或安装 Python。源文件哈希包含素材子模块中的运行文件，因此更换素材后必须重新构建。

微信与 B站通过 Creator 的 `seaside-art` 配置将 `resources` 导出为本地小游戏分包；启动时由引擎预加载。构建会检查分包存在、主包不超过 4 MiB、总包不超过 20 MiB。Web 仍使用本地资源目录，不需要素材 CDN。

赛车使用 1024px、重复植物/礁石使用 512px 预着色贴图，共享网格与材质；赛车原始单网格尚不支持车轮独立旋转。弯道保留样条道路，路肩和护栏从素材库几何按 `TrackBarriers` 的实际范围缩放合批，碰撞仍使用原有简单形状。重制运行素材用 `python assets/carding-car/build-mobile.py`（Pillow 仅在重制时需要）。
