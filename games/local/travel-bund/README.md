# 江风入境 · 外滩漫游

基于根目录 `assets/bund` 的第一视角室外漫游。React 19 + React Three Fiber 9 + Three.js + Drei + Rapier，独立 Vite Game，通过 Shell 的同源 iframe 接入。

## 运行

在仓库根目录：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/travel-bund dev
pnpm --filter @coffeeeeffoc/travel-bund test
pnpm --filter @coffeeeeffoc/travel-bund build
pnpm --filter @coffeeeeffoc/travel-bund test:browser
pnpm --filter @coffeeeeffoc/travel-bund test:controls
pnpm --filter @coffeeeeffoc/travel-bund test:routes
```

开发/预览地址 `http://localhost:4186/`。追加 `?debug=1` 显示帧率、绘制次数、三角面数量和人物坐标。浏览器测试自动选择空闲端口；`GAME_URL` 可覆盖目标，报告位于仓库 `.scratch/travel-bund-browser/`。

## 操作

- 电脑：WASD / 方向键行走，鼠标环顾，Shift 快走（4 m/s），按住 R 疾行（12 m/s），空格跳上或跳下台阶，E 与附近地标或长椅交互，P 拍照，M 地图，Esc 暂停。鼠标锁定不可用时支持按住画面拖动转头。
- 手机：左侧摇杆行走，右侧拖动转头，可同时操作；漫步 / 快走 / 疾行三档速度按钮、跳跃、交互和拍照按钮。支持横屏和竖屏。
- 地图提供外滩、和平饭店、外白渡桥、陆家嘴滨江、上海中心五个落脚点。
- 日夜切换、空间化的车辆声与船笛、江风、脚步声、游船与车辆动画。
- 地标手记使用 `travel-bund.visits.v1` 本地保存。照片仅保留本次取景，需从手记下载到设备。
- 页面隐藏、失焦、鼠标解锁会暂停并清除输入；触摸取消不会持续行走。
- 摇杆和转头区域各由首次按下的手指控制。额外手指不会抢走控制，松开额外手指也不会停止仍在继续的移动或转头。
- 手机默认选择“流畅”：原生像素比例、256×256 水面反射、关闭动态阴影。暂停设置可选择“清晰”或“精细”，桌面默认“清晰”。
- 地图新增三条轻量探索路线：“钟楼与旧石墙”“桥边的三段故事”“三种摩天轮廓”。每条三处，走近真实地标并收入手记后才计为打卡，界面显示下一处目标；原有收藏继续计入，无时间限制。分享邀请从下一处目标附近的既有安全落脚点开始。
- 手记可保存 1080×1350 的个人漫游纪念卡，并邀请朋友走同一条路线。系统分享取消会直接结束；不支持时复制公开链接，剪贴板也不可用时显示可选中的链接。链接只保留自身 origin/path 与合法 `route=architecture|bridges|skyline`，不会携带进度或其它页面参数；重复/非法路线参数会忽略。

## 资产管线

直接引用 Git 子仓库 `assets/bund/runtime/`，无需在游戏目录复制模型。首次克隆后执行 `git submodule update --init assets`。Vite 的 `publicDir` 指向该目录，开发时读取子仓库，构建时仅打包到 `dist`；Turbo 构建输入也包含该目录，资产变更会使缓存失效。普通 CI 无需 Blender。

```powershell
& 'D:\setup\Blender\blender.exe' --background --python-exit-code 1 --python assets/bund/build.py -- --no-render
& 'D:\setup\Blender\blender.exe' --background --python-exit-code 1 --python assets/bund/export-runtime.py
```

- 198 个建筑分块，按视野和附近 180 米范围加载，每次最多请求四块，近处优先；各块有独立 Suspense，后续下载不会阻塞整个场景。已访问分块保留缓存。
- 地形、岸线和碰撞资料先加载；设施分别懒加载。碰撞数据提前存在，未加载建筑不会被穿过。
- 20 位 Draco 位置量化和对数深度缓冲保留薄立面，避免远景重叠闪烁；玻璃按房间点亮，水面使用连续波纹及平面反射。
- 道路使用实体碰撞，基础地面使用解析半空间，避免公里级盒体的扫掠精度问题。跨阶采用上方净空、水平路径、落脚点三次胶囊扫掠；空格提供主动跳跃。
- 汽车渲染跟随同一个运动学刚体，靠近行人时停车；轮胎接触沥青，车身与车顶均有碰撞。
- 静止街景按 128 米街区分别实例化，让视锥剔除远处整批物件。保留全部 572 棵树与原来的位置；车辆和游船保留连续的运动索引。
- 普通柏油路标高 0.02 米，路侧人行道 0.17 米；路口扣除步道交叠，步道模型与碰撞共用同一份几何。人行道也按空间分块懒加载，不增加首屏地形包的体积。
- 保留 OpenStreetMap 来源署名与 Draco Apache-2.0 授权。

## 验证

