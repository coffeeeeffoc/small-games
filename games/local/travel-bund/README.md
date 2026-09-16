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
```

开发/预览地址 `http://localhost:4186/`。追加 `?debug=1` 显示帧率、绘制次数、三角面数量和人物坐标。浏览器测试自动选择空闲端口；`GAME_URL` 可覆盖目标，报告位于仓库 `.scratch/travel-bund-browser/`。

## 操作

- 电脑：WASD / 方向键行走，鼠标环顾，Shift 快走（4 m/s），按住 R 疾行（12 m/s），空格跳上或跳下台阶，E 与附近地标或长椅交互，P 拍照，M 地图，Esc 暂停。鼠标锁定不可用时支持按住画面拖动转头。
- 手机：左侧摇杆行走，右侧拖动转头，可同时操作；漫步 / 快走 / 疾行三档速度按钮、跳跃、交互和拍照按钮。支持横屏和竖屏。
- 地图提供外滩、和平饭店、外白渡桥、陆家嘴滨江、上海中心五个落脚点。
- 日夜切换、空间化的车辆声与船笛、江风、脚步声、游船与车辆动画。
- 地标手记使用 `travel-bund.visits.v1` 本地保存。照片仅保留本次取景，需从手记下载到设备。
- 页面隐藏、失焦、鼠标解锁会暂停并清除输入；触摸取消不会持续行走。

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

## 范围

当前为艺术化室外场景，建筑内部、驾驶及登船未开放。建筑碰撞采用外部体量，复杂内院需要单独制作。已加载分块在本次漫游中保留；若后续扩展到更大的城市，再增加显存淘汰策略。

## 本次验收记录

- 12 项规则、真实坐标物理与资产检查通过，包含实际人行道与柏油路的高差、三档速度往返路沿、GLB 可见路面高度；Blender 93 个 GLB 重新导入和 3 个源文件重新打开通过。
- Chrome 桌面与横竖屏触摸回归、汽车迎面阻挡、跳跃、三档移动、加载失败重试通过，控制台错误为 0。
- Pages 构建与本机 Chrome 的整站目录、独立/内嵌入口检查通过。
- Playwright 默认的 SwiftShader 纯软件渲染在 3D 入口点击时超时，不作为目标高端设备性能证明。Windows 验证整站可沿用已有环境变量：

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm test:pages
```

资产版本由主仓库的 `assets` 子模块指针锁定。尚未发布到线上。