```powershell
pnpm --filter @coffeeeeffoc/travel-bund test
pnpm --filter @coffeeeeffoc/travel-bund build
pnpm --filter @coffeeeeffoc/travel-bund test:browser
```

规则/物理检查覆盖三档速度、多角度跨阶、跳跃落地、头顶净空、墙体与汽车阻挡、真实陆家嘴坐标下站立不下沉、资产落地与分块完整性。Chrome 回归覆盖桌面、390×844 / 844×390 触屏模拟、跳跃与疾行、双指输入与取消、五处落脚点、桥面、长椅、日夜、照片与存档、加载失败重试，并检查首屏没有请求整座城市。汽车相撞浏览器检查通过路由提供一个确定性的迎面车位，实际运动、渲染与碰撞仍使用正式代码。

报告与截图位于根目录 `.scratch/travel-bund-browser/`。真实手机的温升、持续帧率及 Safari 需真机验收。

浏览器回归支持 `PLAYWRIGHT_EXECUTABLE_PATH` 指定 Chromium，并检查三指接触时摇杆与转头仍由原手指控制。

`test:controls` 用真实 App 与 CDP 触摸事件检查横竖屏多指控制、指针捕获丢失、暂停恢复和画质设置，隔离 3D Scene，适合软件 WebGL 的云环境；它不代替完整场景的视效与性能验收。报告位于 `.scratch/travel-bund-controls/`。规则测试加载真实树 GLB，验证街区剔除保留全部位置，并使初始竖屏/桌面视锥的树三角面分别减少约 69% / 34%。

`test:routes` 同样隔离 3D Scene，在真实 App 检查附近地标收藏、路线进度、手机交互按钮可点击、实际 PNG 纪念卡下载、公开链接复制/取消/手动回退与重复参数。三条路线的九个目标另外与真实 `world.json` 校验；探索 UI 和纪念卡仅用 DOM/2D Canvas，没有新增模型或场景绘制。本轮未完整实走三条 3D 路线，实体机帧率和完整场景限制继续适用。

## 范围

当前为艺术化室外场景，建筑内部、驾驶及登船未开放。建筑碰撞采用外部体量，复杂内院需要单独制作。已加载分块在本次漫游中保留；若后续扩展到更大的城市，再增加显存淘汰策略。

当前交付支持 Web / H5 浏览器。React Three Fiber、DOM 工具栏、Pointer Lock 与 Web Audio 依赖浏览器运行环境；微信、B 站、抖音、快手原生小游戏需要独立的渲染与输入入口、资源管线及渠道验收，不能把本 Vite 产物直接标记为原生小游戏包。

## 2026-10-01 云环境验证

- 第一轮 13 项规则、物理和真实 GLB 检查通过；第二轮加入 3 项路线规则检查，共 16 项。TypeScript 检查与生产构建通过。
- 第二轮 `test:routes` 使用真实 App、隔离 3D Scene，检查共享路线不导入打卡进度、实际收集记一处、保存真实 1080×1350 PNG、取消分享不复制、手动复制入口和手机地图选线；该结果不代表完整 3D 路线走访或实体机性能验收。
- `test:controls` 的 390×844 / 844×390 真实 App 和 CDP 触摸专项通过，包含三指所有权、丢失捕获、暂停恢复、手机默认“流畅”和画质切换；3D Scene 在该专项中被隔离。
- 真实树模型的初始视锥检查保留全部 572 个位置：竖屏可见树三角面由 1,903,616 减为 589,056，桌面减为 1,257,984。该结果验证几何剔除，不等于整场景帧率达标。
- 优化后真实生产入口以手机“流畅”配置启动，控制台错误为 0，初始视角记录约 2161k–2286k 三角面、约 1 FPS。这个云环境的 SwiftShader 结果仍未达到流畅体验要求；尚无实体手机、Safari 或硬件 GPU 的性能验收。
- 本轮完整 `test:browser` 未通过：优化前的完整场景约 0 FPS、4939k 三角面，400 ms 跳跃采样断言失败。优化后重验了真实入口、静态场景截图和控件专项，未重复完成该完整实玩脚本，也未验证整站 Pages。
- 现有 `Water` 切换画质时重建内部反射目标，当前清理只处理几何与材质；多次切换的反射目标释放和显存占用仍需单独验证。

## 既有历史验收记录（本轮未重复确认）

- 12 项规则、真实坐标物理与资产检查通过，包含实际人行道与柏油路的高差、三档速度往返路沿、GLB 可见路面高度；Blender 93 个 GLB 重新导入和 3 个源文件重新打开通过。
- Chrome 桌面与横竖屏触摸回归、汽车迎面阻挡、跳跃、三档移动、加载失败重试通过，控制台错误为 0。
- Pages 构建与本机 Chrome 的整站目录、独立/内嵌入口检查通过。
- Playwright 默认的 SwiftShader 纯软件渲染在 3D 入口点击时超时，不作为目标高端设备性能证明。Windows 验证整站可沿用已有环境变量：

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm test:pages
```

资产版本由主仓库的 `assets` 子模块指针锁定。尚未发布到线上。
